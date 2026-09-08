import { z } from 'zod';
import { staging, setting, AppError, db } from './config';
import {
  canonicalDraft,
  type Draft,
  type Locale,
} from '../../src/features/copilot/contracts';
import type { Actor } from './store';
export interface ClynectAdapter {
  saveDraft(
    actor: Actor,
    draft: Draft,
    actionId: string,
  ): Promise<{ id: string; url: string; private: true }>;
  pricing(
    actor: Actor,
    locale: Locale,
  ): Promise<{
    text: string;
    source: {
      id: string;
      title: string;
      version: string;
      content: string;
      approved: boolean;
    };
  }>;
  matches(
    actor: Actor,
    draft: Draft,
  ): Promise<{ items: unknown[]; fixture: boolean; message: string }>;
  handoff(
    actor: Actor,
    input: {
      id: string;
      locale: Locale;
      turns: unknown[];
      objectId: string | null;
    },
  ): Promise<{ id: string; status: string }>;
}
const stagingAdapter: ClynectAdapter = {
  async saveDraft(a, d) {
    await db()
      .prepare(
        'INSERT INTO copilot_drafts (id,owner,tenant,kind,body,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body,updated_at=excluded.updated_at WHERE copilot_drafts.owner=excluded.owner AND copilot_drafts.tenant=excluded.tenant',
      )
      .bind(
        d.id,
        a.id,
        a.tenant,
        d.kind,
        JSON.stringify({
          ...canonicalDraft(d),
          owner_id: a.id,
          company_id: a.tenant,
        }),
        new Date().toISOString(),
      )
      .run();
    return { id: d.id, url: `/?draft=${d.id}`, private: true };
  },
  async pricing(_a, locale) {
    const text =
      locale === 'fr'
        ? 'Les tarifs actifs ne sont pas connectés à cet environnement. Je ne peux pas confirmer un prix. Vous pouvez préparer une demande au support.'
        : 'Active pricing is not connected in this environment. I cannot verify a price. You can prepare a support request.';
    return {
      text,
      source: {
        id: 'pricing-unavailable',
        title:
          locale === 'fr'
            ? 'Tarification · service non connecté'
            : 'Pricing · service not connected',
        version: new Date().toISOString().slice(0, 10),
        content: text,
        approved: false,
      },
    };
  },
  async matches(_a, d) {
    return {
      items: [],
      fixture: true,
      message:
        d.locale === 'fr'
          ? 'Aucun service de matching n’est connecté. Aucun résultat réel n’est disponible.'
          : 'No matching service is connected. No real results are available.',
    };
  },
  async handoff(a, input) {
    await db()
      .prepare(
        'INSERT OR IGNORE INTO copilot_handoffs (id,owner,body,created_at) VALUES (?,?,?,?)',
      )
      .bind(input.id, a.id, JSON.stringify(input), new Date().toISOString())
      .run();
    return { id: input.id, status: 'staging_recorded_not_sent' };
  },
};
async function upstream(path: string, a: Actor, body: unknown, key?: string) {
  const base = setting('CLYNECT_API_BASE_URL');
  if (!base.startsWith('https://') || !setting('CLYNECT_API_TOKEN'))
    throw new AppError('INTEGRATION_UNAVAILABLE', 503);
  const r = await fetch(`${base}/copilot/${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${setting('CLYNECT_API_TOKEN')}`,
      ...(key ? { 'idempotency-key': key } : {}),
    },
    body: JSON.stringify({
      actor: { id: a.id, tenant: a.tenant, role: a.role },
      input: body,
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw new AppError('INTEGRATION_UNAVAILABLE', 503);
  return r.json();
}
const productionAdapter: ClynectAdapter = {
  async saveDraft(a, d, key) {
    return z
      .object({
        id: z.string(),
        url: z.string().refine((v) => v.startsWith('/') && !v.startsWith('//')),
        private: z.literal(true),
      })
      .parse(await upstream('drafts', a, canonicalDraft(d), key));
  },
  async pricing(a, locale) {
    return z
      .object({
        text: z.string(),
        source: z.object({
          id: z.string(),
          title: z.string(),
          version: z.string(),
          content: z.string(),
          approved: z.literal(true),
        }),
      })
      .parse(await upstream('pricing', a, { locale }));
  },
  async matches() {
    throw new AppError('INTEGRATION_UNAVAILABLE', 503);
  },
  async handoff(a, input) {
    return z
      .object({ id: z.string(), status: z.literal('created') })
      .parse(await upstream('support', a, input, input.id));
  },
};
export function adapter(): ClynectAdapter {
  return staging() ? stagingAdapter : productionAdapter;
}
