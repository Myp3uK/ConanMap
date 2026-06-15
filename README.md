# Conan Exiles Admin Map

**English** | [Русский](README.ru.md)

An admin dashboard for Conan Exiles servers — view players, structures and thralls on an interactive map.

<p align="center">
  <img src="docs/screenshot.webp" alt="Conan Exiles Admin Map — interactive map with clustered markers" width="800">
</p>

## Features

- Interactive map with support for both **Exiled Lands** and **Isle of Siptah**
- Markers for all major entity types:
  - Players (online players highlighted)
  - Pets
  - Thralls
  - Buildings (Foundations)
  - Crafting placeables
  - Altars
  - Thrones
  - Animal Pens
  - Bedrolls / Beds
  - Campfires / Bonfires
  - Chests
  - Map rooms
  - Trebuchets
  - Vaults
  - Water wells
  - Wheels of Pain
  - Fish traps / Shellfish traps
  - All Pippi placeables & Thespians
- **Multi-server support** — manage multiple Conan Exiles servers from one dashboard
- **Snapshot caching** — data is loaded on demand (Refresh button); the server never polls `game.db` automatically
- **Per-user server access** — restrict each user account to specific servers
- **Global search** (Ctrl+F) — find any marker by name
- **Clan panel** — list of guilds with member counts and activity indicators
- **Marker tooltips** with tier/alpha badges and one-click `TeleportPlayer` command
- Filter markers by guild or show lone players
- Switch between Exiled Lands and Isle of Siptah maps
- Dark fantasy sidebar UI
- Fast tile loading via WebP tiles and long-term browser caching
- Password-protect access via config file (Basic Auth)
- **System tray icon** — stop the server from the tray without Task Manager
- **Browser auto-opens** on startup

## Installation

1. Grab the latest `.zip` from the [Releases](https://github.com/Myp3uK/ConanMap/releases) page.
2. Unzip anywhere convenient (does **not** need to be next to `game.db`).
3. Edit `conan-exiles-admin-map.ini` — set database paths, port, language and optional credentials.
4. Run `conan-exiles-admin-map.exe` — the browser opens automatically and a tray icon appears.
5. Click the **Servers** button (🖥) in the sidebar, then press **Refresh** to load data from the database.
6. To stop the server use the tray icon → **Stop server** (or close from Task Manager if needed).

### Configuration (`conan-exiles-admin-map.ini`)

#### Single server (minimal)

```ini
[SETTINGS]
language     = ru          ; ru, en or es
host         = 127.0.0.1   ; 127.0.0.1 = local only, 0.0.0.0 = all interfaces
port         = 3001
auto_refresh = 300         ; seconds between automatic data refreshes (0 = off)

[SERVER_server1]
name             = My Server
database         = C:/ConanExiles/Saved/game.db
```

#### Multiple servers + admin login

```ini
[SETTINGS]
language     = ru
host         = 127.0.0.1
port         = 3001
auto_refresh = 300

[SERVER_pve]
name             = PvE Server
database         = C:/Servers/pve/game.db

[SERVER_pvp]
name             = PvP Server
database         = C:/Servers/pvp/game.db

[AUTH]
; Admin accounts. Viewing the map is PUBLIC; logging in unlocks admin features
; (placing custom markers). REQUIRED — the app won't start without a valid entry.
; Each value is a scrypt hash; generate it with:  npm run set-password <password>
admin   = scrypt$<salt>$<hash>
admin2  = scrypt$<salt>$<hash>
```

**Notes:**
- `host` defaults to `127.0.0.1` (local only). Use `0.0.0.0` to listen on all interfaces, or keep it local and publish via a reverse proxy — see [docs/caddy.md](docs/caddy.md).
- `auto_refresh` controls how often `game.db` is read automatically (seconds; `0` disables). There is no manual Refresh button in the UI.
- `admin_guilds` — comma-separated guild-name patterns (SQL `LIKE`: `%` = any, `_` = one char) whose buildings are treated as decay-protected and skip the decay timer. Default: `%ADMIN%,%Админ%`.
- **`[AUTH]` is required.** Viewing is public; admin login (cookie session) gates admin-only actions. Generate password hashes with `npm run set-password <password>` (policy: ≥16 chars with lowercase, uppercase and a digit). The plaintext password is never stored.
- Database paths use forward slashes. Backslashes are also accepted.
- The game database (`game.db`) is read-only. Custom markers placed by admins are stored separately in `markers/<server>.json`.
- The old `[CONAN_EXILES]` section is still supported for backward compatibility (treated as a single server named `server1`).

### How data loading works

The app does **not** read `game.db` on every page load. Instead:

1. On startup each server's data is read once and cached as a snapshot in a `snapshots/` folder, so restarts load instantly.
2. If `auto_refresh` is set, the snapshot is refreshed from `game.db` on that interval automatically.
3. The UI reads the cached snapshot; there is no manual Refresh button. Select a server in the **Servers** panel (🖥) to view its data.

## Credits

This project is a fork of [Evrard-ro/conan-exiles-admin-map](https://github.com/Evrard-ro/conan-exiles-admin-map),
which is itself a fork of the original [germanrcuriel/conan-exiles-admin-map](https://github.com/germanrcuriel/conan-exiles-admin-map)
by Germán Robledo Curiel. Licensed under MIT — see [LICENSE](LICENSE).

## Development

Requirements: Node.js 24+

```bash
npm install
npm start        # transpile + run via babel-node on port 3001
npm test         # run test suite
```

Place a `conan-exiles-admin-map.ini` (or point it at a real `game.db`) in the project root before starting.

### Build Windows .exe

Requires bash / WSL:

```bash
npm run build    # outputs build/conan-exiles-admin-map-vX.Y.Z.zip
```

After building, edit `build/conan-exiles-admin-map.ini` to point `database` at your actual `game.db` before running the exe.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for the full release history.
