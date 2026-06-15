# Backend Optimization: Multi-Server Architecture

**Date:** 2026-06-04  
**Status:** Approved

## Overview

Переход от однопользовательского локального инструмента к многопользовательскому веб-сервису с поддержкой нескольких игровых серверов Conan Exiles. Архитектура строится вокруг снапшот-сервиса: данные из `game.db` читаются только при ручном обновлении и кэшируются в памяти. API отдаёт данные исключительно из снапшота.

## Goals

- Поддержка нескольких игровых серверов (сейчас 2, расширяемо)
- Разграничение доступа: каждый администратор видит только свой сервер; суперадмин — все
- `game.db` читается только при явном запросе обновления (rate limiting)
- Значительное упрощение кода: ~40 файлов роутов/контроллеров → 1 файл + 1 сервис
- Сохранение пути к деплою на внешний хостинг через GitHub Actions

## Non-Goals

- Автоматическое фоновое обновление данных (только ручное)
- Деплой на внешний хостинг (отдельная задача)
- Редизайн фронтенда

## Architecture

### Request lifecycle (new)

```
Express
  → middleware: app → auth → serverAccess → route handler
  → route handler читает из snapshotService.get(serverId)
  → JSON response

POST /api/:serverId/refresh:
  → auth → serverAccess → snapshotService.refresh(serverId)
  → читает game.db → обновляет память → пишет snapshots/<serverId>.json
```

### Data flow

```
game.db (игровой сервер)
    ↓  только при refresh
snapshotService (in-memory Map + snapshots/*.json на диске)
    ↓  все API-запросы
Express route handlers
    ↓
JSON response → фронтенд
```

## Components

### 1. Configuration — `src/config.js`

INI-файл расширяется для поддержки нескольких серверов.

**Формат `.ini`:**

```ini
[SETTINGS]
language = en
port = 3001

[SERVER_server1]
name = Exile Lands
database = C:\GameServers\server1\game.db
refresh_cooldown = 300

[SERVER_server2]
name = Isle of Siptah
database = C:\GameServers\server2\game.db
refresh_cooldown = 300

[USERS]
superadmin:pass:*
admin1:pass:server1
admin2:pass:server2
```

**Обратная совместимость:** если в конфиге есть старая секция `[CONAN_EXILES]`, она автоматически трактуется как `[SERVER_server1]`.

**`config.js` экспортирует:**
- `config.servers` — массив `{ id, name, database, refreshCooldown }`
- `config.users` — Map `{ username → { password, servers: string[] } }` (servers: `['*']` для суперадмина)
- `config.settings` — `{ port, language }`

### 2. Snapshot Service — `src/services/snapshot.js`

Единственная точка взаимодействия с `game.db`.

**Структура снапшота в памяти:**

```js
{
  serverId: 'server1',
  timestamp: '2026-06-04T12:00:00.000Z',  // ISO string
  refreshing: false,
  data: {
    players: [...],
    altars: [...],
    animalpens: [...],
    beds: [...],
    buildings: [...],
    campfires: [...],
    chests: [...],
    crabPots: [...],       // camelCase — совпадает с ключами в sql.js
    crafting: [...],
    fishNets: [...],
    mapRooms: [...],
    pets: [...],
    thralls: [...],
    thrones: [...],
    trebuchets: [...],
    vaults: [...],
    waterWells: [...],
    wheelsOfPain: [...],
    pippiAll: [...],
    pippiThespians: [...]
  }
}
```

**API сервиса:**
- `snapshotService.load()` — при старте загружает все `snapshots/*.json` в память
- `snapshotService.get(serverId)` → снапшот или `null` если не существует
- `snapshotService.refresh(serverId)` → Promise; открывает `game.db`, читает все сущности через SQL из `sql.js`, закрывает, обновляет память, пишет на диск. Три кастомных трансформера (`players`, `pets`, `thralls`) применяются здесь один раз — не при каждом запросе

**Rate limiting:**
- Cooldown задаётся в конфиге (`refresh_cooldown`, секунды, по умолчанию 300)
- Если `now - lastRefreshedAt < cooldown` → бросает ошибку с `retryAfter` (секунды)
- Если `refreshing === true` → бросает ошибку «обновление уже выполняется»

**Папка `snapshots/`** добавляется в `.gitignore`.

### 3. Auth Middleware — `src/middleware/auth.js` (обновлённый)

- Читает `Authorization: Basic ...` заголовок
- Сверяет с `config.users`
- При успехе: `res.locals.user = { username, servers }` → `next()`
- При неудаче: `401`

### 4. Server Access Middleware — `src/middleware/serverAccess.js` (новый)

Применяется ко всем маршрутам `/api/:serverId/*`.

