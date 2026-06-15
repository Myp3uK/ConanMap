# Map Redesign: Dark Fantasy Sidebar Layout — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Bootstrap navbar with a dark-fantasy sidebar + overlay panels, removing Bootstrap entirely while preserving all existing map.js logic.

**Architecture:** Full rewrite of `index.ejs` (new sidebar + panel HTML) and `map.css` (CSS-variable dark theme); targeted edits to `map.js` (~60 lines changed). jQuery stays because `map.js` uses it throughout. Bootstrap CSS/JS and Popper.js are removed.

**Tech Stack:** EJS, vanilla CSS (CSS variables, `backdrop-filter`), jQuery 3.3.1, Leaflet 1.3.4 + MarkerCluster, toastr, clipboard.js

---

## File Map

| File | Change |
|---|---|
| `src/views/index.ejs` | Full rewrite |
| `public/assets/css/map.css` | Full replacement |
| `public/assets/scripts/map.js` | Targeted edits (~60 lines) |

---

## Task 1 — Replace map.css with dark-fantasy theme

**Files:**
- Modify: `public/assets/css/map.css`

- [ ] **Step 1: Replace map.css entirely with the new stylesheet**

Overwrite `public/assets/css/map.css` with:

```css
/* ── Tokens ── */
:root {
  --bg-deep:    #0a0806;
  --bg-sidebar: #110a03;
  --bg-panel:   rgba(17, 10, 3, 0.94);
  --border:     #4a2e10;
  --border-dim: #2a1a08;
  --accent:     #c8860a;
  --accent-dim: #7a5a2a;
  --text:       #d4b896;
  --text-dim:   #7a5a2a;
  --text-muted: #4a3a1a;
}

*, *::before, *::after { box-sizing: border-box; }

html, body {
  width: 100%; height: 100%; margin: 0; padding: 0;
  background: var(--bg-deep);
  font-family: 'Crimson Text', Georgia, serif;
  color: var(--text);
  overflow: hidden;
}

/* ── App shell ── */
#app { display: flex; width: 100vw; height: 100vh; }

/* ── Map container ── */
#map-container { flex: 1; position: relative; overflow: hidden; }

#map { position: absolute; inset: 0; background: var(--bg-deep); z-index: 1; }

/* ── Sidebar ── */
#sidebar {
  width: 52px;
  flex-shrink: 0;
  background: var(--bg-sidebar);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 0;
  z-index: 200;
}

.sidebar-logo {
  font-size: 20px;
  color: var(--accent);
  text-shadow: 0 0 12px rgba(200, 134, 10, 0.5);
  margin-bottom: 12px;
  line-height: 1;
}

.sidebar-divider { width: 28px; height: 1px; background: var(--border-dim); margin: 6px 0; }

.sidebar-nav { display: flex; flex-direction: column; align-items: center; gap: 4px; width: 100%; }

.sidebar-spacer { flex: 1; }

.sb-btn {
  width: 36px; height: 36px;
  display: flex; align-items: center; justify-content: center;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 4px;
  color: var(--text-muted);
  font-size: 15px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
  position: relative;
}

.sb-btn:hover { background: #1a0d04; border-color: var(--border); color: var(--accent-dim); }

.sb-btn.active {
  background: #1f1005;
  border-color: var(--accent);
  color: var(--accent);
  box-shadow: 0 0 8px rgba(200, 134, 10, 0.2);
}

/* Sidebar tooltips (CSS-only) */
.sb-btn::after {
  content: attr(title);
  position: absolute;
  left: calc(100% + 8px);
  top: 50%;
  transform: translateY(-50%);
  background: rgba(17, 10, 3, 0.97);
  border: 1px solid var(--border);
  border-radius: 3px;
  padding: 3px 10px;
  font-family: 'Cinzel', Georgia, serif;
  font-size: 10px;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: var(--accent);
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.15s;
  z-index: 300;
}
.sb-btn:hover::after { opacity: 1; }

/* ── Overlay panels ── */
.overlay-panel {
  position: absolute;
  left: 0; top: 0; bottom: 0;
  width: 220px;
  background: var(--bg-panel);
  backdrop-filter: blur(8px);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  transform: translateX(-100%);
  transition: transform 0.22s ease;
  z-index: 100;
  overflow: hidden;
}

.overlay-panel.open { transform: translateX(0); }

.overlay-panel--wide { width: 380px; }

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 14px 10px;
  border-bottom: 1px solid var(--border-dim);
  flex-shrink: 0;
}

.panel-title {
  font-family: 'Cinzel', Georgia, serif;
  font-size: 11px;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: var(--accent);
}

.panel-close {
  background: none; border: none;
  color: var(--text-muted); font-size: 14px; cursor: pointer;
  padding: 0; line-height: 1; transition: color 0.15s;
}
.panel-close:hover { color: var(--accent-dim); }

.panel-body { flex: 1; overflow-y: auto; padding: 12px 14px; }
.panel-body::-webkit-scrollbar { width: 4px; }
.panel-body::-webkit-scrollbar-track { background: transparent; }
.panel-body::-webkit-scrollbar-thumb { background: var(--border-dim); border-radius: 2px; }

/* ── Filters ── */
.filter-group { margin-bottom: 14px; }

.filter-group-label {
  font-family: monospace;
  font-size: 9px; letter-spacing: 1.5px; text-transform: uppercase;
  color: var(--text-muted); margin-bottom: 6px;
}

.filter-item {
  display: flex; align-items: center; gap: 7px;
  padding: 3px 2px; cursor: pointer;
}
.filter-item:hover .filter-text { color: var(--text); }

.filter-check {
  width: 10px; height: 10px; flex-shrink: 0;
  border: 1px solid var(--border); border-radius: 2px;
  display: flex; align-items: center; justify-content: center;
  font-size: 7px; color: transparent;
  transition: background 0.1s, border-color 0.1s, color 0.1s;
}
.filter-item.active .filter-check {
  border-color: var(--accent);
  background: rgba(200, 134, 10, 0.15);
  color: var(--accent);
}

.filter-text {
  font-family: 'Crimson Text', Georgia, serif;
  font-size: 13px; color: var(--text-dim); transition: color 0.15s;
}
.filter-item.active .filter-text { color: var(--text); }

.reset-btn {
  display: block; width: 100%; margin-top: 10px; padding: 6px;
  background: transparent; border: 1px solid var(--border-dim); border-radius: 3px;
  color: var(--text-muted);
  font-family: 'Cinzel', Georgia, serif; font-size: 10px;
  letter-spacing: 1px; text-transform: uppercase; cursor: pointer;
  transition: border-color 0.15s, color 0.15s;
}
.reset-btn:hover { border-color: var(--border); color: var(--text-dim); }

/* ── Clans ── */
.clan-search, .players-search, .settings-input {
  width: 100%;
  background: #0f0905; border: 1px solid var(--border-dim); border-radius: 3px;
  padding: 5px 8px;
  font-family: 'Crimson Text', Georgia, serif; font-size: 13px; color: var(--text);
  outline: none; margin-bottom: 8px;
}
.clan-search:focus, .players-search:focus, .settings-input:focus { border-color: var(--border); }

.clan-divider { height: 1px; background: var(--border-dim); margin: 4px 0 6px; }

.clan-item {
  display: flex; align-items: center; gap: 7px;
  padding: 4px 2px; cursor: pointer;
  font-family: 'Crimson Text', Georgia, serif; font-size: 13px;
  color: var(--text-dim); text-decoration: none; border-radius: 2px;
  transition: color 0.15s;
}
.clan-item:hover { color: var(--text); }
.clan-item.active { color: var(--accent); }

.clan-dot {
  display: inline-block; width: 10px; height: 10px; border-radius: 50%;
  flex-shrink: 0; border: 1px solid rgba(0,0,0,0.2);
}

/* ── Players ── */
.players-search { margin-bottom: 10px; }

.players-table { width: 100%; border-collapse: collapse; }

.players-list-table-head th {
  font-family: monospace; font-size: 9px; letter-spacing: 1px;
  text-transform: uppercase; color: var(--text-muted);
  padding: 0 4px 6px; text-align: left;
  border-bottom: 1px solid var(--border-dim);
}

.players-list-table tr { border-bottom: 1px solid rgba(42, 26, 8, 0.5); }
.players-list-table tr:nth-child(even) { background: rgba(200, 134, 10, 0.03); }
.players-list-table td { font-family: 'Crimson Text', Georgia, serif; font-size: 13px; color: var(--text-dim); padding: 3px 4px; }
.players-list-table td:first-child { color: var(--text); }

.player-online-row td { background: rgba(200, 134, 10, 0.06); }
.player-online-row td:first-child { color: var(--accent); }

.sortable { cursor: pointer; user-select: none; white-space: nowrap; }
.sortable:hover { color: var(--text-dim); text-decoration: underline; }
.sortable.sort-asc::after { content: ' ▲'; font-size: 8px; }
.sortable.sort-desc::after { content: ' ▼'; font-size: 8px; }

/* ── Settings ── */
.settings-group { margin-bottom: 14px; }

.settings-label {
  display: block;
  font-family: 'Cinzel', Georgia, serif; font-size: 10px;
  letter-spacing: 1px; text-transform: uppercase;
  color: var(--text-muted); margin-bottom: 5px;
}

.settings-check-label {
  display: flex; align-items: center; gap: 8px; cursor: pointer;
  font-family: 'Crimson Text', Georgia, serif; font-size: 13px; color: var(--text-dim);
}
.settings-check-label input[type="checkbox"] {
  appearance: none; width: 14px; height: 14px;
  border: 1px solid var(--border); border-radius: 2px; background: transparent;
  cursor: pointer; flex-shrink: 0; position: relative;
}
.settings-check-label input[type="checkbox"]:checked {
  border-color: var(--accent); background: rgba(200, 134, 10, 0.15);
}
.settings-check-label input[type="checkbox"]:checked::after {
  content: '✓'; position: absolute; top: -2px; left: 1px;
  font-size: 11px; color: var(--accent);
}

/* ── Status bar ── */
#status-bar {
  position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%);
  background: rgba(10, 6, 2, 0.82); border: 1px solid var(--border-dim);
  border-radius: 20px; padding: 4px 16px;
  font-family: 'Crimson Text', Georgia, serif; font-size: 12px;
  color: var(--text-muted); letter-spacing: 0.5px; white-space: nowrap;
  backdrop-filter: blur(6px); z-index: 50; pointer-events: none;
}

/* ── Leaflet overrides ── */
.leaflet-tooltip {
  background: rgba(15, 8, 2, 0.95); border: 1px solid var(--border);
  color: var(--text); font-family: 'Crimson Text', Georgia, serif; font-size: 13px;
  border-radius: 3px; transition: opacity 0.2s; opacity: 0; text-align: center;
}
.leaflet-tooltip::before { border-top-color: var(--border); }

.cluster-icon {
  border-radius: 50%; color: var(--accent);
  font-family: 'Cinzel', Georgia, serif; font-weight: bold; text-align: center;
  border: 2px solid var(--accent); background: var(--bg-sidebar);
  box-shadow: 0 0 10px rgba(200, 134, 10, 0.3);
  display: flex; align-items: center; justify-content: center;
}

.cluster-tooltip table { font-size: 12px; border-collapse: collapse; font-family: 'Crimson Text', serif; }
.cluster-tooltip td, .cluster-tooltip th { padding: 2px 8px; }
.cluster-tooltip th { font-weight: bold; border-bottom: 1px solid rgba(200,134,10,0.3); }
```

