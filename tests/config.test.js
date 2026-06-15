import { parseConfig } from '../src/config'

describe('parseConfig', () => {
  test('parses multi-server INI into servers array', () => {
    const raw = `
[SETTINGS]
language = en
port = 3001

[SERVER_server1]
name = Exile Lands
database = /path/game1.db
refresh_cooldown = 300

[SERVER_server2]
name = Isle of Siptah
database = /path/game2.db
`
    const cfg = parseConfig(raw)
    expect(cfg.settings.language).toBe('en')
    expect(cfg.settings.port).toBe(3001)
    expect(cfg.servers).toHaveLength(2)
    expect(cfg.servers[0]).toEqual({
      id: 'server1',
      name: 'Exile Lands',
      database: '/path/game1.db'
    })
    expect(cfg.servers[1].id).toBe('server2')
  })

  test('backward compat: [CONAN_EXILES] becomes server1', () => {
    const raw = `
[SETTINGS]
port = 3001

[CONAN_EXILES]
database = /path/old.db

[USERS]
admin = password
`
    const cfg = parseConfig(raw)
    expect(cfg.servers).toHaveLength(1)
    expect(cfg.servers[0].id).toBe('server1')
    expect(cfg.servers[0].database).toBe('/path/old.db')
    expect(cfg.users.get('admin')).toEqual({ password: 'password', servers: ['*'] })
  })

  test('parses users with explicit server permissions', () => {
    const raw = `
[SERVER_s1]
database = /db1.db

[USERS]
superadmin = pass:*
admin1 = pass:s1
multi = pass:s1,s2
`
    const cfg = parseConfig(raw)
    expect(cfg.users.get('superadmin').servers).toEqual(['*'])
    expect(cfg.users.get('admin1').servers).toEqual(['s1'])
    expect(cfg.users.get('multi').servers).toEqual(['s1', 's2'])
  })

  test('returns defaults when SETTINGS section is absent', () => {
    const raw = `[SERVER_s1]\ndatabase = /db.db`
    const cfg = parseConfig(raw)
    expect(cfg.settings.port).toBe(3001)
    expect(cfg.settings.language).toBe('en')
  })

  test('returns safe defaults when given empty string', () => {
    const cfg = parseConfig('')
    expect(cfg.settings.port).toBe(3001)
    expect(cfg.settings.language).toBe('en')
    expect(cfg.servers).toEqual([])
    expect(cfg.users.size).toBe(0)
  })

  test('returns empty users map when USERS section is absent', () => {
    const raw = `[SERVER_s1]\ndatabase = /db.db`
    const cfg = parseConfig(raw)
    expect(cfg.users).toBeInstanceOf(Map)
    expect(cfg.users.size).toBe(0)
  })
})
