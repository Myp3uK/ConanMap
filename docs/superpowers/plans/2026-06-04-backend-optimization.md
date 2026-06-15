# Backend Optimization: Multi-Server Architecture — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the single-user local tool into a multi-user web service supporting multiple Conan Exiles game servers with per-server access control and snapshot-based data caching.

**Architecture:** A new snapshot service (`src/services/snapshot.js`) becomes the sole point of interaction with `game.db`. It reads all data on manual refresh and caches in memory + on disk. All API routes serve from in-memory cache (near-instant responses). Auth is extended to carry per-server permissions. ~40 old controller/route files are replaced by a single factory pattern.

**Tech Stack:** Node.js, Express, better-sqlite3, ini, Jest (new), babel-jest (new), supertest (new)

---

## File Map

**Create:**
- `src/services/snapshot.js` — snapshot service: load, get, refresh, rate limiting, binary field transformers
- `src/middleware/serverAccess.js` — validates `:serverId` param against user permissions
- `tests/config.test.js`
- `tests/services/snapshot.test.js`
- `tests/middleware/auth.test.js`
- `tests/middleware/serverAccess.test.js`
- `tests/routes/api.test.js`

**Rewrite:**
- `src/config.js` — multi-server INI parsing with backward compat
- `src/routes/api/index.js` — factory pattern + `/api/servers` + `/api/:serverId/refresh`

**Modify:**
- `package.json` — add jest, babel-jest, supertest; update test script
- `src/middleware/index.js` — remove database middleware
- `src/middleware/auth.js` — expose `createAuthMiddleware`, store `res.locals.user`
- `src/middleware/language.js` — use `config.settings.language`
- `src/routes/index.js` — remove `res.database.time` reference
- `src/views/index.ejs` — add server panel HTML, remove lastupdate EJS var
- `public/assets/scripts/map.js` — server selector, refresh, activeServerId prefix
- `src/conan-exiles-admin-map.ini` — new multi-server template
- `.gitignore` — add `snapshots/`

**Delete:**
- `src/middleware/database.js`
- `src/controllers/api/` (entire directory — 13 files)
- `src/routes/api/all.js`, `altars.js`, `animalpens.js`, `beds.js`, `buildings.js`, `campfires.js`, `chests.js`, `crabpots.js`, `crafting.js`, `fishnets.js`, `maprooms.js`, `pets.js`, `players.js`, `thralls.js`, `thrones.js`, `trebuchets.js`, `vaults.js`, `waterwells.js`, `wheelsofpain.js`, `pippi/all.js`, `pippi/thespians.js`

---

## Task 1: Add Jest testing infrastructure

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install test dependencies**

```bash
npm install --save-dev jest babel-jest supertest
```

Expected: packages installed in `node_modules`, `package-lock.json` updated.

- [ ] **Step 2: Update package.json — add test script and Jest config**

In `package.json`, replace the `"test"` line and add a `"jest"` section:

```json
{
  "name": "conan-exiles-admin-map",
  "version": "0.4.1",
  "description": "A Conan Exiles Admin Dashboard",
  "main": "src/conan-exiles-admin-map.js",
  "scripts": {
    "start": "babel-node src/conan-exiles-admin-map.js",
    "build": "bin/build.sh",
    "test": "jest --no-coverage"
  },
  "jest": {
    "transform": {
      "^.+\\.js$": "babel-jest"
    },
    "testEnvironment": "node"
  }
}
```

- [ ] **Step 3: Verify Jest runs**

```bash
npm test
```

Expected: output includes "No tests found" or "Test Suites: 0 of 0 total" — Jest is configured and running without errors.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add Jest + babel-jest + supertest for testing"
```

---

## Task 2: Rewrite src/config.js

**Files:**
- Rewrite: `src/config.js`
- Modify: `src/middleware/language.js`
- Create: `tests/config.test.js`

**New INI format (`username = password:servers`):**
```ini
[SERVER_server1]
name = Exile Lands
database = C:/path/to/game.db
refresh_cooldown = 300

[USERS]
superadmin = pass:*
admin1 = pass:server1
```

Backward compat rules:
- Old `[CONAN_EXILES]` → treated as `[SERVER_server1]`
- Old `user = pass` (no colon after password) → `servers: ['*']`

- [ ] **Step 1: Write failing tests**

Create `tests/config.test.js`:

```js
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
      database: '/path/game1.db',
      refreshCooldown: 300
    })
    expect(cfg.servers[1].id).toBe('server2')
    expect(cfg.servers[1].refreshCooldown).toBe(300) // default applied
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
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npm test -- tests/config.test.js
```

Expected: FAIL — `parseConfig` not exported.

- [ ] **Step 3: Rewrite src/config.js**

```js
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import ini from 'ini'