- [ ] **Step 2: Commit**

```bash
git add public/assets/css/map.css
git commit -m "style: replace map.css with dark fantasy theme (CSS variables, no Bootstrap)"
```

---

## Task 2 — Rewrite index.ejs

**Files:**
- Modify: `src/views/index.ejs`

**Key constraints from map.js (do not change these):**
- `id="clan-filter-menu"` on the clans panel body
- `id="clan-filter-search"` on the clan search input
- `id="players-search"` on the player search input
- `id="inactive-days"` and `id="cluster-toggle"` in settings
- `class="players-list-table-head"` on the thead, `class="players-list-table"` on the tbody
- `class="sortable"` + `data-sort-key` on header cells
- `class="lastupdate"` on the last-update span
- IDs on every filter item: `id="crafting-filter"`, `id="altars-filter"`, etc. (full list below)
- `id="reset-filters"` on the reset button
- Static "All clans" item: needs BOTH `dropdown-item` AND `clan-item` classes (dynamically created clan items already add both via JS at line 496)

- [ ] **Step 1: Overwrite src/views/index.ejs entirely**

```ejs
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8"/>
    <title>Conan Exiles Admin Map</title>
    <meta name="viewport" content="initial-scale=1.0, user-scalable=no"/>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Crimson+Text:ital,wght@0,400;0,600;1,400&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://npmcdn.com/leaflet@1.3.4/dist/leaflet.css" />
    <link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css" />
    <link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css" />
    <link href="https://cdnjs.cloudflare.com/ajax/libs/toastr.js/latest/toastr.min.css" rel="stylesheet">
    <link rel="stylesheet" href="assets/css/map.css" />
    <script>window.language = <%- language %></script>
  </head>
  <body onload="init()">

    <div id="app">

      <!-- ── Sidebar ── -->
      <nav id="sidebar">
        <div class="sidebar-logo">⚔</div>
        <div class="sidebar-divider"></div>
        <div class="sidebar-nav">
          <button class="sb-btn" data-panel="players" title="<%= lang['ui.player_list'] %>">👤</button>
          <button class="sb-btn" data-panel="filters" title="<%= lang['ui.filters'] %>">◈</button>
          <button class="sb-btn" data-panel="clans" title="<%= lang['ui.clan_filter'] %>">⚑</button>
        </div>
        <div class="sidebar-spacer"></div>
        <div class="sidebar-divider"></div>
        <button class="sb-btn" data-panel="settings" title="<%= lang['ui.settings'] %>">⚙</button>
      </nav>

      <!-- ── Map + panels ── -->
      <div id="map-container">
        <div id="map"></div>

        <!-- Filters panel -->
        <div id="panel-filters" class="overlay-panel">
          <div class="panel-header">
            <span class="panel-title"><%= lang['ui.filters'] %></span>
            <button class="panel-close">✕</button>
          </div>
          <div class="panel-body">
            <div class="filter-group">
              <div class="filter-group-label"><%= lang['ui.buildings'] %></div>
              <label class="filter-item" id="crafting-filter"><span class="filter-check">✓</span><span class="filter-text"><%= lang['ui.crafting'] %></span></label>
              <label class="filter-item" id="altars-filter"><span class="filter-check">✓</span><span class="filter-text"><%= lang['ui.altars'] %></span></label>
              <label class="filter-item" id="thrones-filter"><span class="filter-check">✓</span><span class="filter-text"><%= lang['ui.thrones'] %></span></label>
              <label class="filter-item" id="animalpens-filter"><span class="filter-check">✓</span><span class="filter-text"><%= lang['ui.animal_pens'] %></span></label>
              <label class="filter-item" id="beds-filter"><span class="filter-check">✓</span><span class="filter-text"><%= lang['ui.beds'] %></span></label>
              <label class="filter-item" id="buildings-filter"><span class="filter-check">✓</span><span class="filter-text"><%= lang['ui.buildings'] %></span></label>
              <label class="filter-item" id="campfires-filter"><span class="filter-check">✓</span><span class="filter-text"><%= lang['ui.campfires'] %></span></label>
              <label class="filter-item" id="chests-filter"><span class="filter-check">✓</span><span class="filter-text"><%= lang['ui.chests'] %></span></label>
              <label class="filter-item" id="maprooms-filter"><span class="filter-check">✓</span><span class="filter-text"><%= lang['ui.map_rooms'] %></span></label>
              <label class="filter-item" id="trebuchets-filter"><span class="filter-check">✓</span><span class="filter-text"><%= lang['ui.trebuchets'] %></span></label>
              <label class="filter-item" id="vaults-filter"><span class="filter-check">✓</span><span class="filter-text"><%= lang['ui.vaults'] %></span></label>
              <label class="filter-item" id="waterwells-filter"><span class="filter-check">✓</span><span class="filter-text"><%= lang['ui.water_wells'] %></span></label>
              <label class="filter-item" id="wheelsofpain-filter"><span class="filter-check">✓</span><span class="filter-text"><%= lang['ui.wheels_of_pain'] %></span></label>
            </div>
            <div class="filter-group">
              <div class="filter-group-label"><%= lang['ui.crab_pots'] %></div>
              <label class="filter-item" id="crabpots-filter"><span class="filter-check">✓</span><span class="filter-text"><%= lang['ui.crab_pots'] %></span></label>
              <label class="filter-item" id="fishnets-filter"><span class="filter-check">✓</span><span class="filter-text"><%= lang['ui.fish_nets'] %></span></label>
            </div>
            <div class="filter-group">
              <div class="filter-group-label"><%= lang['ui.players'] %></div>
              <label class="filter-item" id="players-filter"><span class="filter-check">✓</span><span class="filter-text"><%= lang['ui.players'] %></span></label>
              <label class="filter-item" id="pets-filter"><span class="filter-check">✓</span><span class="filter-text"><%= lang['ui.pets'] %></span></label>
              <label class="filter-item" id="thralls-filter"><span class="filter-check">✓</span><span class="filter-text"><%= lang['ui.thralls'] %></span></label>
            </div>
            <div class="filter-group">
              <div class="filter-group-label">Pippi</div>
              <label class="filter-item" id="pippi_all-filter"><span class="filter-check">✓</span><span class="filter-text"><%= lang['ui.pippi_all'] %></span></label>
              <label class="filter-item" id="pippi_thespians-filter"><span class="filter-check">✓</span><span class="filter-text"><%= lang['ui.pippi_thespians'] %></span></label>
            </div>
            <button id="reset-filters" class="reset-btn" onclick="resetFilters(); return false;"><%= lang['ui.reset_filters'] %></button>
          </div>
        </div>

        <!-- Clans panel -->
        <div id="panel-clans" class="overlay-panel">
          <div class="panel-header">
            <span class="panel-title"><%= lang['ui.clan_filter'] %></span>
            <button class="panel-close">✕</button>
          </div>
          <div class="panel-body" id="clan-filter-menu">
            <input type="text" id="clan-filter-search" class="clan-search" placeholder="<%= lang['ui.search'] %>">
            <div class="clan-divider"></div>
            <a class="dropdown-item clan-item active" href="#" data-clan="all" onclick="selectClanFilter('all'); return false;"><%= lang['ui.all_clans'] %></a>
          </div>
        </div>

        <!-- Players panel -->
        <div id="panel-players" class="overlay-panel overlay-panel--wide">
          <div class="panel-header">
            <span class="panel-title"><%= lang['ui.player_list'] %></span>
            <button class="panel-close">✕</button>
          </div>
          <div class="panel-body">
            <input type="text" id="players-search" class="players-search" placeholder="<%= lang['ui.search'] %>">
            <table class="players-table">
              <thead class="players-list-table-head">
                <tr>
                  <th class="sortable" data-sort-key="char_name"><%= lang['ui.player'] %></th>
                  <th class="sortable" data-sort-key="guild_name"><%= lang['ui.guild'] %></th>
                  <th class="sortable" data-sort-key="rank"><%= lang['ui.rank'] %></th>
                  <th class="sortable" data-sort-key="level"><%= lang['ui.level'] %></th>
                  <th class="sortable" data-sort-key="last_online"><%= lang['ui.last_seen_online'] %></th>
                </tr>
              </thead>
              <tbody class="players-list-table"></tbody>
            </table>
          </div>
        </div>

        <!-- Settings panel -->
        <div id="panel-settings" class="overlay-panel">
          <div class="panel-header">
            <span class="panel-title"><%= lang['ui.settings'] %></span>
            <button class="panel-close">✕</button>
          </div>
          <div class="panel-body">
            <div class="settings-group">
              <label class="settings-label" for="inactive-days"><%= lang['ui.inactive_days'] %></label>
              <input type="number" id="inactive-days" class="settings-input" min="0" placeholder="<%= lang['ui.inactive_days_placeholder'] %>">
            </div>
            <div class="settings-group">
              <label class="settings-check-label">
                <input type="checkbox" id="cluster-toggle">
                <%= lang['ui.cluster_by_clan'] %>
              </label>
            </div>
          </div>
        </div>

        <!-- Status bar -->
        <div id="status-bar"><%= lang['ui.last_update'] %><span class="lastupdate"><%= lastupdate %></span></div>

      </div>
    </div>

    <script src="assets/scripts/polyfills.js"></script>
    <script src="https://npmcdn.com/leaflet@1.3.4/dist/leaflet.js"></script>
    <script src="https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js"></script>
    <script src="https://code.jquery.com/jquery-3.3.1.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/clipboard.js/1.6.0/clipboard.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/toastr.js/latest/toastr.min.js"></script>
    <script src="assets/scripts/colorhash.js"></script>
    <script src="assets/scripts/map.js"></script>
  </body>
</html>
```

