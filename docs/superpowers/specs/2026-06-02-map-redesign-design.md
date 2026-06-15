# Conan Exiles Admin Map — Редизайн главной страницы

**Дата:** 2026-06-02  
**Статус:** Утверждён

---

## Суть задачи

Заменить Bootstrap-навбар на боковой sidebar в стиле «тёмного фэнтези». Убрать Bootstrap полностью. Сохранить всю функциональность карты: фильтры, кланы, список игроков, настройки — переместив их в оверлей-панели.

---

## Эстетика

**Стиль:** Тёмное фэнтези — янтарь и ржавчина на угольном фоне.

### Цветовые токены (CSS-переменные)

| Переменная | Значение | Назначение |
|---|---|---|
| `--bg-deep` | `#0a0806` | Фон карты и body |
| `--bg-sidebar` | `#110a03` | Фон сайдбара |
| `--bg-panel` | `rgba(17,10,3,0.94)` | Фон оверлей-панелей |
| `--border` | `#4a2e10` | Границы элементов |
| `--border-dim` | `#2a1a08` | Тонкие/второстепенные границы |
| `--accent` | `#c8860a` | Янтарный акцент (активные элементы, иконки) |
| `--accent-dim` | `#7a5a2a` | Приглушённый акцент |
| `--text` | `#d4b896` | Основной текст |
| `--text-dim` | `#7a5a2a` | Второстепенный текст |
| `--text-muted` | `#4a3a1a` | Очень тихий текст (метки, статус) |
| `--marker-amber` | `#c8860a` | Маркеры построек |
| `--marker-red` | `#8b3030` | Маркеры враждебных/опасных |
| `--marker-green` | `#3a7030` | Маркеры нейтральных |

### Шрифты

- **Cinzel** (Google Fonts) — заголовки, навигационные метки, названия панелей. `letter-spacing: 2–3px`, `text-transform: uppercase`.
- **Crimson Text** (Google Fonts) — текст внутри панелей, тултипы, таблица игроков.
- Оба шрифта подключаются через `<link>` в `<head>`.

---

## Архитектура разметки

```
<body>
  <div id="app">                         ← flex-контейнер, 100vw × 100vh
    <nav id="sidebar">                   ← 52px, фиксированная ширина
      <div class="sidebar-logo">         ← символ ⚔
      <div class="sidebar-nav">          ← кнопки-иконки
      <div class="sidebar-spacer">       ← flex: 1
      <div class="sidebar-footer">       ← кнопка настроек
    </nav>
    <div id="map-container">             ← flex: 1, position: relative
      <div id="map">                     ← Leaflet, inset: 0
      <!-- Оверлей-панели (абсолютные, left: 0) -->
      <div id="panel-filters"  class="overlay-panel">
      <div id="panel-clans"    class="overlay-panel">
      <div id="panel-players"  class="overlay-panel overlay-panel--wide">
      <div id="panel-settings" class="overlay-panel">
      <!-- Строка статуса -->
      <div id="status-bar">
    </div>
  </div>
</body>
```

---

## Компонент: Sidebar

**Размеры:** ширина `52px`, высота `100vh`, `position: static` (в потоке flex).

**Содержимое (сверху вниз):**
1. Логотип `⚔` — цвет `--accent`, `text-shadow: 0 0 12px` с полупрозрачным акцентом
2. Горизонтальный разделитель
3. Кнопки навигации — `<button class="sb-btn">` по 36×36px, `border-radius: 4px`:
   - `data-panel="players"` — иконка `👤`, тултип «ИГРОКИ»
   - `data-panel="filters"` — иконка `◈`, тултип «ФИЛЬТРЫ»
   - `data-panel="clans"` — иконка `⚑`, тултип «КЛАНЫ»
4. `flex: 1` — spacer
5. Разделитель
6. `data-panel="settings"` — иконка `⚙`, тултип «НАСТРОЙКИ»

**Состояния кнопки:**
- По умолчанию: `color: --text-muted`, `border: 1px solid transparent`
- `:hover`: `background: #1a0d04`, `color: --accent-dim`, `border-color: --border`
- `.active` (панель открыта): `background: #1f1005`, `border-color: --accent`, `color: --accent`, `box-shadow: 0 0 8px rgba(200,134,10,0.2)`

**Тултипы:** CSS-only через `::after` псевдоэлемент, появляется справа от кнопки при `:hover`. Стиль: `background: rgba(17,10,3,0.97)`, `border: 1px solid --border`, шрифт Cinzel, `color: --accent`.

---

## Компонент: Оверлей-панели

**Стандартная ширина:** `220px`. Панель игроков — `340px` (`overlay-panel--wide`).

**Позиционирование:** `position: absolute; left: 0; top: 0; bottom: 0; z-index: 100`.

**Фон:** `background: var(--bg-panel); backdrop-filter: blur(8px)`.

**Граница:** `border-right: 1px solid var(--border)`.

**Анимация открытия:** `transform: translateX(-100%)` → `translateX(0)`, `transition: transform 0.22s ease`. Класс `.open` на панели активирует трансформацию.

**Только одна панель может быть открыта одновременно.** Открытие новой закрывает предыдущую.

