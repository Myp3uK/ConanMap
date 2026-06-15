# Siptah Map Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить кнопки переключения между картами Exiled Lands и Isle of Siptah — смена тайлового слоя, системы координат и фильтрация маркеров по X-координате.

**Architecture:** Оба набора данных уже хранятся в `game.db` под одним `map = ConanSandbox` — разделение по X-координате (EL: `x < 800 000`, Siptah: `x > 800 000`). Бэкенд не меняется. `mapConfigs` объект хранит диапазоны координат и путь к тайлам для каждой карты. `switchMap()` заменяет тайл-слой и вызывает `drawData()`, который перечитывает `activeMap` и передаёт данные через уже изменённую `toLatLng()` и новый фильтр в `renderMarkers()`.

**Tech Stack:** jQuery 3.3.1, Leaflet 1.3.4, vanilla JS (ES5), EJS шаблоны, CSS custom properties.

---

## Файлы

| Файл | Изменение |
|---|---|
| `public/assets/css/map.css` | +12 строк: `.map-switch`, `.map-btn` |
| `src/views/index.ejs` | +5 строк: блок `.map-switch` между `.sidebar-spacer` и кнопкой настроек |
| `public/assets/scripts/map.js` | ~25 строк изменений: переменные, `toLatLng()`, `init()`, + 3 новые функции |

---

### Task 1: CSS и HTML — кнопки карты в сайдбаре

**Files:**
- Modify: `public/assets/css/map.css` — после строки `.sidebar-nav { ... }` (line 56)
- Modify: `src/views/index.ejs` — строки 30–32 (между `.sidebar-spacer` и кнопкой ⚙)

- [ ] **Step 1: Добавить стили в map.css**

Открой `public/assets/css/map.css`. Найди строку:
```css
.sidebar-spacer { flex: 1; }
```
После неё добавь:
```css

.map-switch {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px 0;
  align-items: center;
}

.map-btn {
  font-size: 10px;
  letter-spacing: 1px;
  font-family: var(--font-ui);
  height: 22px;
  width: 36px;
  line-height: 1;
}
```

> `.map-btn` переопределяет `height: 36px` из `.sb-btn` на `22px` — это работает потому что правило `.map-btn` объявлено позже в файле при одинаковой специфичности.

- [ ] **Step 2: Добавить HTML-кнопки в index.ejs**

Открой `src/views/index.ejs`. Найди блок:
```html
        <div class="sidebar-spacer"></div>
        <div class="sidebar-divider"></div>
        <button class="sb-btn" data-panel="settings" title="<%= lang['ui.settings'] %>">⚙</button>
```
Замени на:
```html
        <div class="sidebar-spacer"></div>
        <div class="map-switch">
          <button class="sb-btn map-btn active" data-map="exiledlands" title="Exiled Lands">EL</button>
          <button class="sb-btn map-btn"        data-map="siptah"       title="Isle of Siptah">Si</button>
        </div>
        <div class="sidebar-divider"></div>
        <button class="sb-btn" data-panel="settings" title="<%= lang['ui.settings'] %>">⚙</button>
```

- [ ] **Step 3: Запустить сервер и проверить визуально**

```bash
npm start
```

Открыть `http://localhost:3001`. Убедиться:
- В нижней части сайдбара над иконкой ⚙ появились две кнопки `EL` и `Si`
- Кнопка `EL` подсвечена янтарным (класс `active`)
- При наведении на кнопки появляются тултипы «Exiled Lands» и «Isle of Siptah»
- Клик по кнопкам пока ничего не делает (хендлеры ещё не добавлены)

- [ ] **Step 4: Закоммитить**

```bash
git add public/assets/css/map.css src/views/index.ejs
git commit -m "feat: add map switch buttons to sidebar"
```

---

### Task 2: map.js — переменные mapConfigs и обновление toLatLng()

**Files:**
- Modify: `public/assets/scripts/map.js` — строки 10–13 (глобальные переменные) и 51–53 (функция `toLatLng`)

- [ ] **Step 1: Заменить rangeX/rangeY на mapConfigs**