- [ ] **Step 2: Run the app and verify the page loads**

```bash
npm start
```

Open `http://localhost:3001`. Expected: dark background, sidebar visible on the left, map tiles loading, status bar at bottom. No Bootstrap errors in console.

- [ ] **Step 3: Commit**

```bash
git add src/views/index.ejs
git commit -m "feat: rewrite index.ejs — sidebar layout, overlay panels, drop Bootstrap"
```

---

## Task 3 — Update map.js: panel toggle logic

**Files:**
- Modify: `public/assets/scripts/map.js`

- [ ] **Step 1: Add `openPanel` and `closePanel` functions**

Find the line `function showPlayerList () {` (around line 351). Insert these two functions **before** it:

```js
function openPanel (name) {
  var $btn = $('.sb-btn[data-panel="' + name + '"]')
  if ($btn.hasClass('active')) {
    closePanel()
    return
  }
  closePanel()
  $('#panel-' + name).addClass('open')
  $btn.addClass('active')
}

function closePanel () {
  $('.overlay-panel').removeClass('open')
  $('.sb-btn').removeClass('active')
}
```

- [ ] **Step 2: Replace the Bootstrap modal call in `showPlayerList`**

Find (around line 357):
```js
    $('#playersList').modal()
```

Replace with:
```js
    openPanel('players')
```

