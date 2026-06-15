import Database from 'better-sqlite3'
import { writeFileSync, mkdirSync, existsSync, readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { SmartBuffer } from 'smart-buffer'
import queries from '../config/sql'
import config from '../config'

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

// SQL-style LIKE matcher (supports % = any run, _ = one char), case-insensitive.
function likeMatch (text, pattern) {
  const rx = '^' + pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/%/g, '.*').replace(/_/g, '.') + '$'
  return new RegExp(rx, 'i').test(text || '')
}

// ── Decay timer (ветшание) ───────────────────────────────────────────────────
// Decay model, ported from the reference C# (ConanDb.cs):
//   serverruntime  = current server time in seconds (dw_settings)
//   DecayTimestamp = 16-byte blob, float32 LE at offset 12 = decay_at (server-seconds)
//   DecayDisabled  = last byte 0x01 => decay off (protected)
//   hours_left     = (decay_at - serverruntime) / 3600
// Guilds whose name matches an adminGuildPatterns entry are always protected.

const round1 = n => Math.round(n * 10) / 10

// Read the raw decay context once (shared by the per-owner and per-object views).
function decayContext (db, adminGuildPatterns) {
  let serverRuntime = 0
  const rt = db.prepare("SELECT CAST(value AS REAL) AS v FROM dw_settings WHERE name='serverruntime'").get()
  if (rt && rt.v != null) serverRuntime = Number(rt.v)

  // Admin guilds (by name pattern) — their owner ids are forced protected.
  const adminOwners = new Set()
  const patterns = adminGuildPatterns || []
  if (patterns.length) {
    for (const g of db.prepare('SELECT guildId, name FROM guilds').all()) {
      if (g.name && patterns.some(p => likeMatch(g.name, p))) adminOwners.add(g.guildId)
    }
  }

  const ownerOf = new Map()
  for (const r of db.prepare('SELECT object_id, owner_id FROM buildings WHERE owner_id <> 0').all()) {
    ownerOf.set(r.object_id, r.owner_id)
  }

  const decayAt = new Map()
  const protectedActors = new Set()
  for (const r of db.prepare("SELECT object_id, value FROM properties WHERE name LIKE '%.DecayTimestamp'").all()) {
    if (r.value == null) continue
    const b = Buffer.isBuffer(r.value) ? r.value : Buffer.from(r.value)
    if (b.length !== 16) { protectedActors.add(r.object_id); continue }
    const ts = b.readFloatLE(12)
    if (!Number.isFinite(ts) || ts <= 0 || ts >= 1e10) protectedActors.add(r.object_id)
    else decayAt.set(r.object_id, ts)
  }
  for (const r of db.prepare("SELECT object_id, value FROM properties WHERE name LIKE '%.DecayDisabled'").all()) {
    if (r.value == null) continue
    const b = Buffer.isBuffer(r.value) ? r.value : Buffer.from(r.value)
    if (b.length > 0 && b[b.length - 1] === 1) protectedActors.add(r.object_id)
  }

  return { serverRuntime, adminOwners, ownerOf, decayAt, protectedActors }
}

// Per-owner most-urgent decay: { [ownerId]: { hours: <min|null>, protected: <bool> } }
function buildByOwner (ctx) {
  const { serverRuntime, adminOwners, ownerOf, decayAt, protectedActors } = ctx
  const byOwner = {}
  for (const [objId, ownerId] of ownerOf) {
    let e = byOwner[ownerId]
    if (!e) e = byOwner[ownerId] = { hours: null, protected: true }
    if (adminOwners.has(ownerId)) continue  // admin guild => stay protected, ignore timers
    if (protectedActors.has(objId)) continue
    const at = decayAt.get(objId)
    if (at === undefined) continue          // no decay info => leave as protected
    const hours = (at - serverRuntime) / 3600
    e.protected = false
    if (e.hours === null || hours < e.hours) e.hours = hours
  }
  for (const k of Object.keys(byOwner)) {
    if (byOwner[k].hours !== null) byOwner[k].hours = round1(byOwner[k].hours)
  }
  return byOwner
}

// Per-object decay hours for non-protected building objects: { [objectId]: hoursLeft }.
// Protected (admin / disabled / sentinel) and timer-less objects are omitted.
function buildByObject (ctx) {
  const { serverRuntime, adminOwners, ownerOf, decayAt, protectedActors } = ctx
  const byObject = {}
  for (const [objId, ownerId] of ownerOf) {
    if (adminOwners.has(ownerId)) continue
    if (protectedActors.has(objId)) continue
    const at = decayAt.get(objId)
    if (at === undefined) continue
    byObject[objId] = round1((at - serverRuntime) / 3600)
  }
  return byObject
}

export function computeDecay (db, adminGuildPatterns = config.settings.adminGuildPatterns) {
  try {
    return buildByOwner(decayContext(db, adminGuildPatterns))
  } catch (e) {
    console.error('Decay computation failed:', e.message)
    return {}
  }
}

export function computeDecayByObject (db, adminGuildPatterns = config.settings.adminGuildPatterns) {
  try {
    return buildByObject(decayContext(db, adminGuildPatterns))
  } catch (e) {
    console.error('Decay-by-object computation failed:', e.message)
    return {}
  }
}

// ── Character attributes (admin-only stats) ──────────────────────────────────
// character_stats(char_id, stat_type, stat_id, stat_value); attributes are
// stat_type=0. Wanted ids: 17 Might, 14 Health, 19 Athleticism, 27 Leadership,
// 15 Stamina, 16 Encumbrance. Missing rows mean 0 points spent.
const ATTR_IDS = { 17: 'str', 14: 'vit', 19: 'agi', 27: 'auth', 15: 'sta', 16: 'mastery' }

export function computeStats (db) {
  try {
    const rows = db.prepare(
      'SELECT char_id, stat_id, stat_value FROM character_stats WHERE stat_type = 0 AND stat_id IN (14,15,16,17,19,27)'
    ).all()
    const out = {}
    for (const r of rows) {
      const key = ATTR_IDS[r.stat_id]
      if (!key) continue
      if (!out[r.char_id]) out[r.char_id] = { str: 0, vit: 0, agi: 0, auth: 0, sta: 0, mastery: 0 }
      out[r.char_id][key] = Math.round(r.stat_value)
    }
    return out
  } catch (e) {
    console.error('Stats computation failed:', e.message)
    return {}
  }
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

    _snapshots.set(serverId, { ...existing, refreshing: true })

    try {
      const db = new Database(serverCfg.database, { readonly: true })
      const run = sql => db.prepare(sql).all()
      let data
      try {
        data = {
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
          decay:          computeDecay(db),
          decayByObject:  computeDecayByObject(db),
          stats:          computeStats(db),
        }
      } finally {
        db.close()
      }

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

const snapshotService = createSnapshotService(config.servers)
export default snapshotService
