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

  entityRoutes.forEach(({ path, key }) => {
    router.get(`/:serverId/${path}`, serverAccessMiddleware, (req, res) => {
      const snap = snapshotService.get(req.params.serverId)
      res.json({ data: snap?.data[key] ?? [], update: snap?.timestamp ?? null })
    })
  })

  // Per-owner decay timers (object: ownerId -> { hours, protected })
  router.get('/:serverId/decay', serverAccessMiddleware, (req, res) => {
    const snap = snapshotService.get(req.params.serverId)
    res.json({ data: snap?.data.decay ?? {}, update: snap?.timestamp ?? null })
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