const DEFAULT_COOLDOWN = 300
const DEFAULT_PORT = 3001
const DEFAULT_LANGUAGE = 'en'

export function parseConfig(rawIni) {
  const parsed = ini.parse(rawIni)

  const settings = {
    language: parsed.SETTINGS?.language || DEFAULT_LANGUAGE,
    port: parseInt(parsed.SETTINGS?.port, 10) || DEFAULT_PORT
  }

  const servers = []
  for (const key of Object.keys(parsed)) {
    if (key.startsWith('SERVER_')) {
      const id = key.slice(7)
      const sec = parsed[key]
      servers.push({
        id,
        name: sec.name || id,
        database: (sec.database || '').replace(/\\/g, '/'),
        refreshCooldown: parseInt(sec.refresh_cooldown, 10) || DEFAULT_COOLDOWN
      })
    }
  }

  // Backward compat: old [CONAN_EXILES] section
  if (servers.length === 0 && parsed.CONAN_EXILES) {
    servers.push({
      id: 'server1',
      name: 'Server 1',
      database: (parsed.CONAN_EXILES.database || '').replace(/\\/g, '/'),
      refreshCooldown: DEFAULT_COOLDOWN
    })
  }

  const users = new Map()
  if (parsed.USERS) {
    for (const [username, value] of Object.entries(parsed.USERS)) {
      const str = String(value)
      const colonIdx = str.lastIndexOf(':')
      if (colonIdx === -1) {
        // Old format: "pass" with no server list → access to all
        users.set(username, { password: str, servers: ['*'] })
      } else {
        const password = str.slice(0, colonIdx)
        const serverList = str.slice(colonIdx + 1)
        const srvs = serverList === '*' ? ['*'] : serverList.split(',').map(s => s.trim()).filter(Boolean)
        users.set(username, { password, servers: srvs })
      }
    }
  }

  return { settings, servers, users }
}

const configFile = join(process.cwd(), 'conan-exiles-admin-map.ini')

const config = parseConfig(
  existsSync(configFile) ? readFileSync(configFile, 'UTF8') : ''
)

export default config
```

- [ ] **Step 4: Update src/middleware/language.js**

Change `config.SETTINGS.language` → `config.settings.language`:

```js
import Polyglot from 'node-polyglot'
import config from '../config'
import languages from '../languages'

const languageMiddleware = (app) => {
  let language = config.settings.language
  if (!languages[language]) language = 'en'

  const polyglot = new Polyglot({ locale: language, phrases: languages[language] })

  app.use((req, res, next) => {
    res.lang = { locale: language, phrases: polyglot.phrases }
    return next()
  })
}

export default languageMiddleware
```

- [ ] **Step 5: Run tests — verify they pass**

```bash
npm test -- tests/config.test.js
```

Expected: PASS — 4 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/config.js src/middleware/language.js tests/config.test.js
git commit -m "feat: rewrite config.js for multi-server INI parsing with backward compat"
```

---

## Task 3: Create src/services/snapshot.js

**Files:**
- Create: `src/services/snapshot.js`
- Create: `tests/services/snapshot.test.js`

The service reads all entities from `game.db` on refresh and stores them in memory + a JSON file. Binary field parsing (previously in individual controllers) is consolidated here into transformer functions.

- [ ] **Step 1: Write failing tests**

Create `tests/services/snapshot.test.js`:

