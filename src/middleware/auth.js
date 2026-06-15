import auth from 'basic-auth'
import config from '../config'

export function createAuthMiddleware(users) {
  return (req, res, next) => {
    if (!users.size) return next()

    const credentials = auth(req)
    const entry = credentials ? users.get(credentials.name) : null

    if (!entry || entry.password !== credentials?.pass) {
      res.setHeader('WWW-Authenticate', 'Basic realm="ConanExilesAdminMap"')
      return res.status(401).send('Unauthorized')
    }

    res.locals.user = { username: credentials.name, servers: entry.servers }
    return next()
  }
}

const authMiddleware = (app) => {
  app.use(createAuthMiddleware(config.users))
}

export default authMiddleware
