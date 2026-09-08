import { z } from 'zod';
import { db, staging, setting, AppError } from './config';
import type { Actor } from './store';
const roles = z.enum(['anonymous', 'business', 'talent', 'project']);
const identitySchema = z.object({
  id: z.string().min(1),
  tenant: z.string().min(1),
  authenticated: z.literal(true),
  role: roles,
  roles: z.array(roles),
  capabilities: z.array(z.string()),
  locale: z.enum(['fr', 'en']),
  displayName: z.string(),
});
export async function actor(request: Request): Promise<Actor> {
  if (!staging()) {
    const base = setting('CLYNECT_API_BASE_URL');
    if (!base.startsWith('https://') || !setting('CLYNECT_API_TOKEN'))
      throw new AppError('AUTH_UNAVAILABLE', 503);
    const response = await fetch(`${base}/copilot/context`, {
      headers: {
        authorization: `Bearer ${setting('CLYNECT_API_TOKEN')}`,
        'x-clynect-session': request.headers.get('cookie') ?? '',
      },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new AppError('SIGN_IN_REQUIRED', 401);
    const data = identitySchema.parse(await response.json());
    if (!data.roles.includes(data.role)) throw new AppError('FORBIDDEN', 403);
    return data;
  }
  const id = request.headers
    .get('cookie')
    ?.match(/(?:^|;\s*)cly_session=([a-f0-9-]{36})(?:;|$)/)?.[1];
  if (!id) throw new AppError('SESSION_REQUIRED', 401);
  const s = await db()
    .prepare('SELECT * FROM copilot_sessions WHERE id=? AND expires_at>?')
    .bind(id, Date.now())
    .first<{
      id: string;
      authenticated: number;
      role: Actor['role'];
      locale: 'fr' | 'en';
    }>();
  if (!s) throw new AppError('SESSION_REQUIRED', 401);
  return {
    id: s.id,
    tenant: `staging-${s.id}`,
    authenticated: !!s.authenticated,
    role: s.role,
    roles: ['business', 'talent', 'project'],
    locale: s.locale,
    displayName: s.authenticated ? 'Demo' : 'Visitor',
    capabilities: !s.authenticated
      ? []
      : [
          'get_user_context',
          'search_clynect_knowledge',
          'get_current_pricing',
          'create_support_handoff',
          'record_copilot_feedback',
          ...(s.role === 'talent'
            ? ['save_profile_draft', 'search_matching_missions']
            : ['save_mission_draft', 'search_matching_profiles']),
        ],
  };
}
export function checkOrigin(r: Request) {
  const origin = r.headers.get('origin');
  if (!origin || origin !== new URL(r.url).origin)
    throw new AppError('BAD_ORIGIN', 403);
  if (r.headers.get('sec-fetch-site') === 'cross-site')
    throw new AppError('BAD_ORIGIN', 403);
}
export async function bootstrap(request: Request) {
  try {
    return { actor: await actor(request), cookie: null };
  } catch (error) {
    if (
      !staging() ||
      !(error instanceof AppError) ||
      error.code !== 'SESSION_REQUIRED'
    )
      throw error;
    const id = crypto.randomUUID();
    await db()
      .prepare(
        'INSERT INTO copilot_sessions (id,authenticated,role,locale,expires_at) VALUES (?,0,?,?,?)',
      )
      .bind(id, 'anonymous', 'fr', Date.now() + 7 * 86400000)
      .run();
    const cookie = `cly_session=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`;
    const headers = new Headers(request.headers);
    headers.set('cookie', `cly_session=${id}`);
    return {
      actor: await actor(new Request(request.url, { headers })),
      cookie,
    };
  }
}
