# Conan Exiles Admin Map

**English** | [Русский](README.ru.md)

An admin dashboard for Conan Exiles servers — view players, structures and thralls on an interactive map.

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
language = ru       ; ru, en or es
port     = 3001

[SERVER_server1]
name             = My Server
database         = C:/ConanExiles/Saved/game.db
refresh_cooldown = 300              ; seconds between manual refreshes
```

#### Multiple servers with access control

```ini
[SETTINGS]
language = en
port     = 3001

[SERVER_pve]
name             = PvE Server
database         = C:/Servers/pve/game.db
refresh_cooldown = 300

[SERVER_pvp]
name             = PvP Server
database         = C:/Servers/pvp/game.db
refresh_cooldown = 300

[USERS]
; Format:  username = password:server1,server2
; Use * to grant access to all servers.
superadmin = secretpass:*
pvp_admin  = pvppass:pvp
pve_admin  = pvepass:pve
; Omit [USERS] section entirely to disable authentication.
```

**Notes:**
- Database paths use forward slashes. Backslashes are also accepted.
- `refresh_cooldown` defaults to 300 seconds when omitted.
- The old `[CONAN_EXILES]` section is still supported for backward compatibility (treated as a single server named `server1`).

### How data loading works

The app does **not** read `game.db` on page load. Instead:

1. Open the **Servers** panel (🖥 in the sidebar).
2. Click **Refresh** next to the server whose data you want to update.
3. The snapshot is saved to a `snapshots/` folder so subsequent startups load instantly without hitting the database.

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

#### v0.5.0 (June 15, 2026)

- **Full UI redesign** — new cool-grey theme, Segoe UI typography, larger and more readable fonts, rounded surfaces and higher contrast
- **Russian localization** — added a complete `ru` locale (interface + item names) and made it the default language
- **Tile optimization** — regenerated tiles at native zoom 2–4 only (16×16 max) and dropped the upscaled zoom 5–6 levels, cutting tile count from ~10,600 to ~670; closer zoom is browser-upscaled. Cache-busting so updated tiles load without a manual cache clear
- **Isle of Siptah map** — re-sliced from the source image; the letterbox background now blends with the theme instead of a hard black border
- **Zoom-based clustering** — markers cluster when zoomed out and split into individual markers when zoomed in (viewport-virtualized), fixing redraw lag on large servers; optional "cluster at all zoom levels"
- **Multi-select clan filter** — click clans to toggle them on/off; an empty selection shows everything
- **Always-on side panel** — the "Structures" list (clans + guildless owners) is the default panel and stays visible; other panels replace it on demand
- **Markers** — vivid per-clan colours with a dark outline; missing tiles no longer show the broken-image placeholder
- **Player list** — trimmed to Name / Guild / Last online; rank and level moved into the player tooltip
- **Tooltips** — cluster owners labelled correctly (not "Player"); unified date format `dd.MM.yyyy HH:mm`
- **Map navigation** — free panning (removed forced re-centering); map switch buttons moved to a top-center segmented bar
- Removed the sidebar logo and unused web-font imports; larger, more prominent sidebar icons

#### v0.4.2 (June 2026)

- **Multi-server support** — define any number of `[SERVER_<id>]` sections; switch between them from the new Servers panel
- **Snapshot-based data loading** — data is read from `game.db` only when you click Refresh; snapshots are cached to disk so restarts are instant
- **Per-user server access control** — `[USERS]` entries now support `user = pass:server1,server2` syntax; use `*` for full access
- **Configurable refresh cooldown** per server (`refresh_cooldown` in seconds)
- Servers panel with live status (last updated time) and per-server Refresh button
- Fixed exe build: `better_sqlite3.node` is now correctly bundled for Node 24

#### v0.4.1 (June 2026)

- System tray icon with "Open in browser" and "Stop server" actions
- Browser opens automatically on startup

#### v0.4.0 (June 2026)

- Added Isle of Siptah map support with calibrated coordinates
- Added Thralls layer
- Global search with Ctrl+F and result navigation
- Clan panel with member counts, activity indicators and sorting
- Marker tooltips with tier/alpha badges and teleport hint
- Dark fantasy sidebar UI — removed Bootstrap dependency
- Converted all map tiles from PNG to WebP (~30–50% smaller)
- Regenerated zoom 2–5 tiles from zoom-6 source for coordinate accuracy
- 365-day browser cache for tile assets
- GitHub Actions release workflow (builds Windows .exe automatically)

#### v0.2.0 (November 2018)

- Added more structure filters: Altars, Animal pens, Chests, Map rooms, Trebuchets, Vaults, Water wells, All Crafting Placeables, All Pippi Placeables
- Removed player/guild id from legend

#### v0.1.0 (October 2018)

- Spanish (es) and English (en) translations
- Basic Auth support
- Config file for language, port, database path and users

#### v0.0.1 (October 2018)

- First release
