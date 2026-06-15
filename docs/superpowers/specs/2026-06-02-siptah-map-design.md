# Conan Exiles Admin Map — Поддержка карты Isle of Siptah

**Дата:** 2026-06-02  
**Статус:** Утверждён

---

## Суть задачи

Добавить переключение между картами Exiled Lands и Isle of Siptah. Оба набора данных уже хранятся в одном `game.db` — разграничение происходит по X-координате (EL: `x < 800 000`, Siptah: `x > 800 000`). Бэкенд не меняется. Все изменения — фронтенд.

---

## Контекст: структура данных

### Различение карт в `actor_position`

Колонка `map` в таблице `actor_position` содержит `ConanSandbox` для **обоих** наборов данных — она не используется для различения. Карты разделяются исключительно по диапазону X-координат:

| Карта | X диапазон | Y диапазон |
|---|---|---|
| Exiled Lands | −296 000 → 412 000 | −292 000 → 353 500 |
| Isle of Siptah | 1 234 655 → 1 884 492 | −354 417 → 325 164 |

Пороговое значение `800 000` безопасно: между максимумом EL (412k) и минимумом Siptah (1 234k) — разрыв ~800k.

### Тайлы

Тайлы Exiled Lands: `public/assets/tiles/{z}/{x}/{y}.png` (уровни 2–6).  
Тайлы Siptah: `public/assets/tiles-siptah/{z}/{x}/{y}.png` — **пока отсутствуют**. При отсутствии Leaflet отображает тёмный фон (стандартное поведение при 404 на тайлах). Система проектируется так, чтобы при появлении тайлов они подхватывались автоматически.

---

## Архитектура изменений

Бэкенд не меняется. Изменяются три фронтенд-файла.

### `public/assets/scripts/map.js`

#### Новые переменные (заменяют захардкоженные глобалы)

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
```

Глобалы `rangeX` и `rangeY` удаляются. Функция `toLatLng()` читает из `mapConfigs[activeMap]`:

```js
function toLatLng(x, y) {
  var cfg = mapConfigs[activeMap]
  return [
    convertRange(y, cfg.rangeY, boundsY),
    convertRange(x, cfg.rangeX, boundsX)
  ]
}
```

#### Фильтрация объектов по активной карте

Добавляется вспомогательная функция, вызываемая перед созданием каждого маркера:

```js
function isOnActiveMap(x) {
  var cfg = mapConfigs[activeMap]
  if (cfg.xMax !== undefined && x >= cfg.xMax) return false
  if (cfg.xMin !== undefined && x <= cfg.xMin) return false
  return true
}
```

В `renderMarkers()` в начале цикла `markers.forEach` добавляется проверка — до любой обработки маркера:
```js
if (!isOnActiveMap(marker.x)) return
```

#### Инициализация тайлового слоя

В `init()` тайловый слой создаётся через `tileLayer`-переменную (чтобы его можно было заменить при переключении):

```js
tileLayer = L.tileLayer(mapConfigs[activeMap].tiles, {
  minZoom: mapMinZoom,
  maxZoom: mapMaxZoom,
  bounds: mapBounds,
  tms: false
}).addTo(map)
```

#### Функция переключения карты

```js
function switchMap(name) {
  if (name === activeMap) return
  activeMap = name

  // Заменить тайловый слой
  if (tileLayer) map.removeLayer(tileLayer)
  tileLayer = L.tileLayer(mapConfigs[name].tiles, {
    minZoom: mapMinZoom,
    maxZoom: mapMaxZoom,
    bounds: mapBounds
  }).addTo(map)

  // Сбросить позицию
  map.fitBounds(mapBounds)

  // Перезагрузить все активные слои с новой картой
  // drawData() сам вызывает clearAllLayers() → re-fetch → renderMarkers()
  drawData()

  // Обновить кнопки
  $('.map-btn').removeClass('active')
  $('.map-btn[data-map="' + name + '"]').addClass('active')
}
```

#### Click-хендлер (добавить в `init()`)

```js
$(document).on('click', '.map-btn', function() {
  switchMap($(this).data('map'))
})
```

---

### `src/views/index.ejs`

В сайдбар добавляется блок переключения карт между разделителем (над `sidebar-footer`):

```html
<div class="sidebar-divider"></div>
<div class="map-switch">
  <button class="sb-btn map-btn active" data-map="exiledlands" title="Exiled Lands">EL</button>
  <button class="sb-btn map-btn"        data-map="siptah"       title="Isle of Siptah">Si</button>
</div>
```

Кнопка `exiledlands` изначально имеет класс `.active` (карта по умолчанию).

---

### `public/assets/css/map.css`

Добавляется блок для двух кнопок карты (flex-column, без разрыва между ними):

```css
.map-switch {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 0 8px;
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

Состояния (`:hover`, `.active`) наследуются от `.sb-btn` — дополнительных стилей не требуется.

---

## Файлы, которые изменяются

| Файл | Тип изменения |
|---|---|
| `public/assets/scripts/map.js` | Точечные правки (~40 строк) |
| `src/views/index.ejs` | +6 строк (блок `.map-switch`) |
| `public/assets/css/map.css` | +10 строк (стили `.map-switch`, `.map-btn`) |

Файлы, которые **не трогаются:** бэкенд, SQL, контроллеры, роуты, языковые файлы.

---

## Не входит в эту задачу

- Получение или генерация тайлов Isle of Siptah
- Изменение бэкенда (добавление `?map=` параметра)
- Адаптация языковых файлов для Siptah-специфичных class-имён
- Мобильная адаптация