- [ ] **Step 3: Wire up sidebar buttons and panel-close in `init()`**

Find the `function init()` block. Locate where the first `$(...).on(` event handler starts (around line 80) and insert these handlers **before** it:

```js
  // Sidebar panel toggles
  $('.sb-btn[data-panel]').on('click', function () {
    var name = $(this).data('panel')
    if (name === 'players') {
      showPlayerList()
    } else {
      openPanel(name)
    }
  })

  $(document).on('click', '.panel-close', function () {
    closePanel()
  })

  $('#map').on('click', function () {
    closePanel()
  })
```

- [ ] **Step 4: Run the app and verify all four panels open/close**

```bash
npm start
```

Open `http://localhost:3001`. Test:
- Click `◈` → Filters panel slides in. Click again → closes.
- Click `⚑` → Clans panel opens (no clans yet — loads after map data). Click `◈` → clans closes, filters opens.
- Click `👤` → Players panel opens with player list loaded.
- Click `⚙` → Settings panel opens.
- Click anywhere on the map → current panel closes.
- Click `✕` inside a panel → panel closes.

- [ ] **Step 5: Commit**

```bash
git add public/assets/scripts/map.js
git commit -m "feat: add openPanel/closePanel, wire sidebar buttons, replace Bootstrap modal"
```