Открой `public/assets/scripts/map.js`. Найди строки 10–11:
```js
var rangeX = [ -296000, 412000 ]
var rangeY = [ -292000, 353500 ]
```
Замени на:
```js
var mapConfigs = {
  exiledlands: {
    label: 'Exiled Lands',
    rangeX: [-296000, 412000],
    rangeY: [-292000, 353500],
    tiles: 'assets/tiles/{z}/{x}/{y}.png',
    xMax: 800000
  },
  siptah: {
    label: 'Isle of Siptah',
    rangeX: [1234655, 1884492],
    rangeY: [-354417, 325164],
    tiles: 'assets/tiles-siptah/{z}/{x}/{y}.png',
    xMin: 800000
  }
}
var activeMap = 'exiledlands'
var tileLayer = null
var mapBounds = null
```

После замены строки 10–13 выглядят так:
```js
var mapConfigs = {
  exiledlands: {
    label: 'Exiled Lands',
    rangeX: [-296000, 412000],
    rangeY: [-292000, 353500],
    tiles: 'assets/tiles/{z}/{x}/{y}.png',
    xMax: 800000
  },
  siptah: {
    label: 'Isle of Siptah',
    rangeX: [1234655, 1884492],
    rangeY: [-354417, 325164],
    tiles: 'assets/tiles-siptah/{z}/{x}/{y}.png',
    xMin: 800000
  }
}
var activeMap = 'exiledlands'
var tileLayer = null
var mapBounds = null
var boundsX = [ 14.4, 230.7 ]
var boundsY = [ -47.7, -245.3 ]
```

- [ ] **Step 2: Обновить toLatLng()**

Найди функцию `toLatLng` (строка 51–53):
```js
function toLatLng(x, y) {
  return [ convertRange(y, rangeY, boundsY), convertRange(x, rangeX, boundsX) ]
}
```
Замени на:
```js
function toLatLng(x, y) {
  var cfg = mapConfigs[activeMap]
  return [ convertRange(y, cfg.rangeY, boundsY), convertRange(x, cfg.rangeX, boundsX) ]
}
```

- [ ] **Step 3: Убедиться что сервер запускается без ошибок**

```bash
npm start
```

Открыть `http://localhost:3001`. Карта Exiled Lands должна отображаться как раньше — маркеры на правильных позициях. Браузерная консоль — без ошибок.

- [ ] **Step 4: Закоммитить**

```bash
git add public/assets/scripts/map.js
git commit -m "feat: replace rangeX/rangeY globals with mapConfigs, update toLatLng"
```

---

### Task 3: map.js — init(), tileLayer-переменная и функция switchMap()

**Files:**
- Modify: `public/assets/scripts/map.js` — строки 65–78 (внутри `init()`), + новая функция `switchMap()`, + хендлер кнопок в `init()`

- [ ] **Step 1: Сделать mapBounds глобальным и сохранить tileLayer**

Внутри `init()` найди строки 65–78:
```js
  var mapBounds = new L.LatLngBounds(
    map.unproject([0, 16128], mapMaxZoom),
    map.unproject([16128, 0], mapMaxZoom)
  )

  map.setMaxBounds(mapBounds)
  map.fitBounds(mapBounds)

  L.tileLayer('assets/tiles/{z}/{x}/{y}.png', {
    minZoom: mapMinZoom,
    maxZoom: mapMaxZoom,
    bounds: mapBounds,
    tms: false
  }).addTo(map)
```
Замени на:
```js
  mapBounds = new L.LatLngBounds(
    map.unproject([0, 16128], mapMaxZoom),
    map.unproject([16128, 0], mapMaxZoom)
  )

  map.setMaxBounds(mapBounds)
  map.fitBounds(mapBounds)

  tileLayer = L.tileLayer(mapConfigs[activeMap].tiles, {
    minZoom: mapMinZoom,
    maxZoom: mapMaxZoom,
    bounds: mapBounds,
    tms: false
  }).addTo(map)
```

> `var mapBounds` → `mapBounds` (убираем `var`, используем глобал из Task 2). `tileLayer =` вместо просто `L.tileLayer(...)` — сохраняем ссылку для замены при переключении.

