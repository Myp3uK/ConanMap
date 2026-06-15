# Marker UX Redesign

**Date:** 2026-06-02  
**Scope:** Frontend only (`public/assets/scripts/map.js`, `src/views/index.ejs`, `public/assets/css/map.css`)  
**Goal:** Labeled tooltips with entity-type context, working owner resolution for thralls/pets, enriched clan panel, entity counts in filters, global search.

---

## 1. Tooltip Redesign

### Format

Replace the current plain-text `getTooltipContent()` output with a structured HTML template:

```
┌─ TYPE  [BADGE] ──────────────┐
│ Label   Value                │
│ Label   Value                │
│ ──────────────────           │
│ 🖱 клик — скопировать телепорт│
└──────────────────────────────┘
```

- **Header line:** entity type name in Cinzel font, gold colour, with optional badge
- **Rows:** two-column — uppercase dimmed label (min-width 66px) + value
- **Divider + teleport hint** at the bottom (currently undiscoverable)
- Empty/unknown values show a dimmed `—` rather than being omitted, so the row count is stable

### Entity-specific content

| Entity | Header | Badge | Rows |
|---|---|---|---|
| Building | Translated `kind` | — | Клан / Игрок |
| Thrall | «Тралл» | Tier badge (T1–T4) | Имя / Фракция / Владелец |
| Pet | «Питомец» | «Alpha» if `greater=true` | Имя / Вид / Владелец |
| Player | «Игрок» | «● Online» if `online=1` | Ник / Клан / Ранг / Уровень |

**Tier badge colours** (inline style via CSS class):
- T4 → red (`rgba(180,50,10,…)` border, `#e07040` text)
- T3 → gold (`rgba(180,130,10,…)` border, `#c8a040` text)
- T2 → green (`rgba(100,120,60,…)` border, `#90b060` text)
- T1 → grey (`rgba(80,80,80,…)` border, `#909090` text)
- Alpha → purple (`rgba(150,40,180,…)` border, `#c060e0` text)
- Online → green (`rgba(30,160,80,…)` border, `#50d080` text)

### Tier parsing from `info`

`info` for thralls arrives as `"Heirs of the North Lian T4"` (spaces already substituted by the controller). Parse it on the frontend:

```js
var tierMatch = info.match(/\b(T[1-4])\b/i)
var tier = tierMatch ? tierMatch[1].toUpperCase() : null          // "T4"
var faction = tierMatch ? info.replace(tierMatch[0], '').trim() : info  // "Heirs of the North Lian"
```

Strip the tier token from the end of the string and show the remainder as "Фракция". Role names (e.g. "Lian") are not separated — they stay attached to the faction string. This is simpler than maintaining a lookup table and still readable at a glance.

---

## 2. Owner Resolution Bug Fix

### Problem

`getOwnerById(ownerId)` compares `player.char_id` (string, e.g. `"171"`) with `marker.owner` (number, e.g. `171`) using `===`. Result is always `false`.

Same issue in `isOwnerInactive()` when looking up `playerLastOnline[marker.owner]` — the key is a string but `marker.owner` is a number.

### Fix

In `getOwnerById()`, coerce before comparison:
```js
if (String(player.char_id) === String(ownerId)) { … }
if (String(player.guild_id) === String(ownerId)) { … }
```

In `isOwnerInactive()`, look up with string key:
```js
lastSeen = playerLastOnline[String(marker.owner)] || guildLastOnline[String(marker.owner)]
```

No other changes needed — `playerLastOnline` is already keyed by `player.char_id` (string).

---

## 3. Entity Counts in Filter Panel

### Behaviour

After every `drawData()` completes and all markers are rendered, count visible markers per `kind` (only those that pass `isOnActiveMap()`). Update the DOM:

```js
$('#thralls-filter .filter-count').text(countByKind['thralls'] || 0)
```

### HTML change (`index.ejs`)

Add `<span class="filter-count"></span>` inside each `.filter-item`, after `.filter-text`:

```html
<label class="filter-item" id="thralls-filter">
  <span class="filter-check">✓</span>
  <span class="filter-text"><%= lang['ui.thralls'] %></span>
  <span class="filter-count"></span>
</label>
```

### CSS

```css
.filter-count {
  font-family: 'Cinzel', serif;
  font-size: 0.6rem;
  color: #5a4020;
  background: rgba(200,134,10,0.08);
  border: 1px solid rgba(200,134,10,0.15);
  border-radius: 2px;
  padding: 0 5px;
  line-height: 1.7;
  margin-left: auto;
}
.filter-item.active .filter-count {
  color: #9a7040;
  border-color: rgba(200,134,10,0.3);
}
```

