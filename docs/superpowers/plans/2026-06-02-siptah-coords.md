# Siptah — калибровка координат и отладочный оверлей

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Исправить позиционирование маркеров на карте Isle of Siptah и добавить отладочный оверлей координат для точной калибровки.

**Architecture:** Два независимых изменения: (1) обновить диапазоны игровых координат `rangeX`/`rangeY` в `mapConfigs.siptah` — это сразу исправляет все маркеры; (2) добавить функцию обратного преобразования `fromLatLng` и HTML/CSS/JS оверлея, отображающего координаты `TeleportPlayer` под курсором при нажатии `Shift+C`.

**Tech Stack:** Vanilla JS (ES5), jQuery 3, Leaflet 1.3, EJS templates, CSS.

---

## Тестовый подход

Автоматических тестов нет. Каждая задача: **изменить → `npm start` → проверить в браузере на `http://localhost:3001` → commit**. Для проверки координат маркеров нужна база `game.db` с данными Siptah. Оверлей координат можно проверить без БД.

---

## Карта файлов

| Файл | Изменение |
|---|---|
| `public/assets/scripts/map.js` | Обновить `mapConfigs.siptah` (строки 18–24); добавить `fromLatLng()` после `toLatLng` (строка 74); добавить два обработчика в `init()` |
| `src/views/index.ejs` | Добавить `<div id="coord-debug">` после `#status-bar` (строка 160) |
| `public/assets/css/map.css` | Добавить стили `#coord-debug` в конец файла (после строки 546) |

---

## Task 1: Обновить диапазоны координат Siptah

**Files:**
- Modify: `public/assets/scripts/map.js:18-24`

- [ ] **Step 1: Заменить блок siptah в mapConfigs**

Найти строки 18–24:
```js
  siptah: {
    label: 'Isle of Siptah',
    rangeX: [1234655, 1884492],
    rangeY: [-354417, 325164],
    tiles: 'assets/tiles-siptah/{z}/{x}/{y}.png',
    xMin: 1234655
  }
```

Заменить на:
```js
  siptah: {
    label: 'Isle of Siptah',
    rangeX: [1161000, 1961000],
    rangeY: [-295000, 473000],
    tiles: 'assets/tiles-siptah/{z}/{x}/{y}.png',
    xMin: 1000000
  }
```

- [ ] **Step 2: Проверить в браузере**

Запустить сервер:
```
npm start
```

Открыть `http://localhost:3001`. Переключиться на карту Siptah (кнопка «Si» в сайдбаре). Включить слой Thralls или Pets. Маркеры должны находиться в пределах острова, а не за его краями внизу.

Если маркеры всё ещё смещены — это нормально для этого шага, точная подгонка будет в Task 3 через оверлей. Главное, что они теперь должны быть в пределах видимой карты.

- [ ] **Step 3: Commit**

```
git add public/assets/scripts/map.js
git commit -m "fix: update Siptah rangeX/rangeY to calibrated tile boundaries"
```

---

## Task 2: CSS для оверлея координат

**Files:**
- Modify: `public/assets/css/map.css` (добавить в конец, после строки 546)

- [ ] **Step 1: Добавить стили в конец map.css**

Открыть `public/assets/css/map.css` и дописать в самый конец:

```css
/* ── Coordinate debug overlay ── */
#coord-debug {
  position: absolute;
  bottom: 28px;
  right: 8px;
  background: rgba(17,10,3,0.88);
  border: 1px solid rgba(200,134,10,0.3);
  border-radius: 2px;
  padding: 3px 8px;
  font-family: 'Crimson Text', serif;
  font-size: 0.8rem;
  color: #9a7040;
  pointer-events: none;
  z-index: 1000;
  letter-spacing: 0.02em;
}
```

- [ ] **Step 2: Commit**

```
git add public/assets/css/map.css
git commit -m "feat: add CSS for coordinate debug overlay"
```

