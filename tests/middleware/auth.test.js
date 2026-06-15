import { createAuthMiddleware } from '../../src/middleware/auth'

function b64(str) { return 'Basic ' + Buffer.from(str).toString('base64') }

function makeReqRes(authHeader) {
  const req = { headers: { authorization: authHeader } }
  const res = {
    locals: {},
    statusCode: null,
    _headers: {},
    setHeader(k, v) { this._headers[k] = v },
    status(code) { this.statusCode = code; return this },
    send(body) { this.body = body }
  }
  const next = jest.fn()
  return { req, res, next }
}

describe('createAuthMiddleware', () => {
  const users = new Map([
    ['admin', { password: 'pass', servers: ['*'] }],
    ['user1', { password: 'secret', servers: ['s1'] }]
  ])

  test('allows all requests when no users configured', () => {
    const mw = createAuthMiddleware(new Map())
    const { req, res, next } = makeReqRes(undefined)
    mw(req, res, next)
    expect(next).toHaveBeenCalled()
  })

  test('returns 401 with WWW-Authenticate when credentials absent', () => {
    const mw = createAuthMiddleware(users)
    const { req, res, next } = makeReqRes(undefined)
    mw(req, res, next)
    expect(res.statusCode).toBe(401)
    expect(res._headers['WWW-Authenticate']).toBeTruthy()
    expect(next).not.toHaveBeenCalled()
  })

  test('returns 401 for wrong password', () => {
    const mw = createAuthMiddleware(users)
    const { req, res, next } = makeReqRes(b64('admin:wrong'))
    mw(req, res, next)
    expect(res.statusCode).toBe(401)
    expect(next).not.toHaveBeenCalled()
  })

  test('sets res.locals.user and calls next for valid credentials', () => {
    const mw = createAuthMiddleware(users)
    const { req, res, next } = makeReqRes(b64('user1:secret'))
    mw(req, res, next)
    expect(next).toHaveBeenCalled()
    expect(res.locals.user).toEqual({ username: 'user1', servers: ['s1'] })
  })
})
