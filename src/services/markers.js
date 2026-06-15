import { writeFileSync, mkdirSync, existsSync, readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import crypto from 'crypto'

// Custom (admin-placed) markers, stored per server in markers/<serverId>.json.
// Separate from game.db, which stays strictly read-only.
const MARKERS_DIR = join(process.cwd(), 'markers')
const ICONS_DIR = join(__dirname, '../../public/assets/markers')

const cache = new Map() // serverId -> array

function fileFor (serverId) { return join(MARKERS_DIR, `${serverId}.json`) }

function load (serverId) {
  if (cache.has(serverId)) return cache.get(serverId)
  let arr = []
  try {
    if (existsSync(fileFor(serverId))) arr = JSON.parse(readFileSync(fileFor(serverId), 'utf8'))
  } catch (e) {
    console.error(`Failed to read markers for ${serverId}:`, e.message)
  }
  if (!Array.isArray(arr)) arr = []
  cache.set(serverId, arr)
  return arr
}

function persist (serverId) {
  if (!existsSync(MARKERS_DIR)) mkdirSync(MARKERS_DIR, { recursive: true })
  writeFileSync(fileFor(serverId), JSON.stringify(cache.get(serverId) || []))
}

export function listMarkers (serverId) {
  return load(serverId)
}

export function addMarker (serverId, m) {
  const arr = load(serverId)
  const marker = {
    id: crypto.randomBytes(6).toString('hex'),
    map: m.map, x: m.x, y: m.y, icon: m.icon, label: m.label
  }
  arr.push(marker)
  persist(serverId)
  return marker
}

export function removeMarker (serverId, id) {
  const arr = load(serverId)
  const i = arr.findIndex(x => x.id === id)
  if (i === -1) return false
  arr.splice(i, 1)
  persist(serverId)
  return true
}

// Available marker-icon webp files (shipped in public/assets/markers).
export function listIcons () {
  try {
    return readdirSync(ICONS_DIR).filter(f => f.toLowerCase().endsWith('.webp')).sort()
  } catch (e) {
    return []
  }
}
