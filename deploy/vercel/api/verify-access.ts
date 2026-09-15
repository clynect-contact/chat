import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  buildSessionCookie,
  createSessionToken,
  getAccessCode,
  isAccessConfigured,
} from './_lib/session.js'

// ---------------------------------------------------------------------------
// Valide le code d'accès (V1) côté serveur et, si correct, pose un cookie
// HttpOnly signé. Le code attendu n'est jamais envoyé au frontend.
// ---------------------------------------------------------------------------

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Méthode non autorisée.' })
  }

  res.setHeader('Cache-Control', 'no-store')
  const origin = req.headers.origin
  try {
    if (typeof origin !== 'string' || new URL(origin).host !== req.headers.host) return res.status(403).json({ error: 'Forbidden' })
  } catch { return res.status(403).json({ error: 'Forbidden' }) }
  if (!isAccessConfigured()) {
    return res.status(503).json({ error: 'Access is not configured.' })
  }

  const body = (req.body ?? {}) as { code?: string }
  const code = typeof body.code === 'string' ? body.code.trim() : ''

  if (!code || code !== getAccessCode()) {
    return res.status(401).json({ ok: false, error: "Code d'accès incorrect." })
  }

  res.setHeader('Set-Cookie', buildSessionCookie(createSessionToken()))
  return res.status(200).json({ ok: true })
}
