# Changelog

[English](CHANGELOG.md) | [Русский](CHANGELOG.ru.md)

#### v0.7.0 (June 15, 2026)

- **Admin login (cookie session)** — viewing is now public; logging in unlocks admin features. Accounts live in a required `[AUTH]` section as scrypt hashes; generate them with `npm run set-password <password>` (policy: ≥16 chars, lower/upper/digit). Replaces the old Basic Auth + per-server access control
- **Custom markers** — admins can right-click the map → "Add marker", pick one of 62 in-game map icons, and label it. A new "Markers" sidebar mode toggles the map between game data ("houses") and custom markers; markers are stored per server in `markers/<server>.json` (separate from the read-only `game.db`) and picked up live
- **Per-marker decay** — buildings about to decay get a coloured outline (red <24h / overdue, yellow <72h) and a decay row in their tooltip; clusters inherit the worst warning of their members. The structures-list decay is now computed from the markers actually drawn, so the list and map always agree
- **Admin-guild decay protection** — guilds matching `admin_guilds` patterns (default `%ADMIN%,%Админ%`) are always shown as protected
- **Guild roster** — hovering a clan in the structures list shows its members (level, online/last-seen); the list search also finds a clan by a member's name
- **Right-click context menu** — "Copy coordinates" (X Y) and "Add marker" (admin)
- Muted the per-clan marker palette so decay warnings stand out; modals close only via Esc / ✕ (not outside click)

#### v0.6.0 (June 15, 2026)

- **Bind address setting** — new `host` in `[SETTINGS]` (`127.0.0.1` by default, or `0.0.0.0`); the app no longer listens on all interfaces unless you ask it to
- **Automatic data refresh** — `auto_refresh` (seconds) in `[SETTINGS]` reads `game.db` on a timer and immediately on startup; the manual Refresh button was removed and the UI now polls for fresh data
- **Read-only API** — removed the `POST /api/<id>/refresh` write endpoint and the per-server `refresh_cooldown`; data can no longer be changed from the outside
- **Decay timer** — the structures list shows each owner's most-urgent building decay (from `DecayTimestamp`/`serverruntime`), colour-coded, with a "by decay" sort
- **Bidirectional sorting** — count / name sorts in the structures list toggle direction on re-click (↑/↓)
- **Menu redesign** — reordered to Structures · Players · Filters · Search · Servers, with simple vector (SVG) icons that follow the accent/text colour; removed the logo
- **Custom program icon** — new tray icon and browser favicon
- Simplified the Caddy guide (read-only API + localhost bind ⇒ nothing to block); authentication is now disabled by default in the config template

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