---

## Task 4 — Update map.js: fix filter and clan selectors

**Files:**
- Modify: `public/assets/scripts/map.js`

The old HTML used `.filters .dropdown-item` to target filter checkboxes. The new HTML uses `.filter-item`. There are **three** places to update. Also `selectClanFilter` uses `.dropdown-item` — the static "all clans" item keeps that class in the new HTML, so those selectors need no changes.

- [ ] **Step 1: Fix `toggleFilter` — remove stale Bootstrap selector**

Find `function toggleFilter (kind) {` (around line 281). Inside it, find:
```js
    $('.filters .dropdown-item').removeClass('active')
```
Replace with:
```js
    $('.filter-item').removeClass('active')
```

- [ ] **Step 2: Fix `showAll` — remove stale Bootstrap selector**

Find `function showAll () {` (around line 302). Inside it, find:
```js
  $('.filters .dropdown-item').removeClass('active')
```
Replace with:
```js
  $('.filter-item').removeClass('active')
```

- [ ] **Step 3: Fix `resetFilters` — two Bootstrap selectors**

Find `function resetFilters () {` (around line 308). Inside it:

Find:
```js
  $('.filters .dropdown-item').removeClass('active')
```
Replace with:
```js
  $('.filter-item').removeClass('active')
```

Also find:
```js
  $('#clan-filter-menu .dropdown-item').removeClass('active')
  $('#clan-filter-menu [data-clan="all"]').addClass('active')
```
Replace with:
```js
  $('#clan-filter-menu .clan-item').removeClass('active')
  $('#clan-filter-menu [data-clan="all"]').addClass('active')
```