**Внутренняя структура всех панелей:**
```html
<div class="panel-header">
  <span class="panel-title">НАЗВАНИЕ</span>
  <button class="panel-close">✕</button>
</div>
<div class="panel-body">
  <!-- содержимое -->
</div>
```

### Панель «Фильтры»

Содержимое аналогично текущему дропдауну, но в виде вертикального списка с группами:
- Группа «Постройки»: Здания, Алтари, Тронные залы, Загоны, Кровати, Костры, Треб., Колодцы, Колёса боли, Комнаты карты
- Группа «Хранилища»: Сундуки, Хранилища
- Группа «Рыбалка»: Крабовые ловушки, Рыбные сети
- Группа «Персонажи»: Игроки, Питомцы, Трэллы
- Группа «Pippi»: Все, Персонажи (thespians)
- Кнопка «Сбросить фильтры» внизу

Каждый элемент — `<label>` с кастомным чекбоксом (`10×10px`, стиль dark fantasy).

### Панель «Кланы»

- Поле поиска по названию клана (стиль dark fantasy `<input>`)
- Пункт «Все кланы» (всегда первый)
- Список кланов с цветной точкой (из `colorhash.js`) и названием
- Активный клан выделен `color: --accent`

### Панель «Игроки» (340px)

- Поле поиска
- Таблица: `<div>`-сетка (не `<table>` для гибкости стилизации), 4 колонки: Игрок, Клан, Уровень, Последний онлайн
- Сортировка по клику на заголовок колонки (▲▼ индикаторы)
- Онлайн-игроки: зелёный индикатор `●`
- Ряды чередуются лёгким фоном `rgba(200,134,10,0.03)`

### Панель «Настройки»

- Поле «Неактивные дни» (`<input type="number">`)
- Чекбокс «Группировать по кланам»

---

## Компонент: Status Bar

```html
<div id="status-bar">Обновлено: <span id="lastupdate">…</span></div>
```

**Стиль:** плавающий pill по центру внизу карты (`bottom: 12px; left: 50%; transform: translateX(-50%)`), полупрозрачный фон, шрифт Crimson Text, `z-index: 50`.

---

## Изменения в JavaScript (`map.js`)

### Удаляется
- `$('#playersList').modal('show')` / `.modal('hide')` — Bootstrap modal API
- Все обращения к Bootstrap дропдаунам

### Добавляется (~50 строк)
```js
function openPanel(name) { /* закрыть текущую, открыть нужную, .active на sb-btn */ }
function closePanel() { /* убрать .open и .active */ }
// data-panel атрибуты на sb-btn запускают openPanel при клике
// клик по карте — closePanel()
// panel-close кнопка — closePanel()
```

### Переименовываются селекторы

Текущие Bootstrap-зависимые селекторы заменяются на id/классы новых панелей:

| Было | Станет |
|---|---|
| `$('#playersList').modal()` | `openPanel('players')` |
| `#playersList .players-list-table` | `#panel-players .players-list-table` |
| `#playersList .players-list-table-head .sortable` | `#panel-players .players-list-table-head .sortable` |
| `.filters .dropdown-item` (в `toggleFilter`, `resetFilters`, `showAll`) | `.filter-item` (в `#panel-filters`) |
| `#${kind}-filter` (активный чекбокс фильтра) | `#${kind}-filter` — **ID сохраняются** на новых `<label>` в панели |
| `#clan-filter-menu` | `#clan-filter-menu` — **ID сохраняется** на `#panel-clans .panel-body` |
| `#clan-filter-menu .dropdown-item` | `#clan-filter-menu .clan-item` |
| `#clan-filter-menu [data-clan]` | `#clan-filter-menu [data-clan]` — атрибут сохраняется |
| `#inactive-days` | без изменений |
| `#cluster-toggle` | без изменений |
| `#clan-filter-search` | без изменений |
| `#players-search` | без изменений |
| `.lastupdate` | без изменений |

> **Принцип:** сохраняем `id` и `data-*` атрибуты там, где их читает `map.js`, меняем только Bootstrap-специфичные классы (`.dropdown-item`, `.dropdown-menu`, `.modal`).

---

## Удаляемые зависимости

Из `index.ejs` убираются:
- `bootstrap.min.css` + `bootstrap.min.js`
- `popper.min.js`

**Остаются:**
- `jquery.min.js` — `map.js` использует jQuery повсеместно (~30+ обращений `$()`)
- `leaflet.css` + `leaflet.js`
- `leaflet.markercluster.css` + `leaflet.markercluster.js`
- `toastr.css` + `toastr.js` (зависит от jQuery, который остаётся)
- `clipboard.js`
- `colorhash.js`
- `polyfills.js`

---

## Файлы, которые изменяются

| Файл | Тип изменения |
|---|---|
| `src/views/index.ejs` | Полная перезапись |
| `public/assets/css/map.css` | Полная замена |
| `public/assets/scripts/map.js` | Точечные правки (~50–80 строк) |

Файлы, которые **не трогаются:** все контроллеры, роуты, SQL, серверная логика.

---

## Не входит в эту задачу

- Изменение серверной части (controllers, routes, sql.js)
- Добавление новых API-эндпоинтов
- Мобильная адаптация (за рамками этого редизайна)
- Анимации маркеров на карте (можно добавить отдельно после)
