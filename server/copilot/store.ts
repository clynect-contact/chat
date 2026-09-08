import { db, AppError } from './config';
import type { Conversation } from '../../src/features/copilot/contracts';
export type Actor = {
  id: string;
  tenant: string;
  authenticated: boolean;
  role: 'anonymous' | 'business' | 'talent' | 'project';
  roles: ('anonymous' | 'business' | 'talent' | 'project')[];
  capabilities: string[];
  locale: 'fr' | 'en';
  displayName: string;
};
export async function getConversation(
  id: string,
  a: Actor,
): Promise<Conversation> {
  const row = await db()
    .prepare(
      'SELECT body FROM copilot_conversations WHERE id=? AND owner=? AND tenant=?',
    )
    .bind(id, a.id, a.tenant)
    .first<{ body: string }>();
  if (!row) throw new AppError('NOT_FOUND', 404);
  return JSON.parse(row.body);
}
export async function saveConversation(
  c: Conversation,
  a: Actor,
  expected: number,
) {
  c.updatedAt = new Date().toISOString();
  c.version = expected + 1;
  const r = await db()
    .prepare(
      'UPDATE copilot_conversations SET body=?, version=?, updated_at=? WHERE id=? AND owner=? AND tenant=? AND version=?',
    )
    .bind(
      JSON.stringify(c),
      c.version,
      c.updatedAt,
      c.id,
      a.id,
      a.tenant,
      expected,
    )
    .run();
  if (!r.meta.changes) throw new AppError('CONFLICT', 409);
}
export async function audit(
  a: Actor,
  event: string,
  metadata: Record<string, unknown> = {},
) {
  await db()
    .prepare(
      'INSERT INTO copilot_events (id,owner,event,metadata,created_at) VALUES (?,?,?,?,?)',
    )
    .bind(
      crypto.randomUUID(),
      a.id,
      event,
      JSON.stringify(metadata),
      new Date().toISOString(),
    )
    .run();
}
export async function hash(value: unknown) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(JSON.stringify(value)),
      ),
    ),
  )
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
}
