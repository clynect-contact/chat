import { z } from 'zod';
import {
  actionSchema,
  respondSchema,
  localeSchema,
  roleSchema,
  fieldSchema,
  parseField,
  completeDraft,
  type Conversation,
  type Session,
} from '../../../../src/features/copilot/contracts';
import { actor, bootstrap, checkOrigin } from '../../../../server/copilot/auth';
import {
  db,
  assert,
  AppError,
  setting,
  staging,
  providerMode,
} from '../../../../server/copilot/config';
import {
  getConversation,
  saveConversation,
  audit,
  hash,
} from '../../../../server/copilot/store';
import { authorize } from '../../../../server/copilot/policy';
import { adapter } from '../../../../server/copilot/adapters';
import { extractDocument } from '../../../../server/copilot/files';
import { respond } from '../../../../server/copilot/orchestrator';
const headers = {
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'same-origin',
};
const json = (
  value: unknown,
  status = 200,
  extra: Record<string, string> = {},
) => Response.json(value, { status, headers: { ...headers, ...extra } });
async function readJson(r: Request) {
  const text = await readBounded(r, 100000);
  try {
    return JSON.parse(new TextDecoder().decode(text));
  } catch {
    throw new AppError('INVALID_REQUEST');
  }
}
async function readBounded(r: Request, max: number) {
  assert(
    Number(r.headers.get('content-length') ?? 0) <= max,
    'FILE_TOO_LARGE',
    413,
  );
  const reader = r.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const x = await reader.read();
    if (x.done) break;
    size += x.value.length;
    if (size > max) {
      await reader.cancel();
      throw new AppError('FILE_TOO_LARGE', 413);
    }
    chunks.push(x.value);
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const part of chunks) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
function failure(e: unknown) {
  if (e instanceof AppError) return json({ error: e.code }, e.status);
  if (e instanceof z.ZodError) return json({ error: 'INVALID_REQUEST' }, 400);
  return json({ error: 'SERVER_ERROR' }, 500);
}
export async function GET(r: Request) {
  try {
    assert(setting('COPILOT_ENABLED', 'true') === 'true', 'DISABLED', 503);
    const path = new URL(r.url).pathname.split('/').pop();
    if (path === 'session') {
      const result = await bootstrap(r);
      const a = result.actor;
      const session: Session = {
        authenticated: a.authenticated,
        role: a.role,
        roles: a.roles,
        locale: a.locale,
        capabilities: a.capabilities,
        displayName: a.displayName,
        copilotName: setting('COPILOT_NAME', 'Cly'),
        mode: staging() ? 'staging' : 'production',
        provider: providerMode(),
      };
      return json(
        session,
        200,
        result.cookie ? { 'set-cookie': result.cookie } : {},
      );
    }
    const a = await actor(r);
    if (path === 'conversations') {
      const rows = await db()
        .prepare(
          'SELECT body FROM copilot_conversations WHERE owner=? AND tenant=? ORDER BY updated_at DESC LIMIT 50',
        )
        .bind(a.id, a.tenant)
        .all<{ body: string }>();
      return json(rows.results.map((x) => JSON.parse(x.body)));
    }
    if (path === 'drafts') {
      assert(a.authenticated, 'SIGN_IN_REQUIRED', 401);
      const rows = await db()
        .prepare(
          'SELECT id,kind,body,updated_at FROM copilot_drafts WHERE owner=? AND tenant=? ORDER BY updated_at DESC',
        )
        .bind(a.id, a.tenant)
        .all();
      return json(rows.results);
    }
    throw new AppError('NOT_FOUND', 404);
  } catch (e) {
    return failure(e);
  }
}
export async function POST(r: Request) {
  try {
    checkOrigin(r);
    assert(setting('COPILOT_ENABLED', 'true') === 'true', 'DISABLED', 503);
    const path = new URL(r.url).pathname.split('/').pop();
    const a = await actor(r);
    if (path === 'session') {
      assert(staging(), 'FORBIDDEN', 403);
      const input = z
        .object({
          role: roleSchema,
          locale: localeSchema,
          signIn: z.boolean().optional(),
        })
        .strict()
        .parse(await readJson(r));
      const authenticated = input.signIn === true ? 1 : Number(a.authenticated);
      await db()
        .prepare(
          'UPDATE copilot_sessions SET role=?,locale=?,authenticated=? WHERE id=?',
        )
        .bind(input.role, input.locale, authenticated, a.id)
        .run();
      return json({ ok: true });
    }
    if (path === 'conversations') {
      const input = z
        .object({ role: roleSchema, locale: localeSchema })
        .strict()
        .parse(await readJson(r));
      assert(
        !a.authenticated ||
          a.roles.includes(input.role) ||
          input.role === 'anonymous',
        'FORBIDDEN',
        403,
      );
      const c: Conversation = {
        id: crypto.randomUUID(),
        role: input.role,
        locale: input.locale,
        title: '',
        messages: [],
        draft: null,
        version: 0,
        updatedAt: new Date().toISOString(),
      };
      await db()
        .prepare(
          'INSERT INTO copilot_conversations (id,owner,tenant,role,body,version,updated_at) VALUES (?,?,?,?,?,0,?)',
        )
        .bind(c.id, a.id, a.tenant, c.role, JSON.stringify(c), c.updatedAt)
        .run();
      return json(c);
    }
    if (path === 'files') {
      assert(
        setting('COPILOT_UPLOAD_ENABLED', 'true') === 'true',
        'DISABLED',
        503,
      );
      const max =
        Math.min(10, Number(setting('COPILOT_MAX_FILE_MB', '10'))) *
        1024 *
        1024;
      const bytes = await readBounded(r, max + 100000);
      const form = await new Request(r.url, {
        method: 'POST',
        headers: { 'content-type': r.headers.get('content-type') ?? '' },
        body: bytes,
      }).formData();
      assert(form.get('consent') === 'true', 'UPLOAD_CONSENT_REQUIRED', 403);
      const file = form.get('file');
      assert(file instanceof File, 'INVALID_FILE');
      assert(file.size <= max, 'FILE_TOO_LARGE', 413);
      const purpose = z.enum(['mission', 'profile']).parse(form.get('purpose'));
      const recent = await db()
        .prepare(
          'SELECT COUNT(*) AS n FROM copilot_files WHERE owner=? AND created_at>?',
        )
        .bind(a.id, new Date(Date.now() - 3600000).toISOString())
        .first<{ n: number }>();
      assert((recent?.n ?? 0) < 10, 'RATE_LIMIT', 429);
      const text = await extractDocument(
        new Uint8Array(await file.arrayBuffer()),
        file.name,
        file.type,
      );
      const id = crypto.randomUUID(),
        now = new Date().toISOString();
      const retention = Math.min(
        30,
        Math.max(1, Number(setting('COPILOT_RETENTION_DAYS', '7'))),
      );
      await db().batch([
        db()
          .prepare(
            'INSERT INTO copilot_files (id,owner,tenant,purpose,name,content_type,size,extracted_text,created_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
          )
          .bind(
            id,
            a.id,
            a.tenant,
            purpose,
            file.name.slice(0, 200),
            file.type,
            file.size,
            text,
            now,
            Date.now() + retention * 86400000,
          ),
        db()
          .prepare(
            'INSERT INTO copilot_consents (id,owner,purpose,object_id,created_at) VALUES (?,?,?,?,?)',
          )
          .bind(crypto.randomUUID(), a.id, 'upload_and_parse', id, now),
        db()
          .prepare('DELETE FROM copilot_files WHERE expires_at<?')
          .bind(Date.now()),
      ]);
      await audit(a, 'document_uploaded', {
        purpose,
        type: file.name.split('.').pop(),
        sizeBand: file.size > 1000000 ? 'large' : 'small',
      });
      return json({ id, name: file.name, characters: text.length, purpose });
    }
    if (path === 'respond') {
      const input = respondSchema.parse(await readJson(r));
      const c = await getConversation(input.conversationId, a);
      assert(c.role === a.role || !a.authenticated, 'ROLE_CHANGED', 409);
      c.locale = input.locale;
      const inputHash = await hash(input);
      const prior = await db()
        .prepare('SELECT * FROM copilot_requests WHERE id=?')
        .bind(input.requestId)
        .first<{
          owner: string;
          status: string;
          input_hash: string;
          created_at: string;
        }>();
      if (prior) {
        assert(
          prior.owner === a.id && prior.input_hash === inputHash,
          'IDEMPOTENCY_CONFLICT',
          409,
        );
        if (prior.status === 'done') return json({ conversation: c });
        assert(
          prior.status !== 'pending' ||
            Date.now() - Date.parse(prior.created_at) > 60000,
          'BUSY',
          409,
        );
        await db()
          .prepare(
            'UPDATE copilot_requests SET status=?,created_at=? WHERE id=?',
          )
          .bind('pending', new Date().toISOString(), input.requestId)
          .run();
      } else {
        const cutoff = new Date(Date.now() - 3600000).toISOString();
        const inserted = await db()
          .prepare(
            'INSERT INTO copilot_requests (id,owner,conversation_id,input_hash,status,created_at) SELECT ?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM copilot_requests WHERE owner=? AND created_at>?)<? AND (SELECT COUNT(*) FROM copilot_requests WHERE created_at>?)<?',
          )
          .bind(
            input.requestId,
            a.id,
            c.id,
            inputHash,
            'pending',
            new Date().toISOString(),
            a.id,
            cutoff,
            Number(setting('COPILOT_MAX_TURNS_PER_HOUR', '40')),
            cutoff,
            Number(setting('COPILOT_GLOBAL_TURNS_PER_HOUR', '500')),
          )
          .run();
        assert(inserted.meta.changes, 'RATE_LIMIT', 429);
      }
      const attachments: { id: string; text: string }[] = [];
      try {
        for (const id of input.attachmentIds) {
          const file = await db()
            .prepare(
              'SELECT extracted_text,purpose FROM copilot_files WHERE id=? AND owner=? AND tenant=? AND expires_at>?',
            )
            .bind(id, a.id, a.tenant, Date.now())
            .first<{ extracted_text: string; purpose: string }>();
          assert(file, 'NOT_FOUND', 404);
          assert(
            file.purpose === (c.role === 'talent' ? 'profile' : 'mission'),
            'INVALID_FILE',
          );
          attachments.push({ id, text: file.extracted_text });
        }
        if (!c.messages.some((m) => m.id === input.requestId)) {
          c.messages.push({
            id: input.requestId,
            role: 'user',
            text: input.message,
            createdAt: new Date().toISOString(),
          });
          c.title ||= input.message.slice(0, 75);
          await saveConversation(c, a, c.version);
        }
      } catch (e) {
        await db()
          .prepare('UPDATE copilot_requests SET status=? WHERE id=?')
          .bind('failed', input.requestId)
          .run();
        throw e;
      }
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          let closed = false;
          const emit = (event: string, data: unknown) => {
            if (!closed)
              try {
                controller.enqueue(
                  encoder.encode(
                    `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
                  ),
                );
              } catch {
                closed = true;
              }
          };
          try {
            emit('tool.pending', { tool: 'understand' });
            await respond(c, a, input.message, attachments, emit, r.signal);
            await saveConversation(c, a, c.version);
            await db()
              .prepare('UPDATE copilot_requests SET status=? WHERE id=?')
              .bind('done', input.requestId)
              .run();
            emit('done', { conversation: c });
          } catch (e) {
            await db()
              .prepare('UPDATE copilot_requests SET status=? WHERE id=?')
              .bind('failed', input.requestId)
              .run();
            await audit(a, 'provider_or_tool_failure', {
              code: e instanceof AppError ? e.code : 'PROVIDER_FAILURE',
            });
            emit('error', {
              error: e instanceof AppError ? e.code : 'PROVIDER_FAILURE',
            });
          } finally {
            if (!closed)
              try {
                controller.close();
              } catch {}
          }
        },
      });
      return new Response(stream, {
        headers: {
          ...headers,
          'content-type': 'text/event-stream',
          connection: 'keep-alive',
        },
      });
    }
    if (path === 'edit') {
      const input = z
        .object({
          conversationId: z.uuid(),
          revision: z.number().int(),
          field: fieldSchema,
          value: z.string().max(6000),
        })
        .strict()
        .parse(await readJson(r));
      const c = await getConversation(input.conversationId, a);
      assert(c.draft, 'NOT_FOUND', 404);
      assert(c.draft.revision === input.revision, 'CONFLICT', 409);
      assert(!a.authenticated || c.role === a.role, 'ROLE_CHANGED', 409);
      c.draft.fields[input.field] = parseField(input.field, input.value);
      c.draft.evidence = c.draft.evidence.filter(
        (x) => x.field !== input.field,
      );
      c.draft.evidence.push({
        field: input.field,
        quote: input.value.slice(0, 3000),
        source: 'review',
        origin: 'user',
      });
      c.draft.suggestions_to_confirm = c.draft.suggestions_to_confirm.filter(
        (x) => x !== input.field,
      );
      c.draft.unsupported_fields = c.draft.unsupported_fields.filter(
        (x) => x !== input.field,
      );
      c.draft.revision++;
      c.draft = completeDraft(c.draft);
      await saveConversation(c, a, c.version);
      return json(c);
    }
    if (path === 'actions') {
      const action = actionSchema.parse(await readJson(r));
      const c = await getConversation(action.conversationId, a);
      authorize(a, action, c);
      if (
        action.tool.startsWith('save_') ||
        action.tool === 'create_support_handoff'
      )
        assert(
          setting('COPILOT_WRITE_TOOLS_ENABLED', 'false') === 'true',
          'WRITE_DISABLED',
          403,
        );
      const inputHash = await hash(action);
      const prior = await db()
        .prepare('SELECT * FROM copilot_tool_runs WHERE id=?')
        .bind(action.actionId)
        .first<{
          owner: string;
          input_hash: string;
          status: string;
          result: string | null;
          created_at: string;
        }>();
      if (prior) {
        assert(
          prior.owner === a.id && prior.input_hash === inputHash,
          'IDEMPOTENCY_CONFLICT',
          409,
        );
        if (prior.status === 'done') return json(JSON.parse(prior.result!));
        assert(
          prior.status !== 'pending' ||
            Date.now() - Date.parse(prior.created_at) > 30000,
          'BUSY',
          409,
        );
      } else
        await db()
          .prepare(
            'INSERT INTO copilot_tool_runs (id,owner,tool,input_hash,status,created_at) VALUES (?,?,?,?,?,?)',
          )
          .bind(
            action.actionId,
            a.id,
            action.tool,
            inputHash,
            'pending',
            new Date().toISOString(),
          )
          .run();
      try {
        let result: unknown;
        if (action.tool.startsWith('save_')) {
          assert(
            setting('COPILOT_WRITE_TOOLS_ENABLED', 'false') === 'true',
            'WRITE_DISABLED',
            403,
          );
          assert(c.draft, 'NOT_FOUND', 404);
          assert(
            c.draft.kind ===
              (action.tool === 'save_mission_draft' ? 'mission' : 'profile'),
            'FORBIDDEN',
            403,
          );
          c.draft.user_confirmed_at = new Date().toISOString();
          result = await adapter().saveDraft(a, c.draft, action.actionId);
          c.draft.saved_revision = c.draft.revision;
          await saveConversation(c, a, c.version);
          await audit(a, 'draft_saved', {
            kind: c.draft.kind,
            completeness: c.draft.completeness_score,
          });
          result = { ...(result as object), conversation: c };
        } else if (action.tool === 'create_support_handoff') {
          result = await adapter().handoff(a, {
            id: action.actionId,
            locale: c.locale,
            turns: c.messages.slice(-5),
            objectId: c.draft?.id ?? null,
          });
          await db()
            .prepare(
              'INSERT OR IGNORE INTO copilot_consents (id,owner,purpose,object_id,created_at) VALUES (?,?,?,?,?)',
            )
            .bind(
              action.actionId,
              a.id,
              'transcript_handoff',
              c.id,
              new Date().toISOString(),
            )
            .run();
        } else if (action.tool === 'get_current_pricing')
          result = await adapter().pricing(a, c.locale);
        else {
          assert(c.draft, 'NOT_FOUND', 404);
          result = await adapter().matches(a, c.draft);
        }
        await db()
          .prepare('UPDATE copilot_tool_runs SET status=?,result=? WHERE id=?')
          .bind('done', JSON.stringify(result), action.actionId)
          .run();
        return json(result);
      } catch (e) {
        await db()
          .prepare('UPDATE copilot_tool_runs SET status=? WHERE id=?')
          .bind('failed', action.actionId)
          .run();
        throw e;
      }
    }
    if (path === 'feedback') {
      const input = z
        .object({
          conversationId: z.uuid(),
          messageId: z.uuid(),
          helpful: z.boolean(),
        })
        .strict()
        .parse(await readJson(r));
      const c = await getConversation(input.conversationId, a);
      assert(
        c.messages.some((m) => m.id === input.messageId),
        'NOT_FOUND',
        404,
      );
      await audit(a, 'answer_feedback', {
        messageId: input.messageId,
        helpful: input.helpful,
      });
      return json({ ok: true });
    }
    if (path === 'delete') {
      const input = z
        .object({ conversationId: z.uuid() })
        .strict()
        .parse(await readJson(r));
      await getConversation(input.conversationId, a);
      await db().batch([
        db()
          .prepare(
            'DELETE FROM copilot_conversations WHERE id=? AND owner=? AND tenant=?',
          )
          .bind(input.conversationId, a.id, a.tenant),
        db()
          .prepare(
            'DELETE FROM copilot_requests WHERE conversation_id=? AND owner=?',
          )
          .bind(input.conversationId, a.id),
      ]);
      return json({ ok: true });
    }
    throw new AppError('NOT_FOUND', 404);
  } catch (e) {
    return failure(e);
  }
}