```js
const { servers } = res.locals.user
const { serverId } = req.params
if (!config.servers.find(s => s.id === serverId)) → 404 (сервер не найден в конфиге)
if (servers[0] !== '*' && !servers.includes(serverId)) → 403
next()
```

Важно: 404 проверяется по `config.servers`, а не по наличию снапшота — сервер может существовать, но ещё не иметь снапшота (до первого refresh).

### 5. API Routes — `src/routes/api/index.js` (переписан)

Один файл вместо ~20. Фабрика маршрутов использует явный маппинг `url → dataKey`, чтобы развязать URL-путь (lowercase) от camelCase-ключей снапшота:

```js
const entityRoutes = [
  { path: 'altars',          key: 'altars' },
  { path: 'animalpens',      key: 'animalpens' },
  { path: 'beds',            key: 'beds' },
  { path: 'buildings',       key: 'buildings' },
  { path: 'campfires',       key: 'campfires' },
  { path: 'chests',          key: 'chests' },
  { path: 'crabpots',        key: 'crabPots' },
  { path: 'crafting',        key: 'crafting' },
  { path: 'fishnets',        key: 'fishNets' },
  { path: 'maprooms',        key: 'mapRooms' },
  { path: 'pets',            key: 'pets' },
  { path: 'players',         key: 'players' },
  { path: 'thralls',         key: 'thralls' },
  { path: 'thrones',         key: 'thrones' },
  { path: 'trebuchets',      key: 'trebuchets' },
  { path: 'vaults',          key: 'vaults' },
  { path: 'waterwells',      key: 'waterWells' },
  { path: 'wheelsofpain',    key: 'wheelsOfPain' },
  { path: 'pippi/all',       key: 'pippiAll' },
  { path: 'pippi/thespians', key: 'pippiThespians' },
]

entityRoutes.forEach(({ path, key }) => {
  router.get(`/:serverId/${path}`, serverAccess, (req, res) => {
    const snap = snapshotService.get(req.params.serverId)
    res.json(snap?.data[key] ?? [])
  })
})
```

**Дополнительные эндпоинты:**

```
GET  /api/servers                        (требует auth)
  → список { id, name, timestamp | null, refreshing }
    только для серверов пользователя;
    timestamp = null если снапшот ещё не создавался

POST /api/:serverId/refresh              (требует auth + serverAccess)
  → запуск обновления
  → 200 { timestamp } при успехе
  → 429 { retryAfter } если cooldown не истёк
  → 409 если уже обновляется
```

### 6. Frontend — `public/assets/scripts/map.js` (минимальные изменения)

**Новое при загрузке:**
1. `GET /api/servers` → получить список серверов пользователя
2. Если один сервер — выбрать автоматически и загрузить данные
3. Если несколько — показать панель выбора сервера

**Новая панель серверов** в сайдбаре (новая кнопка `🖥`):
```
◉ Сервер 1     [Обновить]   обновлено 12 мин. назад
○ Сервер 2     [Обновить]   обновлено 3 ч. назад
```

**Поведение кнопки "Обновить":**
- `POST /api/:serverId/refresh`
- При `200` — перезагружает все данные активного сервера
- При `429` — toastr «Следующее обновление через X мин.»
- Кнопка блокируется на время запроса

**Все `fetch('/api/...')` → `fetch('/api/${activeServerId}/...')`**

Переключатель карт (EL / Siptah) остаётся независимым от серверов. Карта определяется диапазоном координат маркера (`xMin`/`xMax` в `mapConfigs`), данные для обеих карт приходят из одного снапшота.

## Deleted Files

| Файл | Причина |
|---|---|
| `src/middleware/database.js` | Открытие БД перенесено в snapshot service |
| `src/controllers/api/BaseController.js` | Паттерн контроллера упразднён |
| `src/controllers/api/*.js` (~18 файлов) | Заменены фабрикой роутов |
| `src/controllers/api/pippi/*.js` | То же |
| `src/routes/api/*.js` (~18 файлов) | Заменены одним index.js |
| `src/routes/api/pippi/*.js` | То же |

## Migration Notes

- `[CONAN_EXILES]` → автоматически `[SERVER_server1]` при парсинге конфига
- Существующие `[USERS]` без указания серверов (`user:pass`) трактуются как `user:pass:*`
- При первом запуске без снапшота на диске — данные отсутствуют до первого ручного обновления

## Performance Impact

| Метрика | До | После |
|---|---|---|
| Открытий SQLite в час (50 запросов) | ~50 | 0–1 (только при refresh) |
| Время ответа API | ~5–20 мс (SQLite) | <1 мс (из памяти) |
| Количество файлов в `src/` | ~60 | ~30 |