Counts reflect the active map only — if the user switches map, counts update on redraw.

---

## 4. Clan Panel Redesign

### New elements

1. **Sort buttons** — three text buttons above the clan list: «По числу ↓» / «По имени» / «По активности». Active button has a highlighted border. Default: by count descending.

2. **Clan item row** (expanded format):
   - Line 1: coloured dot + clan name + count badge (right-aligned)
   - Line 2 (sub-row): small activity dot + human-readable last-online text

3. **Activity thresholds** (based on `guildLastOnline[guildId]`):
   - ≤ 7 days → green dot + «Онлайн N дней назад» (or «Онлайн сегодня»)
   - 7–30 days → yellow dot + «N дней назад»
   - > 30 days or unknown → grey dot + «N дней назад» / «Неизвестно»

4. **Total count** on the «Все кланы» row.

### `rebuildClanFilterMenu()` changes

The function already receives the current groups object. Extend it to:
- Compute `count` per group from `markerLayers[id].getLayers().length` (or `clusterGroups[id].getLayers().length`)
- Compute `lastSeen` from `guildLastOnline[id]`
- Sort groups array according to `clanSortMode` state variable (`'count'` | `'name'` | `'activity'`)
- Render the expanded two-line item HTML

Sort mode is stored in a module-level variable, toggled by the sort buttons, triggers `rebuildClanFilterMenu()`.

---

## 5. Global Search

### Trigger

- Keyboard shortcut **Ctrl+F** (captures the event, prevents browser default)
- Button **🔍** added to the sidebar nav (between filters and clans buttons)

### Panel

New overlay panel `#panel-search` (same `.overlay-panel` CSS class, `width: 340px`):

```
┌─ 🔍 [input field]  ESC─┐
│ ─────────────────────── │
│ ТРАЛЫ (3)               │
│   Тралл  Лиан SunRise   │
│           Heirs·WarriorX│ [T4]
│   ...                   │
│ КЛАНЫ (1)               │
│   Клан   Lianavyr        │
│           14 obj·5д      │
└─────────────────────────┘
```

### Data

Search operates on `allMarkersData` — a module-level array populated during `drawData()` by concatenating all API responses. Each item is tagged with a `_kind` field (e.g. `'thralls'`, `'pets'`, `'players'`) so the search can group results by type and the filter count logic (Section 3) can count by kind. No additional server requests.

### Search logic

Case-insensitive substring match across these fields per marker type:

| Type | Searched fields |
|---|---|
| Thrall | `name`, `info` (faction string), owner name (resolved) |
| Pet | `name`, `info` (species), owner name (resolved) |
| Building | translated `kind`, `guild_name`, `char_name` |
| Player | `char_name`, `guild_name` |

Clan results come from `groupNames` — match on clan name string.

Results grouped by type (Тралы / Питомцы / Постройки / Игроки / Кланы). Max 50 results **total** across all groups to keep the list usable — truncate evenly per group if needed.

### Result item

```html
<div class="search-result" data-x="…" data-y="…" data-z="…">
  <span class="result-type">Тралл</span>
  <div class="result-main">
    <div class="result-name">Лиан SunRise</div>
    <div class="result-sub">Heirs of the North · WarriorX</div>
  </div>
  <span class="result-badge badge-t4">T4</span>
</div>
```

### Navigation

- **Click** on a result → close search panel, `map.panTo(toLatLng(x, y))`, call `setStyle()` on the `L.circleMarker` whose stored `x`/`y` match the result's coordinates exactly, pulsing it for 2s
- **Enter** key → navigate to first result
- **ESC** → close panel, restore focus to map

### Marker pulse

Add a CSS animation:
```css
.marker-pulse {
  animation: pulse-white 2s ease-out forwards;
}
@keyframes pulse-white {
  0%   { stroke: white; stroke-width: 4; }
  100% { stroke: black; stroke-width: 1; }
}
```

Applied via Leaflet's `setStyle()` on the matched `L.circleMarker`.

---

## Implementation notes

- All changes are **frontend-only** — no backend files touched.
- `allMarkersData` array must be populated in `drawData()` and cleared on `clearAllLayers()`.
- The search panel is a sixth overlay panel — same open/close mechanics as existing panels (`.overlay-panel`, `openPanel()`, `closePanel()`).
- Ctrl+F handler must call `e.preventDefault()` to suppress the browser's native find.
- Badge CSS classes (`badge-t4`, `badge-t3`, `badge-alpha`, `badge-online`) are shared between the tooltip and the search results.
- No new npm dependencies required.
