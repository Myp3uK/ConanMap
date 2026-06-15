import config from '../config'

export function createServerAccessMiddleware(servers) {
  return (req, res, next) => {
    const { serverId } = req.params
    if (!servers.some(s => s.id === serverId)) {
      return res.status(404).json({ error: 'Server not found' })
    }

    const user = res.locals.user
    if (user && user.servers[0] !== '*' && !user.servers.includes(serverId)) {
      return res.status(403).json({ error: 'Access denied' })
    }

    return next()
  }
}

const serverAccessMiddleware = createServerAccessMiddleware(config.servers)
export default serverAccessMiddleware
