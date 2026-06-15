import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import ini from 'ini'

const DEFAULT_COOLDOWN = 300
const DEFAULT_PORT = 3001
const DEFAULT_LANGUAGE = 'en'

export function parseConfig(rawIni) {
  const parsed = ini.parse(rawIni)

  const parsedPort = parseInt(parsed.SETTINGS?.port, 10)
  const settings = {
    language: parsed.SETTINGS?.language || DEFAULT_LANGUAGE,
    port: Number.isFinite(parsedPort) ? parsedPort : DEFAULT_PORT
  }

  const servers = []
  for (const key of Object.keys(parsed)) {
    if (key.startsWith('SERVER_')) {
      const id = key.slice(7)
      const sec = parsed[key]
      const parsedCooldown = parseInt(sec.refresh_cooldown, 10)
      servers.push({
        id,
        name: sec.name || id,
        database: (sec.database || '').replace(/\\/g, '/'),
        refreshCooldown: Number.isFinite(parsedCooldown) ? parsedCooldown : DEFAULT_COOLDOWN
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