- [ ] **Step 4: Fix `selectClanFilter` — two Bootstrap selectors**

Find `function selectClanFilter (id) {` (around line 509). Inside it:

Find:
```js
  $('#clan-filter-menu .dropdown-item').removeClass('active')
  $('#clan-filter-menu .dropdown-item').each(function () {
    if ($(this).attr('data-clan') === id) $(this).addClass('active')
  })
```
Replace with:
```js
  $('#clan-filter-menu .clan-item').removeClass('active')
  $('#clan-filter-menu .clan-item').each(function () {
    if ($(this).attr('data-clan') === id) $(this).addClass('active')
  })
```

- [ ] **Step 5: Run the app and verify filters work**

```bash
npm start
```

Open `http://localhost:3001`. Test:
- Open Filters panel → click "Здания" → checkbox gains amber fill, markers for buildings toggle on/off on the map.
- Click "Сбросить фильтры" → all filter checkboxes clear, all markers reappear.
- Open Clans panel → load some map data → clan names appear → click a clan → only that clan's markers stay on map → click "Все кланы" → all reappear.

- [ ] **Step 6: Commit**

```bash
git add public/assets/scripts/map.js
git commit -m "fix: update map.js selectors — .filter-item replaces Bootstrap .dropdown-item"
```

---

## Task 5 — Fix player row highlighting in renderPlayerTable

