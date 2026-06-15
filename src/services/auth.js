import crypto from 'crypto'

// ── Password hashing (scrypt, built-in — no external deps) ───────────────────
// Stored format:  scrypt$<saltHex>$<keyHex>
const SCRYPT_KEYLEN = 64

export function hashPassword (password) {
  const salt = crypto.randomBytes(16)
  const key = crypto.scryptSync(password, salt, SCRYPT_KEYLEN)
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`
}

export function verifyPassword (password, stored) {
  if (typeof stored !== 'string') return false
  const parts = stored.split('$')
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false
  try {
    const salt = Buffer.from(parts[1], 'hex')
    const expected = Buffer.from(parts[2], 'hex')
    const actual = crypto.scryptSync(password, salt, expected.length)
    return crypto.timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}

export function isHash (str) {
  return typeof str === 'string' && /^scrypt\$[0-9a-f]+\$[0-9a-f]+$/i.test(str)
}

// ── Password policy ──────────────────────────────────────────────────────────
// At least 16 chars, with a lowercase letter, an uppercase letter and a digit.
export function passwordIssues (password) {
  const issues = []
  if (typeof password !== 'string' || password.length < 16) issues.push('at least 16 characters')
  if (!/[a-z]/.test(password || '')) issues.push('a lowercase letter')
  if (!/[A-Z]/.test(password || '')) issues.push('an uppercase letter')
  if (!/[0-9]/.test(password || '')) issues.push('a digit')
  return issues
}

// ── Session token (HMAC-signed cookie value) ─────────────────────────────────
// Format:  base64url(username).expiryMs.hmacHex
// Secret is random per process start (sessions drop on restart — acceptable).
const SECRET = crypto.randomBytes(32)
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

function sign (data) {
  return crypto.createHmac('sha256', SECRET).update(data).digest('hex')
}

export function signToken (username) {
  const exp = Date.now() + SESSION_TTL_MS
  const u = Buffer.from(String(username)).toString('base64url')
  const data = `${u}.${exp}`
  return `${data}.${sign(data)}`
}

export function verifyToken (token) {
  if (typeof token !== 'string') return null
  const idx = token.lastIndexOf('.')
  if (idx === -1) return null
  const data = token.slice(0, idx)
  const mac = token.slice(idx + 1)
  const expected = sign(data)
  if (mac.length !== expected.length) return null
  if (!crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null
  const dot = data.indexOf('.')
  if (dot === -1) return null
  const exp = Number(data.slice(dot + 1))
  if (!Number.isFinite(exp) || Date.now() > exp) return null
  try {
    return Buffer.from(data.slice(0, dot), 'base64url').toString('utf8')
  } catch {
    return null
  }
}

export const SESSION_COOKIE = 'cam_session'