- [ ] **Step 2: Добавить функцию switchMap()**

Найди функцию `clearAllLayers()` (строка 162). Перед ней добавь:
```js
function switchMap(name) {
  if (name === activeMap) return
  activeMap = name

  if (tileLayer) map.removeLayer(tileLayer)
  tileLayer = L.tileLayer(mapConfigs[name].tiles, {
    minZoom: mapMinZoom,
    maxZoom: mapMaxZoom,
    bounds: mapBounds
  }).addTo(map)

  map.fitBounds(mapBounds)
  drawData()

  $('.map-btn').removeClass('active')
  $('.map-btn[data-map="' + name + '"]').addClass('active')
}

```

- [ ] **Step 3: Добавить click-хендлер в init()**

Внутри `init()` найди строки с хендлером `.filter-item` (строка 108–112):
```js
  // Filter item clicks
  $(document).on('click', '.filter-item', function () {
    var kind = $(this).attr('id').replace(/-filter$/, '')
    toggleFilter(kind)
  })
```
После него добавь:
```js

  // Map switch buttons
  $(document).on('click', '.map-btn', function () {
    switchMap($(this).data('map'))
  })
```

- [ ] **Step 4: Проверить переключение карт**

```bash
npm start
```

Открыть `http://localhost:3001`. Проверить:
- Клик по `Si` — тайловый слой меняется (для Siptah тайлов нет → тёмный фон, это нормально), кнопка `Si` становится янтарной, `EL` гаснет
- Клик по `EL` — возвращается карта Exiled Lands, маркеры на правильных местах
- Браузерная консоль без ошибок

На этом этапе при переключении на Siptah маркеры EL будут пропадать (drawData перезапросит данные), но Siptah-объекты появятся в неправильных позициях (за пределами видимой области). Это ожидаемо — фильтрация будет добавлена в Task 4.

- [ ] **Step 5: Закоммитить**

```bash
git add public/assets/scripts/map.js
git commit -m "feat: add switchMap(), wire map-btn click handler, save tileLayer ref"
```

---

### Task 4: map.js — фильтрация маркеров по активной карте

**Files:**
- Modify: `public/assets/scripts/map.js` — добавить `isOnActiveMap()` перед `renderMarkers()`, добавить вызов в начале `markers.forEach`

- [ ] **Step 1: Добавить функцию isOnActiveMap()**

Найди функцию `renderMarkers` (строка 178). Перед ней добавь:
```js
function isOnActiveMap(x) {
  var cfg = mapConfigs[activeMap]
  if (cfg.xMax !== undefined && x >= cfg.xMax) return false
  if (cfg.xMin !== undefined && x <= cfg.xMin) return false
  return true
}

```

- [ ] **Step 2: Добавить фильтр в renderMarkers()**

Найди начало цикла в `renderMarkers()`:
```js
  markers.forEach(function (marker) {
    if (!isOwnerInactive(marker)) return
```
Замени на:
```js
  markers.forEach(function (marker) {
    if (!isOnActiveMap(marker.x)) return
    if (!isOwnerInactive(marker)) return
```

- [ ] **Step 3: Финальная проверка обеих карт**

```bash
npm start
```

Открыть `http://localhost:3001`. Проверить полный сценарий:

1. Карта стартует на **Exiled Lands** — кнопка `EL` активна, маркеры на правильных местах
2. Включить несколько фильтров (например, Постройки, Игроки)
3. Кликнуть `Si` — карта переключается на **Isle of Siptah** (тёмный фон), маркеры EL исчезают, маркеры Siptah (постройки/игроки на Siptah) появляются в правильных позициях относительно друг друга
4. Кликнуть `EL` — маркеры EL возвращаются на свои места
5. Убедиться: тултипы при наведении на `EL`/`Si` кнопки работают («Exiled Lands» / «Isle of Siptah»)
6. Браузерная консоль без ошибок

- [ ] **Step 4: Закоммитить**

```bash
git add public/assets/scripts/map.js
git commit -m "feat: filter markers by active map using isOnActiveMap()"
```
