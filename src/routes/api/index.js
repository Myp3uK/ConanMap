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
  for (const server of config.servers) {
    if (!snapshotService.get(server.id)) {
      snapshotService.refresh(server.id).catch(e => {
        console.error(`Auto-refresh failed for ${server.id}:`, e.message)
      })
    }
  }
  app.use('/api', buildApiRouter())
}
