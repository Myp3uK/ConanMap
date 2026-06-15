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
