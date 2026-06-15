import path from 'path'
import express, { Router } from 'express'
import config from '../../config'
import serverAccessMiddleware from '../../middleware/serverAccess'
import requireAdmin from '../../middleware/requireAdmin'
import snapshotService from '../../services/snapshot'
import { verifyPassword, signToken, SESSION_COOKIE } from '../../services/auth'
import { listMarkers, addMarker, removeMarker, listIcons } from '../../services/markers'

const VALID_MAPS = ['exiledlands', 'siptah']

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

  // ── Auth: cookie session login (viewing is public; this gates admin actions) ──
  router.post('/login', express.json(), (req, res) => {
    const { username, password } = req.body || {}
    const stored = username ? config.admins.get(username) : null
    if (!stored || !verifyPassword(password || '', stored)) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }
    res.cookie(SESSION_COOKIE, signToken(username), {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    })
    res.json({ admin: true, username })
  })

  router.post('/logout', (req, res) => {
    res.clearCookie(SESSION_COOKIE)
    res.json({ admin: false })
  })

  router.get('/me', (req, res) => {
    res.json({ admin: !!res.locals.isAdmin, username: res.locals.adminUser })
  })

  router.get('/servers', (req, res) => {
    const list = config.servers.map(s => {
      const snap = snapshotService.get(s.id)
      return { id: s.id, name: s.name, timestamp: snap?.timestamp ?? null, refreshing: snap?.refreshing ?? false }
    })
    res.json(list)
  })

  entityRoutes.forEach(({ path, key }) => {
    router.get(`/:serverId/${path}`, serverAccessMiddleware, (req, res) => {
      const snap = snapshotService.get(req.params.serverId)
      res.json({ data: snap?.data[key] ?? [], update: snap?.timestamp ?? null })
    })
  })

  // Players — character attribute stats are attached only for logged-in admins.
  router.get('/:serverId/players', serverAccessMiddleware, (req, res) => {
    const snap = snapshotService.get(req.params.serverId)
    let players = snap?.data.players ?? []
    if (res.locals.isAdmin && snap?.data.stats) {
      const stats = snap.data.stats
      players = players.map(p => ({ ...p, stats: stats[p.char_id] || null }))
    }
    res.json({ data: players, update: snap?.timestamp ?? null })
  })

  // ── Custom markers (admin-placed) ──────────────────────────────────────────
  router.get('/marker-icons', (req, res) => {
    res.json({ icons: listIcons() })
  })

  router.get('/:serverId/custom-markers', serverAccessMiddleware, (req, res) => {
    res.json({ data: listMarkers(req.params.serverId) })
  })

  router.post('/:serverId/custom-markers', serverAccessMiddleware, requireAdmin, express.json(), (req, res) => {
    const { map, x, y, icon, label } = req.body || {}
    if (!VALID_MAPS.includes(map)) return res.status(400).json({ error: 'Invalid map' })
    if (!Number.isFinite(+x) || !Number.isFinite(+y)) return res.status(400).json({ error: 'Invalid coordinates' })
    const safeIcon = path.basename(String(icon || ''))
    if (!listIcons().includes(safeIcon)) return res.status(400).json({ error: 'Unknown icon' })
    const safeLabel = String(label || '').trim().slice(0, 80)
    const marker = addMarker(req.params.serverId, { map, x: +x, y: +y, icon: safeIcon, label: safeLabel })
    res.json(marker)
  })

  router.delete('/:serverId/custom-markers/:id', serverAccessMiddleware, requireAdmin, (req, res) => {
    const ok = removeMarker(req.params.serverId, req.params.id)
    res.status(ok ? 200 : 404).json({ ok })
  })

  // Decay timers: per-owner (ownerId -> { hours, protected }) and per building
  // object (objectId -> hoursLeft) for highlighting individual map markers.
  router.get('/:serverId/decay', serverAccessMiddleware, (req, res) => {
    const snap = snapshotService.get(req.params.serverId)
    res.json({
      data: snap?.data.decay ?? {},
      byObject: snap?.data.decayByObject ?? {},
      update: snap?.timestamp ?? null
    })
  })

  return router
}

export const apiRoutes = (app) => {
  snapshotService.load()

  const refreshAll = () => {
    for (const server of config.servers) {
      snapshotService.refresh(server.id).catch(e => {
        console.error(`Refresh failed for ${server.id}:`, e.message)
      })
    }
  }

  if (config.settings.autoRefresh > 0) {
    // Auto-refresh on: refresh now (fresh data right after startup) and on a timer
    console.log(`Auto-refresh enabled: every ${config.settings.autoRefresh}s`)
    refreshAll()
    setInterval(refreshAll, config.settings.autoRefresh * 1000)
  } else {
    // Auto-refresh off: only load servers that have no cached snapshot yet
    for (const server of config.servers) {
      if (!snapshotService.get(server.id)) {
        snapshotService.refresh(server.id).catch(e => {
          console.error(`Initial refresh failed for ${server.id}:`, e.message)
        })
      }
    }
  }

  app.use('/api', buildApiRouter())
}