**Files:**
- Modify: `public/assets/scripts/map.js`

The current code uses `bgcolor="..."` HTML attribute to highlight online players. The new CSS uses `.player-online-row` class instead.

- [ ] **Step 1: Replace bgcolor with CSS class in `renderPlayerTable`**

Find `function renderPlayerTable () {` (around line 361). Inside it, find:
```js
    var bgcolor = player.online == 1 ? '#FFFFAA' : '#FFFFFF'
    html += '<tr class="player-list-item" bgcolor="' + bgcolor + '">'
```
Replace with:
```js
    html += '<tr class="player-list-item' + (player.online == 1 ? ' player-online-row' : '') + '">'
```

- [ ] **Step 2: Verify online players highlighted correctly**

```bash
npm start
```

Open `http://localhost:3001`. Open Players panel. Online players (if any are connected to your test db) should display with an amber-tinted row background. Offline players display with the standard row style.

- [ ] **Step 3: Commit**

```bash
git add public/assets/scripts/map.js
git commit -m "fix: replace bgcolor attribute with player-online-row CSS class"
```

---

## Task 6 — Final smoke test

**Files:** none (verification only)

- [ ] **Step 1: Full end-to-end test**

```bash
npm start
```

Open `http://localhost:3001` and verify each item:

| Feature | Expected |
|---|---|
| Page loads | Dark background, sidebar on left, map tiles visible |
| Sidebar tooltips | Hover any icon → label appears to the right |
| Filters panel | Opens/closes, all 13+ items visible with correct labels |
| Toggle filter | Click item → amber checkbox fill, markers toggle |
| Reset filters | All checkboxes clear, all markers reappear |
| Clans panel | Clan list populates from map data, search filters list |
| Select clan | Only that clan's markers visible |
| Players panel | Table loads with player names, sort by column works, search filters rows |
| Online players | Amber-highlighted rows |
| Settings panel | Inactive days input works (changes marker visibility), cluster toggle works |
| Close panel | ✕ button closes, clicking map closes |
| Status bar | Shows last update timestamp at bottom-center |
| No console errors | No Bootstrap/jQuery undefined errors |

- [ ] **Step 2: Check for leftover Bootstrap references**

```bash
grep -n "bootstrap\|navbar\|dropdown-menu\|modal(" src/views/index.ejs public/assets/css/map.css public/assets/scripts/map.js
```

Expected output: zero matches (or only comments).

- [ ] **Step 3: Final commit**

```bash
git add -A
git status  # confirm only the 3 expected files are modified
git commit -m "chore: verify redesign complete — Bootstrap removed, dark fantasy sidebar live"
```