---

## Task 3: HTML оверлея в index.ejs

**Files:**
- Modify: `src/views/index.ejs:160`

- [ ] **Step 1: Добавить div после строки status-bar**

Найти строку (около 160):
```html
        <div id="status-bar"><%= lang['ui.last_update'] %><span class="lastupdate"><%= lastupdate %></span></div>
```

Добавить сразу после неё (перед закрывающим `</div>` контейнера `#map-container`):
```html
        <div id="coord-debug" style="display:none"><span id="coord-text">—</span></div>
```

- [ ] **Step 2: Проверить в браузере**

Перезапустить сервер (`npm start`). Открыть DevTools Console, выполнить:
```js
$('#coord-debug').show()
```

Элемент должен появиться в правом нижнем углу карты с текстом «—». Выполнить:
```js
$('#coord-debug').hide()
```

Элемент должен скрыться.

- [ ] **Step 3: Commit**

```
git add src/views/index.ejs
git commit -m "feat: add coordinate debug overlay HTML"
```

---

## Task 4: JS — fromLatLng и обработчики событий

**Files:**
- Modify: `public/assets/scripts/map.js`

- [ ] **Step 1: Добавить функцию fromLatLng после toLatLng**

Найти строки (около 71–74):
```js
function toLatLng(x, y) {
  var cfg = mapConfigs[activeMap]
  return [ convertRange(y, cfg.rangeY, boundsY), convertRange(x, cfg.rangeX, boundsX) ]
}
```

Добавить сразу после закрывающей `}`:
```js
function fromLatLng(lat, lng) {
  var cfg = mapConfigs[activeMap]
  return {
    x: Math.round(convertRange(lng, boundsX, cfg.rangeX)),
    y: Math.round(convertRange(lat, boundsY, cfg.rangeY))
  }
}
```

- [ ] **Step 2: Добавить обработчик mousemove в init()**

В функции `init()` найти блок с обработчиком `Escape` (около строки 194):
```js
    if (e.key === 'Escape') {
      closePanel()
    }
```

После закрывающей `})` этого блока добавить:
```js
  map.on('mousemove', function (e) {
    if ($('#coord-debug').is(':visible')) {
      var c = fromLatLng(e.latlng.lat, e.latlng.lng)
      $('#coord-text').text('TeleportPlayer ' + c.x + ' ' + c.y + ' 0')
    }
  })

  $(document).on('keydown', function (e) {
    if (e.shiftKey && e.key === 'C') {
      $('#coord-debug').toggle()
    }
  })
```

- [ ] **Step 3: Проверить в браузере**

Запустить сервер (`npm start`). Открыть `http://localhost:3001`.

1. Нажать `Shift+C` — в правом нижнем углу карты должен появиться оверлей.
2. Навести курсор на карту — текст должен обновляться вида `TeleportPlayer 123456 234567 0`.
3. На карте EL: навести на центр карты — X должен быть около `50000–100000`, Y около `30000–50000`.
4. Переключиться на карту Siptah — при наведении X должен быть около `1500000–1700000`.
5. Нажать `Shift+C` ещё раз — оверлей должен скрыться.

- [ ] **Step 4: Верифицировать маркеры Siptah (если есть game.db)**

Если доступна БД с данными:
1. Включить слой Thralls на карте Siptah.
2. Навести курсор на маркер — оверлей покажет `TeleportPlayer X Y 0`.
3. Сравнить X/Y с известными координатами этого маркера (например, из `/api/thralls`).
4. Расхождение не должно превышать ±2000 единиц (≈ 5% клетки сетки).

Если расхождение больше — скорректировать `rangeX`/`rangeY` в `mapConfigs.siptah` пропорционально отклонению и повторить Task 1.

- [ ] **Step 5: Commit**

```
git add public/assets/scripts/map.js
git commit -m "feat: add fromLatLng and Shift+C coordinate debug overlay"
```
