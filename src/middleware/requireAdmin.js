// Gate for admin-only (write) routes. Viewing stays public; this only protects
// mutating endpoints (e.g. custom markers).
export default function requireAdmin (req, res, next) {
  if (!res.locals.isAdmin) return res.status(401).json({ error: 'Admin login required' })
  next()
}
