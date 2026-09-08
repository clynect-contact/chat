import { env } from 'cloudflare:workers';
export function setting(key: string, fallback = '') {
  const value =
    (env as unknown as Record<string, unknown>)[key] ??
    process.env[key] ??
    fallback;
  return typeof value === 'string'
    ? value
    : typeof value === 'number' || typeof value === 'boolean'
      ? String(value)
      : fallback;
}
export function staging() {
  return setting('COPILOT_MODE', 'staging') === 'staging';
}
export function providerMode(): 'fixture' | 'openai' | 'unconfigured' {
  if (setting('COPILOT_PROVIDER', 'fixture') === 'fixture' && staging())
    return 'fixture';
  return setting('OPENAI_API_KEY') && setting('OPENAI_MODEL')
    ? 'openai'
    : 'unconfigured';
}
export function db(): D1Database {
  return (env as unknown as { DB: D1Database }).DB;
}
export { AppError, assert } from './errors';
