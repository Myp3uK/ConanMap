import config from '../config'

// Viewing is public, so this only validates the server exists. Per-user server
// access control was removed when the app moved to public viewing + admin login.
export function createServerAccessMiddleware(servers) {
  return (req, res, next) => {
    const { serverId } = req.params
    if (!servers.some(s => s.id === serverId)) {
      return res.status(404).json({ error: 'Server not found' })
    }
    return next()
  }
}

const serverAccessMiddleware = createServerAccessMiddleware(config.servers)
export default serverAccessMiddleware