```js
jest.mock('better-sqlite3')
jest.mock('fs')

import Database from 'better-sqlite3'
import { writeFileSync, mkdirSync, existsSync, readFileSync, readdirSync } from 'fs'
import { createSnapshotService } from '../src/services/snapshot'

const mockServers = [
  { id: 's1', name: 'Server 1', database: '/fake/game.db', refreshCooldown: 5 }
]

describe('snapshotService', () => {
  let service

  beforeEach(() => {
    jest.clearAllMocks()
    existsSync.mockReturnValue(false)
    readdirSync.mockReturnValue([])
    service = createSnapshotService(mockServers)
  })

  test('get() returns null when no snapshot exists', () => {
    expect(service.get('s1')).toBeNull()
  })

  test('get() returns null for unknown server', () => {
    expect(service.get('unknown')).toBeNull()
  })

  test('refresh() rejects unknown serverId', async () => {
    await expect(service.refresh('unknown')).rejects.toThrow('Unknown server')
  })

  test('refresh() rejects while already refreshing', async () => {
    service._snapshots.set('s1', { refreshing: true })
    await expect(service.refresh('s1')).rejects.toMatchObject({ code: 'REFRESHING' })
  })

  test('refresh() rejects when cooldown has not elapsed', async () => {
    const mockDb = {
      prepare: jest.fn().mockReturnValue({ all: jest.fn().mockReturnValue([]) }),
      close: jest.fn()
    }
    Database.mockImplementation(() => mockDb)
    mkdirSync.mockImplementation(() => {})
    writeFileSync.mockImplementation(() => {})

    await service.refresh('s1')

    // Immediate second refresh should hit cooldown (cooldown = 5s, 0s elapsed)
    await expect(service.refresh('s1')).rejects.toMatchObject({
      code: 'COOLDOWN',
      retryAfter: expect.any(Number)
    })
  })

  test('get() returns snapshot after successful refresh', async () => {
    const mockDb = {
      prepare: jest.fn().mockReturnValue({ all: jest.fn().mockReturnValue([]) }),
      close: jest.fn()
    }
    Database.mockImplementation(() => mockDb)
    mkdirSync.mockImplementation(() => {})
    writeFileSync.mockImplementation(() => {})

    await service.refresh('s1')
    const snap = service.get('s1')

    expect(snap).not.toBeNull()
    expect(snap.serverId).toBe('s1')
    expect(snap.timestamp).toBeTruthy()
    expect(snap.refreshing).toBe(false)
    expect(snap.data).toHaveProperty('players')
    expect(snap.data).toHaveProperty('altars')
    expect(snap.data).toHaveProperty('all')
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npm test -- tests/services/snapshot.test.js
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create src/services/snapshot.js**

```js
import Database from 'better-sqlite3'
import { writeFileSync, mkdirSync, existsSync, readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { SmartBuffer } from 'smart-buffer'
import queries from '../config/sql'

const SNAPSHOTS_DIR = join(process.cwd(), 'snapshots')

// ── Binary field transformers (consolidated from old controllers) ────────────

function decodeFString(buf) {
  if (!buf) return 'Unknown'
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf)
  if (b.length < 46) return 'Unknown'
  const strLen = b.readInt32LE(41)
  if (strLen === 0) return 'Unknown'
  if (strLen < 0) {
    const charCount = Math.abs(strLen) - 1
    const end = 45 + charCount * 2
    if (end > b.length) return 'Unknown'
    return b.slice(45, end).toString('utf16le')
  }
  if (strLen > 0 && strLen < 256) {
    const end = 45 + strLen - 1
    if (end > b.length) return 'Unknown'
    return b.slice(45, end).toString('utf8')
  }
  return 'Unknown'
}

function decodeClassString(buf, maxLen) {
  if (!buf) return ''
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf)
  if (b.length < 20) return ''
  const strLen = b.readInt32LE(16)
  if (strLen <= 0 || strLen > maxLen) return ''
  const end = 20 + strLen - 1
  if (end > b.length) return ''
  return b.slice(20, end).toString('ascii')
}

function decodeOwnerId(buf) {
  if (!buf) return 0
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf)
  if (b.length < 8) return 0
  return b.readUInt32LE(b.length - 8)
}

function addKind(rows) {
  return rows.map(item => ({ ...item, kind: item.class || null }))
}

function transformPlayers(rows) {
  return rows.map(p => {
    const player = { ...p }
    if (player.char_name) player.char_name = player.char_name.slice(1, -1)
    if (!player.guild_name || player.guild_name === 'NULL') player.guild_name = ''
    else player.guild_name = player.guild_name.slice(1, -1)
    if (!player.rank || player.rank === 'NULL') player.rank = ''
    return player
  })
}

function transformPets(rows) {
  return rows.map(pet => {
    const p = { ...pet }
    p.name = decodeFString(p.name)
    p.info = decodeClassString(p.info, 100).replace(/^[Pp]et_/i, '').replace(/_/g, ' ')
    p.owner = decodeOwnerId(p.owner)
    p.greater = /[Aa]lpha[Pp]et|[Pp]et[Aa]lpha/i.test(p.class || '')
    return p
  })
}

function transformThralls(rows) {
  return rows.map(t => {
    const thrall = { ...t }
    thrall.name = decodeFString(thrall.name)
    thrall.info = decodeClassString(thrall.info, 200).replace(/_/g, ' ')
    thrall.owner = decodeOwnerId(thrall.owner)
    return thrall
  })
}

