import crypto from 'node:crypto'

// ---------------------------------------------------------------------------
// Gestion de la session d'accès (V1) — 100% serveur.
//
// Placé dans api/_lib (préfixe « _ » => non routé par Vercel) afin que Vercel
// le transpile AVEC les fonctions. Les imports depuis ../src ne sont PAS pris
// en charge par le build des fonctions Vercel, d'où ce module local.
//
// Le cookie d'accès contient un jeton signé par HMAC-SHA256 avec
// ACCESS_SESSION_SECRET. Aucun secret n'est exposé au frontend.
// ---------------------------------------------------------------------------

export const COOKIE_NAME = 'clynect_access'

/** Durée de validité du cookie : 7 jours (en secondes). */
const MAX_AGE_SECONDS = 7 * 24 * 60 * 60

/** Code d'accès attendu, nettoyé des espaces/retours-ligne parasites. */
export function getAccessCode(): string {
  return (process.env.ACCESS_CODE ?? '').trim()
}

/** Un code d'accès est-il configuré ? Sinon, l'accès est libre (dev local). */
export function isAccessConfigured(): boolean {
  return getAccessCode() !== ''
}

/** Secret de signature du cookie (jamais exposé côté client). */
function getSessionSecret(): string {
  return (
    process.env.ACCESS_SESSION_SECRET ||
    process.env.ACCESS_CODE ||
    'clynect-dev-session-secret'
  )
}

function sign(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url')
}

/** Crée un jeton signé `<payload>.<signature>` avec une date d'expiration. */
export function createSessionToken(): string {
  const exp = Date.now() + MAX_AGE_SECONDS * 1000
  const payload = Buffer.from(JSON.stringify({ exp })).toString('base64url')
  const signature = sign(payload, getSessionSecret())
  return `${payload}.${signature}`
}

/** Vérifie l'intégrité et la fraîcheur d'un jeton. */
export function verifySessionToken(token: string | undefined): boolean {
  if (!token) return false
  const parts = token.split('.')
  if (parts.length !== 2) return false
  const [payload, signature] = parts

  const expected = sign(payload, getSessionSecret())
  const sigBuf = Uint8Array.from(Buffer.from(signature))
  const expBuf = Uint8Array.from(Buffer.from(expected))
  if (sigBuf.length !== expBuf.length) return false
  if (!crypto.timingSafeEqual(sigBuf, expBuf)) return false

  try {
    const { exp } = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8'),
    ) as { exp?: number }
    return typeof exp === 'number' && exp > Date.now()
  } catch {
    return false
  }
}

/** Parse l'en-tête Cookie en dictionnaire. */
export function parseCookies(
  header: string | undefined,
): Record<string, string> {
  const out: Record<string, string> = {}
  if (!header) return out
  for (const part of header.split(';')) {
    const idx = part.indexOf('=')
    if (idx === -1) continue
    const key = part.slice(0, idx).trim()
    const value = part.slice(idx + 1).trim()
    if (key) out[key] = decodeURIComponent(value)
  }
  return out
}

/** Construit l'en-tête Set-Cookie pour le jeton de session. */
export function buildSessionCookie(token: string): string {
  const secure = process.env.NODE_ENV === 'production' ? ' Secure;' : ''
  return (
    [
      `${COOKIE_NAME}=${token}`,
      'HttpOnly',
      'SameSite=Strict',
      'Path=/',
      `Max-Age=${MAX_AGE_SECONDS}`,
    ].join('; ') +
    ';' +
    secure
  )
}

/**
 * Vrai si la requête est autorisée : accès non configuré (libre) OU cookie
 * de session valide.
 */
export function hasValidSession(cookieHeader: string | undefined): boolean {
  if (!isAccessConfigured()) return false
  const cookies = parseCookies(cookieHeader)
  return verifySessionToken(cookies[COOKIE_NAME])
}
