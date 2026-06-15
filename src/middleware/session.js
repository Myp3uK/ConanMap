import { verifyToken, SESSION_COOKIE } from '../services/auth'

function parseCookies (header) {
  const out = {}
  if (!header) return out
  for (const part of header.split(';')) {
    const i = part.indexOf('=')
    if (i === -1) continue
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim())
  }
  return out
}

// Viewing is public. This only resolves admin identity from the session cookie
// (if present) so admin-only routes/UI can be gated; it never blocks a request.
export function createSessionMiddleware () {
  return (req, res, next) => {
    const cookies = parseCookies(req.headers.cookie)
    const username = verifyToken(cookies[SESSION_COOKIE])
    res.locals.isAdmin = !!username
    res.locals.adminUser = username || null
    next()
  }
}

const sessionMiddleware = (app) => {
  app.use(createSessionMiddleware())
}

export default sessionMiddleware
