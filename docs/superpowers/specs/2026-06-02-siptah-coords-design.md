# Siptah — калибровка координат и отладочный оверлей

**Дата:** 2026-06-02  
**Статус:** Утверждён

---

## Проблема

Маркеры на карте Isle of Siptah отображаются значительно ниже реальных игровых позиций. Причина: `rangeX`/`rangeY` в `mapConfigs.siptah` взяты из диапазона данных в БД (min/max по `actor_position`), а не из реальных границ рендера тайлов.

Конкретно: текущий `rangeY[1] = 325164` — южная граница слишком близко к центру, тогда как тайлы охватывают зону примерно до `+473000`. Из-за этого вся Y-шкала сжата, и каждый маркер отображается ниже реального положения.

---

## Контекст: как устроена калибровка

Обе карты (EL и Siptah) используют один и тот же Leaflet CRS-холст:
- `boundsX = [14.4, 230.7]` — диапазон долгот в Leaflet
- `boundsY = [-47.7, -245.3]` — диапазон широт в Leaflet

Тайловая структура идентична: 63×63 тайла при zoom 6 (16128×16128 px).

`toLatLng(x, y)` линейно проецирует игровые координаты на этот холст через `convertRange`:
```js
lat = convertRange(y, cfg.rangeY, boundsY)
lng = convertRange(x, cfg.rangeX, boundsX)
```

`rangeX`/`rangeY` — это те игровые координаты, которые соответствуют краям тайлового изображения.

---

## Калибровка по опорным точкам

Использованы две точки с известными игровыми координатами и приблизительными позициями на карте:

| Точка | X | Y | Позиция на карте |
|---|---|---|---|
| 1 | 1 510 325 | 269 720 | ~5 G/H |
| 2 | 1 235 916 | 202 048 | ~6/7 B |

### Структура сетки Siptah

- **16 колонок** (A–P), слева направо (запад → восток)
- **17 строк**, нумерация снизу (строка 1 = юг/низ, строка 17 = север/верх)
- Y растёт на юг (как в EL)
- Размер клетки ≈ 50 000 UE units по X, ≈ 45 000 по Y — совпадает с EL

### Метод

Относительная позиция точки на тайловом изображении → Leaflet lat/lng → обратная подстановка в формулу `convertRange` → решение системы двух уравнений.

Строка 5 от нижнего края (юг) = 12.5/17 = 73.5% от верха.  
Строка 6.5 от нижнего края = 11/17 = 64.7% от верха.

### Результат

```
rangeX: [1161000, 1961000]   // ширина ~800 000 UE = 16 × 50 000
rangeY: [-295000, 473000]    // высота ~768 000 UE = 17 × 45 200
```

Верификация:
- Point 1 (Y=269720) → lat ≈ -192.9 ≈ 73.5% от верха ✓
- Point 2 (Y=202048) → lat ≈ -175.5 ≈ 64.7% от верха ✓

Значения приблизительные (опорные точки «примерно»). Точная подстройка — через отладочный оверлей.

---

## Секция 1 — Обновление mapConfigs.siptah

**Файл:** `public/assets/scripts/map.js`

```js
siptah: {
  label: 'Isle of Siptah',
  rangeX: [1161000, 1961000],
  rangeY: [-295000, 473000],
  tiles: 'assets/tiles-siptah/{z}/{x}/{y}.png',
  xMin: 1000000
}
```

`xMin` изменён с `1234655` на `1000000` — чтобы захватить объекты у западного края карты с запасом.

---

## Секция 2 — Отладочный оверлей координат

Позволяет сравнивать отображаемые игровые координаты с реальными (`TeleportPlayer`-командой) и точно подстраивать `rangeX`/`rangeY`.

### Функция обратного преобразования

**Файл:** `public/assets/scripts/map.js`

```js
function fromLatLng(lat, lng) {
  var cfg = mapConfigs[activeMap]
  return {
    x: Math.round(convertRange(lng, boundsX, cfg.rangeX)),
    y: Math.round(convertRange(lat, boundsY, cfg.rangeY))
  }
}
```

### HTML

**Файл:** `src/views/index.ejs` — добавить внутри `#map-container`, рядом с `.lastupdate`:

```html
<div id="coord-debug" style="display:none">
  <span id="coord-text">—</span>
</div>
```

### CSS

**Файл:** `public/assets/css/map.css`

```css
#coord-debug {
  position: absolute;
  bottom: 28px;
  right: 8px;
  background: rgba(17,10,3,0.88);
  border: 1px solid rgba(200,134,10,0.3);
  padding: 3px 8px;
  font-family: 'Crimson Text', serif;
  font-size: 0.8rem;
  color: #9a7040;
  pointer-events: none;
  z-index: 1000;
}
```

### JS (в `init()`)

**Файл:** `public/assets/scripts/map.js`

```js
map.on('mousemove', function(e) {
  if ($('#coord-debug').is(':visible')) {
    var c = fromLatLng(e.latlng.lat, e.latlng.lng)
    $('#coord-text').text('TeleportPlayer ' + c.x + ' ' + c.y + ' 0')
  }
})

$(document).on('keydown', function(e) {
  if (e.shiftKey && e.key === 'C') {
    $('#coord-debug').toggle()
  }
})
```

---

## Файлы, которые изменяются

| Файл | Изменение |
|---|---|
| `public/assets/scripts/map.js` | Обновить `mapConfigs.siptah`, добавить `fromLatLng()`, два обработчика в `init()` |
| `src/views/index.ejs` | +3 строки HTML (`#coord-debug`) |
| `public/assets/css/map.css` | +10 строк CSS (`#coord-debug`) |

---

## Процесс верификации после деплоя

1. Переключиться на карту Siptah
2. Нажать `Shift+C` — появится оверлей с координатами
3. Навести курсор на маркер с известным `TeleportPlayer`-значением
4. Сравнить отображаемые X/Y с реальными
5. Если расходятся — скорректировать `rangeX`/`rangeY` в `mapConfigs.siptah` пропорционально отклонению