function transformPippiThespians(rows) {
  return rows.map(row => {
    const pippi = { ...row }
    try {
      const str = SmartBuffer.fromBuffer(pippi.buffer).readString('ascii')
      const namePos = str.indexOf('StrProperty')
      const profPos = str.indexOf('profession')
      let name = str.substr(namePos + 25, profPos - namePos - 26).trim()
      name = JSON.stringify(name).replace(/\\u[0-9a-f]{4}/gi, '').replace(/\\[bfnrt]/gi, '').replace(/"/g, '').slice(0, -1)
      pippi.name = name

      const profStr = str.substr(profPos)
      const profNamePos = profStr.indexOf('StrProperty')
      const profEndPos = profStr.indexOf('isInteraction')
      let profName = profStr.substr(profNamePos + 25, profEndPos - profNamePos - 25).trim()
      profName = JSON.stringify(profName).replace(/\\u[0-9a-f]{4}/gi, '').replace(/\\[bfnrt]/gi, '').replace(/"/g, '').slice(0, -1)
      pippi.info = profName
    } catch (e) {
      pippi.name = ''
      pippi.info = ''
    }
    delete pippi.buffer
    return pippi
  })
}

// ── Snapshot service factory ─────────────────────────────────────────────────

export function createSnapshotService(servers) {
  const _snapshots = new Map()

  function load() {
    if (!existsSync(SNAPSHOTS_DIR)) return
    for (const file of readdirSync(SNAPSHOTS_DIR).filter(f => f.endsWith('.json'))) {
      try {
        const snap = JSON.parse(readFileSync(join(SNAPSHOTS_DIR, file), 'utf8'))
        _snapshots.set(snap.serverId, { ...snap, refreshing: false })
      } catch (e) {
        console.error(`Failed to load snapshot ${file}:`, e.message)
      }
    }
  }

  function get(serverId) {
    return _snapshots.get(serverId) ?? null
  }

  async function refresh(serverId) {
    const serverCfg = servers.find(s => s.id === serverId)
    if (!serverCfg) throw Object.assign(new Error('Unknown server: ' + serverId), { code: 'NOT_FOUND' })

    const existing = _snapshots.get(serverId)

    if (existing?.refreshing) {
      throw Object.assign(new Error('Refresh already in progress'), { code: 'REFRESHING' })
    }

    if (existing?.timestamp) {
      const elapsed = (Date.now() - new Date(existing.timestamp).getTime()) / 1000
      if (elapsed < serverCfg.refreshCooldown) {
        const retryAfter = Math.ceil(serverCfg.refreshCooldown - elapsed)
        throw Object.assign(new Error('Cooldown active'), { code: 'COOLDOWN', retryAfter })
      }
    }

    _snapshots.set(serverId, { ...existing, refreshing: true })

    try {
      const db = new Database(serverCfg.database, { readonly: true })
      const run = sql => db.prepare(sql).all()

      const data = {
        all:            addKind(run(queries.all)),
        altars:         addKind(run(queries.altars)),
        animalpens:     addKind(run(queries.animalpens)),
        beds:           addKind(run(queries.beds)),
        buildings:      addKind(run(queries.buildings)),
        campfires:      addKind(run(queries.campfires)),
        chests:         addKind(run(queries.chests)),
        crabPots:       addKind(run(queries.crabPots)),
        crafting:       addKind(run(queries.crafting)),
        fishNets:       addKind(run(queries.fishNets)),
        mapRooms:       addKind(run(queries.mapRooms)),
        thrones:        addKind(run(queries.thrones)),
        trebuchets:     addKind(run(queries.trebuchets)),
        vaults:         addKind(run(queries.vaults)),
        waterWells:     addKind(run(queries.waterWells)),
        wheelsOfPain:   addKind(run(queries.wheelsOfPain)),
        pippiAll:       addKind(run(queries.pippiAll)),
        players:        transformPlayers(run(queries.players)),
        pets:           transformPets(run(queries.pets)),
        thralls:        transformThralls(run(queries.thralls)),
        pippiThespians: transformPippiThespians(run(queries.pippiThespians)),
      }

      db.close()

      const timestamp = new Date().toISOString()
      const snap = { serverId, timestamp, refreshing: false, data }
      _snapshots.set(serverId, snap)

      if (!existsSync(SNAPSHOTS_DIR)) mkdirSync(SNAPSHOTS_DIR, { recursive: true })
      writeFileSync(join(SNAPSHOTS_DIR, `${serverId}.json`), JSON.stringify({ serverId, timestamp, data }))

      return snap
    } catch (e) {
      _snapshots.set(serverId, { ..._snapshots.get(serverId), refreshing: false })
      throw e
    }
  }

  return { load, get, refresh, _snapshots }
}

import config from '../config'
const snapshotService = createSnapshotService(config.servers)
export default snapshotService
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npm test -- tests/services/snapshot.test.js
```

Expected: PASS — 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/services/snapshot.js tests/services/snapshot.test.js
git commit -m "feat: add snapshot service with in-memory caching, disk persistence, and rate limiting"
```

---

## Task 4: Update src/middleware/auth.js

**Files:**
- Modify: `src/middleware/auth.js`
- Create: `tests/middleware/auth.test.js`

Updated middleware stores `res.locals.user = { username, servers }` for downstream `serverAccess` middleware.

- [ ] **Step 1: Write failing tests**

Create `tests/middleware/auth.test.js`:

```js
import { createAuthMiddleware } from '../src/middleware/auth'

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
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npm test -- tests/middleware/auth.test.js
```

Expected: FAIL — `createAuthMiddleware` not exported.

- [ ] **Step 3: Rewrite src/middleware/auth.js**

```js
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
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npm test -- tests/middleware/auth.test.js
```

Expected: PASS — 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/middleware/auth.js tests/middleware/auth.test.js
git commit -m "feat: update auth middleware to expose createAuthMiddleware and store user permissions"
```

---

## Task 5: Create src/middleware/serverAccess.js

**Files:**
- Create: `src/middleware/serverAccess.js`
- Create: `tests/middleware/serverAccess.test.js`

- [ ] **Step 1: Write failing tests**

Create `tests/middleware/serverAccess.test.js`:

```js
import { createServerAccessMiddleware } from '../src/middleware/serverAccess'

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

  test('returns 403 when user lacks access to the requested server', () => {
    const { req, res, next } = makeReqRes('s2', ['s1'])
    mw(req, res, next)
    expect(res.statusCode).toBe(403)
    expect(next).not.toHaveBeenCalled()
  })

  test('allows access when user has wildcard (*)', () => {
    const { req, res, next } = makeReqRes('s1', ['*'])
    mw(req, res, next)
    expect(next).toHaveBeenCalled()
  })

  test('allows access when user explicitly lists the serverId', () => {
    const { req, res, next } = makeReqRes('s2', ['s1', 's2'])
    mw(req, res, next)
    expect(next).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npm test -- tests/middleware/serverAccess.test.js
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create src/middleware/serverAccess.js**

```js
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
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npm test -- tests/middleware/serverAccess.test.js
```

Expected: PASS — 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/middleware/serverAccess.js tests/middleware/serverAccess.test.js
git commit -m "feat: add serverAccess middleware for per-server permission checking"
```

---

## Task 6: Rewrite src/routes/api/index.js and update middleware chain

**Files:**
- Rewrite: `src/routes/api/index.js`
- Modify: `src/middleware/index.js`
- Modify: `src/routes/index.js`
- Create: `tests/routes/api.test.js`

All entity routes return `{ data: [...], update: timestamp }` to preserve frontend compatibility (frontend reads `data.data` and `data.update`).

- [ ] **Step 1: Write failing tests**

Create `tests/routes/api.test.js`:

```js
jest.mock('../src/services/snapshot', () => ({
  default: { load: jest.fn(), get: jest.fn(), refresh: jest.fn() }
}))

jest.mock('../src/config', () => ({
  default: {
    settings: { language: 'en', port: 3001 },
    servers: [{ id: 's1', name: 'Server 1', database: '/db.db', refreshCooldown: 300 }],
    users: new Map([['admin', { password: 'pass', servers: ['*'] }]])
  },
  parseConfig: jest.fn()
}))

import request from 'supertest'
import express from 'express'
import snapshotService from '../src/services/snapshot'
import buildApiRouter from '../src/routes/api'

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
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npm test -- tests/routes/api.test.js
```

Expected: FAIL — route module does not match expected structure.

- [ ] **Step 3: Rewrite src/routes/api/index.js**

```js
import { Router } from 'express'
import config from '../../config'
import serverAccessMiddleware from '../../middleware/serverAccess'
import snapshotService from '../../services/snapshot'

const entityRoutes = [
  { path: 'all',             key: 'all' },
  { path: 'altars',          key: 'altars' },
  { path: 'animalpens',      key: 'animalpens' },
  { path: 'beds',            key: 'beds' },
  { path: 'buildings',       key: 'buildings' },
  { path: 'campfires',       key: 'campfires' },
  { path: 'chests',          key: 'chests' },
  { path: 'crabpots',        key: 'crabPots' },
  { path: 'crafting',        key: 'crafting' },
  { path: 'fishnets',        key: 'fishNets' },
  { path: 'maprooms',        key: 'mapRooms' },
  { path: 'pets',            key: 'pets' },
  { path: 'players',         key: 'players' },
  { path: 'thralls',         key: 'thralls' },
  { path: 'thrones',         key: 'thrones' },
  { path: 'trebuchets',      key: 'trebuchets' },
  { path: 'vaults',          key: 'vaults' },
  { path: 'waterwells',      key: 'waterWells' },
  { path: 'wheelsofpain',    key: 'wheelsOfPain' },
  { path: 'pippi/all',       key: 'pippiAll' },
  { path: 'pippi/thespians', key: 'pippiThespians' },
]

export default function buildApiRouter() {
  const router = Router()

  router.get('/servers', (req, res) => {
    const userServers = res.locals.user?.servers ?? ['*']
    const list = config.servers
      .filter(s => userServers[0] === '*' || userServers.includes(s.id))
      .map(s => {
        const snap = snapshotService.get(s.id)
        return { id: s.id, name: s.name, timestamp: snap?.timestamp ?? null, refreshing: snap?.refreshing ?? false }
      })
    res.json(list)
  })

  router.post('/:serverId/refresh', serverAccessMiddleware, async (req, res) => {
    try {
      const snap = await snapshotService.refresh(req.params.serverId)
      res.json({ timestamp: snap.timestamp })
    } catch (e) {
      if (e.code === 'COOLDOWN') return res.status(429).json({ error: e.message, retryAfter: e.retryAfter })
      if (e.code === 'REFRESHING') return res.status(409).json({ error: e.message })
      console.error(e)
      res.status(500).json({ error: 'Refresh failed' })
    }
  })

  entityRoutes.forEach(({ path, key }) => {
    router.get(`/:serverId/${path}`, serverAccessMiddleware, (req, res) => {
      const snap = snapshotService.get(req.params.serverId)
      res.json({ data: snap?.data[key] ?? [], update: snap?.timestamp ?? null })
    })
  })

  return router
}

export const apiRoutes = (app) => {
  snapshotService.load()
  app.use('/api', buildApiRouter())
}
```

- [ ] **Step 4: Update src/middleware/index.js — remove database middleware**

```js
import applicationMiddleware from './app'
import authMiddleware from './auth'
import languageMiddleware from './language'
import staticMiddleware from './static'

const middleware = (app) => {
  applicationMiddleware(app)
  authMiddleware(app)
  languageMiddleware(app)
  staticMiddleware(app)
}

export default middleware
```

- [ ] **Step 5: Update src/routes/index.js — remove res.database.time**

```js
import { apiRoutes } from './api'

const routes = (app) => {
  apiRoutes(app)

  app.get('/', (req, res) => {
    res.render('index', {
      lang: res.lang.phrases,
      language: JSON.stringify(res.lang),
      lastupdate: ''
    })
  })

  app.use((req, res) => {
    res.status(404).json({ error: { status: 404, message: 'Not Found' } })
  })
}

export default routes
```

- [ ] **Step 6: Run all tests — verify they pass**

```bash
npm test
```

Expected: PASS — all test suites green.

- [ ] **Step 7: Start the app and verify it boots without errors**

```bash
npm start
```

Expected: "App listening on port 3001", no crash. Browser opens. The map loads (data will be empty until refresh is triggered — that is correct).

- [ ] **Step 8: Commit**

```bash
git add src/routes/api/index.js src/middleware/index.js src/routes/index.js tests/routes/api.test.js
git commit -m "feat: rewrite API routes with factory pattern, add /api/servers and /api/:serverId/refresh"
```

---

## Task 7: Delete obsolete files

**Files:**
- Delete: `src/middleware/database.js`
- Delete: `src/controllers/api/` (entire directory)
- Delete: `src/routes/api/all.js`, `altars.js`, `animalpens.js`, `beds.js`, `buildings.js`, `campfires.js`, `chests.js`, `crabpots.js`, `crafting.js`, `fishnets.js`, `maprooms.js`, `pets.js`, `players.js`, `thralls.js`, `thrones.js`, `trebuchets.js`, `vaults.js`, `waterwells.js`, `wheelsofpain.js`, `pippi/all.js`, `pippi/thespians.js`

- [ ] **Step 1: Delete database middleware**

```bash
rm src/middleware/database.js
```

- [ ] **Step 2: Delete all controllers**

```bash
rm -r src/controllers/
```

- [ ] **Step 3: Delete old individual route files**

```bash
rm src/routes/api/all.js src/routes/api/altars.js src/routes/api/animalpens.js \
   src/routes/api/beds.js src/routes/api/buildings.js src/routes/api/campfires.js \
   src/routes/api/chests.js src/routes/api/crabpots.js src/routes/api/crafting.js \
   src/routes/api/fishnets.js src/routes/api/maprooms.js src/routes/api/pets.js \
   src/routes/api/players.js src/routes/api/thralls.js src/routes/api/thrones.js \
   src/routes/api/trebuchets.js src/routes/api/vaults.js src/routes/api/waterwells.js \
   src/routes/api/wheelsofpain.js src/routes/api/pippi/all.js \
   src/routes/api/pippi/thespians.js
```

- [ ] **Step 4: Run all tests to confirm nothing broke**

```bash
npm test
```

Expected: all tests still PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: delete obsolete controllers and individual route files (~40 files removed)"
```

---

## Task 8: Update frontend

**Files:**
- Modify: `src/views/index.ejs`
- Modify: `public/assets/scripts/map.js`

- [ ] **Step 1: Add servers button and panel to src/views/index.ejs**

In the sidebar nav, add a servers button after the clans button.

Find:
```html
          <button class="sb-btn" data-panel="clans" title="<%= lang['ui.clan_filter'] %>">⚑</button>
```

Replace with:
```html
          <button class="sb-btn" data-panel="clans" title="<%= lang['ui.clan_filter'] %>">⚑</button>
          <button class="sb-btn" data-panel="servers" title="Servers">🖥</button>
```

Add a Servers panel after the Clans panel (just before the Players panel). Find the comment `<!-- Players panel -->` and insert before it:

```html
        <!-- Servers panel -->
        <div id="panel-servers" class="overlay-panel">
          <div class="panel-header">
            <span class="panel-title">Servers</span>
            <button class="panel-close">✕</button>
          </div>
          <div class="panel-body">
            <div id="servers-list"></div>
          </div>
        </div>

```

- [ ] **Step 2: Remove EJS lastupdate variable from status bar**

Find:
```html
        <div id="status-bar"><%= lang['ui.last_update'] %><span class="lastupdate"><%= lastupdate %></span></div>
```

Replace with:
```html
        <div id="status-bar"><%= lang['ui.last_update'] %><span class="lastupdate"></span></div>
```

- [ ] **Step 3: Add activeServerId and server-management functions to map.js**

After the existing variable declarations at the top of `public/assets/scripts/map.js` (after `var clusterGroups = {}`), add:

```js
var activeServerId = null
```

Before the `init()` function definition, add these new functions:

```js
function loadServers () {
  $.getJSON('api/servers', function (servers) {
    if (!servers || !servers.length) {
      toastr.error('No servers available. Check your configuration.')
      return
    }
    renderServersList(servers)
    if (servers.length === 1) {
      selectServer(servers[0].id)
    } else {
      openPanel('servers')
    }
  }).fail(function () {
    toastr.error('Failed to load server list.')
  })
}

function renderServersList (servers) {
  var html = ''
  servers.forEach(function (s) {
    var ago = s.timestamp ? timeSince(new Date(s.timestamp)) : 'never'
    var active = s.id === activeServerId ? ' server-active' : ''
    html += '<div class="server-item' + active + '">'
    html += '<span class="server-radio">' + (s.id === activeServerId ? '◉' : '○') + '</span>'
    html += '<span class="server-name" onclick="selectServer(\'' + escapeHtml(s.id) + '\')">' + escapeHtml(s.name) + '</span>'
    html += '<span class="server-ago">updated ' + ago + '</span>'
    html += '<button class="server-refresh-btn" onclick="refreshServer(\'' + escapeHtml(s.id) + '\')"' + (s.refreshing ? ' disabled' : '') + '>Refresh</button>'
    html += '</div>'
  })
  $('#servers-list').html(html)
}

function timeSince (date) {
  var seconds = Math.floor((new Date() - date) / 1000)
  if (seconds < 60) return 'just now'
  var minutes = Math.floor(seconds / 60)
  if (minutes < 60) return minutes + ' min. ago'
  var hours = Math.floor(minutes / 60)
  if (hours < 24) return hours + ' h. ago'
  return Math.floor(hours / 24) + ' d. ago'
}

function selectServer (serverId) {
  activeServerId = serverId
  closePanel()
  getPlayers()
  showAll()
}

function refreshServer (serverId) {
  $.ajax({
    url: 'api/' + serverId + '/refresh',
    method: 'POST',
    success: function (data) {
      toastr.success('Server data updated')
      if (serverId === activeServerId) {
        getPlayers()
        showAll()
      }
      $.getJSON('api/servers', function (servers) { renderServersList(servers) })
    },
    error: function (xhr) {
      var body = xhr.responseJSON || {}
      if (xhr.status === 429) {
        var mins = Math.ceil((body.retryAfter || 0) / 60)
        toastr.warning('Next refresh available in ' + mins + ' min.')
      } else if (xhr.status === 409) {
        toastr.info('Refresh already in progress.')
      } else {
        toastr.error('Refresh failed.')
      }
    }
  })
}
```

- [ ] **Step 4: Update init() — replace direct data loading with loadServers()**

In `init()`, find the last two lines:
```js
  getPlayers()
  showAll()
```

Replace with:
```js
  loadServers()
```

- [ ] **Step 5: Guard showKinds() against null activeServerId**

Find the `showKinds` function (the one containing `$.getJSON('api/' + url, ...)`). At its very beginning, before any other logic, add a guard:

Find (approximately line 418–419):
```js
  var kinds = Object.keys(activeKinds)
  if (kinds.length === 0) {
```

Replace with:
```js
  if (!activeServerId) return
  var kinds = Object.keys(activeKinds)
  if (kinds.length === 0) {
```

- [ ] **Step 6: Update all three $.getJSON API calls to include activeServerId**

Change line ~433 (inside `showKinds`):
```js
    $.getJSON('api/' + url, function (data) {
```
To:
```js
    $.getJSON('api/' + activeServerId + '/' + url, function (data) {
```

Change line ~574 (inside `showPlayerList`):
```js
  $.getJSON('api/players', function (data) {
```
To:
```js
  $.getJSON('api/' + activeServerId + '/players', function (data) {
```

Change line ~943 (inside `getPlayers`):
```js
  $.getJSON('api/players', function (data) {
```
To:
```js
  $.getJSON('api/' + activeServerId + '/players', function (data) {
```

Also add a guard at the start of `getPlayers()`:

Find `function getPlayers () {` and add at the top of the function body:
```js
  if (!activeServerId) return
```

- [ ] **Step 7: Commit**

```bash
git add src/views/index.ejs public/assets/scripts/map.js
git commit -m "feat: add server selector panel, refresh button, and activeServerId prefix to all API calls"
```

---

## Task 9: Update config template and .gitignore

**Files:**
- Modify: `src/conan-exiles-admin-map.ini`
- Modify: `.gitignore`

- [ ] **Step 1: Rewrite src/conan-exiles-admin-map.ini**

```ini
[SETTINGS]
; Interface language. Options are:
; en - English
; es - Spanish
language = en

; Port to be used for the application.
port = 3001

; ─────────────────────────────────────────────────
; Define each game server in a [SERVER_<id>] section.
; Use forward slashes in paths (e.g. C:/GameServers/server1/game.db)
; refresh_cooldown: minimum seconds between manual data refreshes (default: 300)
; ─────────────────────────────────────────────────

[SERVER_server1]
name = Server 1
database = game.db
refresh_cooldown = 300

; [SERVER_server2]
; name = Server 2
; database = C:/GameServers/server2/game.db
; refresh_cooldown = 300

[USERS]
; Leave this section empty (or remove it entirely) to disable authentication.
; Format:  username = password:server1,server2
; Use * to grant access to all servers.
; superadmin = secretpass:*
; admin1 = pass1:server1
; admin2 = pass2:server2
demo = 1234:*
```

- [ ] **Step 2: Add snapshots/ to .gitignore**

Open `.gitignore` and add this line:
```
snapshots/
```

- [ ] **Step 3: Run all tests one final time**

```bash
npm test
```

Expected: all tests PASS.

- [ ] **Step 4: Start the app and perform a smoke test**

```bash
npm start
```

Expected:
- App starts on port 3001
- Browser opens
- The Servers panel appears (or auto-selects if one server)
- Clicking Refresh triggers an update (requires `game.db` to exist at the configured path)
- After refresh, markers appear on the map
- Switching between servers clears and reloads all markers

- [ ] **Step 5: Final commit**

```bash
git add src/conan-exiles-admin-map.ini .gitignore
git commit -m "chore: update INI template for multi-server config, add snapshots/ to .gitignore"
```

---

## Self-Review

**Spec coverage check:**
- ✅ Multi-server `[SERVER_x]` INI sections
- ✅ Backward compat: `[CONAN_EXILES]` → `server1`; `user = pass` → `servers: ['*']`
- ✅ Users with server permissions, wildcard `*`
- ✅ Snapshot service: `load()`, `get()`, `refresh()`, rate limiting, disk persistence
- ✅ `serverAccess`: 404 by `config.servers` lookup, 403 by user permissions
- ✅ Auth stores `res.locals.user`
- ✅ Factory route map with explicit `path → key` (camelCase/lowercase decoupled)
- ✅ `GET /api/servers` with `timestamp: null` when no snapshot
- ✅ `POST /api/:serverId/refresh` returns 429/409 error codes
- ✅ Entity responses maintain `{ data, update }` format (frontend compatibility)
- ✅ `addKind()` applied to building entities (matches old BaseController behavior)
- ✅ Binary field transformers consolidated into snapshot service
- ✅ All old controllers and route files deleted
- ✅ `src/middleware/database.js` deleted
- ✅ `language.js` uses `config.settings.language`
- ✅ Frontend: `activeServerId`, server panel, Refresh button, guarded API calls
- ✅ `snapshots/` in `.gitignore`
- ✅ INI template updated

**Type consistency:**
- `createSnapshotService()` returns `{ load, get, refresh, _snapshots }` — tests reference `_snapshots` ✓
- `snap.data.crabPots` → route `{ path: 'crabpots', key: 'crabPots' }` ✓
- `snap.data.fishNets` → route `{ path: 'fishnets', key: 'fishNets' }` ✓
- `snap.data.waterWells` → route `{ path: 'waterwells', key: 'waterWells' }` ✓
- `snap.data.wheelsOfPain` → route `{ path: 'wheelsofpain', key: 'wheelsOfPain' }` ✓
- `snap.data.mapRooms` → route `{ path: 'maprooms', key: 'mapRooms' }` ✓
- `snap.data.pippiAll` / `pippiThespians` → routes `pippi/all` / `pippi/thespians` ✓
- `config.settings`, `config.servers`, `config.users` used consistently across all tasks ✓
- `snapshotService.get()` returns `null` → routes handle `snap?.data[key] ?? []` ✓
