import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import ini from 'ini'

const DEFAULT_PORT = 3001
const DEFAULT_LANGUAGE = 'en'
const DEFAULT_HOST = '127.0.0.1'
// Guild-name LIKE patterns whose owners are treated as decay-protected (admin builds).
const DEFAULT_ADMIN_GUILDS = ['%ADMIN%', '%Админ%']

function parseAdminGuilds(raw) {
  if (raw == null || String(raw).trim() === '') return DEFAULT_ADMIN_GUILDS
  const list = String(raw).split(',').map(s => s.trim()).filter(Boolean)
  return list.length ? list : DEFAULT_ADMIN_GUILDS
}

export function parseConfig(rawIni) {
  const parsed = ini.parse(rawIni)

  const parsedPort = parseInt(parsed.SETTINGS?.port, 10)
  const parsedAutoRefresh = parseInt(parsed.SETTINGS?.auto_refresh, 10)
  const settings = {
    language: parsed.SETTINGS?.language || DEFAULT_LANGUAGE,
    port: Number.isFinite(parsedPort) ? parsedPort : DEFAULT_PORT,
    host: parsed.SETTINGS?.host || DEFAULT_HOST,
    // seconds between automatic data refreshes; 0 (or unset) disables auto-refresh
    autoRefresh: Number.isFinite(parsedAutoRefresh) && parsedAutoRefresh > 0 ? parsedAutoRefresh : 0,
    // comma-separated guild-name LIKE patterns whose buildings skip the decay timer
    adminGuildPatterns: parseAdminGuilds(parsed.SETTINGS?.admin_guilds)
  }

  const servers = []
  for (const key of Object.keys(parsed)) {
    if (key.startsWith('SERVER_')) {
      const id = key.slice(7)
      const sec = parsed[key]
      servers.push({
        id,
        name: sec.name || id,
        database: (sec.database || '').replace(/\\/g, '/')
      })
    }
  }

  // Backward compat: old [CONAN_EXILES] section
  if (servers.length === 0 && parsed.CONAN_EXILES) {
    servers.push({
      id: 'server1',
      name: 'Server 1',
      database: (parsed.CONAN_EXILES.database || '').replace(/\\/g, '/')
    })
  }

  // [AUTH] — admin accounts (username = scrypt hash). Gates write/admin actions;
  // viewing is public. Validated at startup (see conan-exiles-admin-map.js).
  const admins = new Map()
  if (parsed.AUTH) {
    for (const [username, value] of Object.entries(parsed.AUTH)) {
      admins.set(username, String(value))
    }
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

  return { settings, servers, users, admins }
}

const configFile = join(process.cwd(), 'conan-exiles-admin-map.ini')

const config = parseConfig(
  existsSync(configFile) ? readFileSync(configFile, 'UTF8') : ''
)

export default config
