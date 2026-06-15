jest.mock('../../src/services/snapshot', () => ({
  __esModule: true,
  default: { load: jest.fn(), get: jest.fn(), refresh: jest.fn() }
}))

jest.mock('../../src/config', () => ({
  __esModule: true,
  default: {
    settings: { language: 'en', port: 3001 },
    servers: [{ id: 's1', name: 'Server 1', database: '/db.db', refreshCooldown: 300 }],
    users: new Map([['admin', { password: 'pass', servers: ['*'] }]])
  },
  parseConfig: jest.fn()
}))

import request from 'supertest'
import express from 'express'
import snapshotService from '../../src/services/snapshot'
import buildApiRouter from '../../src/routes/api'

function makeApp() {
  const app = express()
  app.use(express.json())
  // Bypass auth for tests — set user with full access
  app.use((req, res, next) => {
    res.locals.user = { username: 'admin', servers: ['*'] }
    next()
  })
  app.use('/api', buildApiRouter())
  return app
}

describe('GET /api/servers', () => {
  test('returns list of accessible servers with snapshot info', async () => {
    snapshotService.get.mockReturnValue({ timestamp: '2026-01-01T00:00:00.000Z', refreshing: false })
    const res = await request(makeApp()).get('/api/servers')
    expect(res.status).toBe(200)
    expect(res.body).toEqual([
      { id: 's1', name: 'Server 1', timestamp: '2026-01-01T00:00:00.000Z', refreshing: false }
    ])
  })

  test('returns null timestamp when no snapshot exists', async () => {
    snapshotService.get.mockReturnValue(null)
    const res = await request(makeApp()).get('/api/servers')
    expect(res.status).toBe(200)
    expect(res.body[0].timestamp).toBeNull()
  })
})

describe('GET /api/:serverId/altars', () => {
  test('returns entity data wrapped in { data, update }', async () => {
    snapshotService.get.mockReturnValue({
      timestamp: '2026-01-01T00:00:00.000Z',
      data: { altars: [{ x: 1, y: 2, class: 'BP_PL_Altar' }] }
    })
    const res = await request(makeApp()).get('/api/s1/altars')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      data: [{ x: 1, y: 2, class: 'BP_PL_Altar' }],
      update: '2026-01-01T00:00:00.000Z'
    })
  })

  test('returns empty data array when no snapshot exists', async () => {
    snapshotService.get.mockReturnValue(null)
    const res = await request(makeApp()).get('/api/s1/altars')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ data: [], update: null })
  })

  test('returns 404 for unknown serverId', async () => {
    const res = await request(makeApp()).get('/api/unknown/altars')
    expect(res.status).toBe(404)
  })
})

describe('POST /api/:serverId/refresh', () => {
  test('returns 200 with timestamp on success', async () => {
    snapshotService.refresh.mockResolvedValue({ timestamp: '2026-01-01T00:00:00.000Z' })
    const res = await request(makeApp()).post('/api/s1/refresh')
    expect(res.status).toBe(200)
    expect(res.body.timestamp).toBe('2026-01-01T00:00:00.000Z')
  })

  test('returns 429 with retryAfter when cooldown is active', async () => {
    snapshotService.refresh.mockRejectedValue(
      Object.assign(new Error('Cooldown'), { code: 'COOLDOWN', retryAfter: 240 })
    )
    const res = await request(makeApp()).post('/api/s1/refresh')
    expect(res.status).toBe(429)
    expect(res.body.retryAfter).toBe(240)
  })

  test('returns 409 when refresh is already in progress', async () => {
    snapshotService.refresh.mockRejectedValue(
      Object.assign(new Error('Refreshing'), { code: 'REFRESHING' })
    )
    const res = await request(makeApp()).post('/api/s1/refresh')
    expect(res.status).toBe(409)
  })
})
