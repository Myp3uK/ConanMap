import { createServerAccessMiddleware } from '../../src/middleware/serverAccess'

const servers = [
  { id: 's1', name: 'Server 1', database: '/db1.db', refreshCooldown: 300 },
  { id: 's2', name: 'Server 2', database: '/db2.db', refreshCooldown: 300 }
]

function makeReqRes(serverId, userServers) {
  const req = { params: { serverId } }
  const res = {
    locals: { user: { username: 'u', servers: userServers } },
    statusCode: null,
    status(code) { this.statusCode = code; return this },
    json(body) { this.body = body }
  }
  const next = jest.fn()
  return { req, res, next }
}

describe('createServerAccessMiddleware', () => {
  const mw = createServerAccessMiddleware(servers)

  test('returns 404 for unknown serverId', () => {
    const { req, res, next } = makeReqRes('unknown', ['*'])
    mw(req, res, next)
    expect(res.statusCode).toBe(404)
    expect(next).not.toHaveBeenCalled()
  })

  test('allows access to any existing server (viewing is public)', () => {
    const { req, res, next } = makeReqRes('s2', ['s1'])
    mw(req, res, next)
    expect(next).toHaveBeenCalled()
  })

  test('allows access to another existing server', () => {
    const { req, res, next } = makeReqRes('s1', [])
    mw(req, res, next)
    expect(next).toHaveBeenCalled()
  })
})
