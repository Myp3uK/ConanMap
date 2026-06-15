# Публикация через Caddy / Publishing with Caddy

[Русский](#русский) · [English](#english)

---

## Русский

Открыть карту по HTTPS через [Caddy](https://caddyserver.com/) (reverse proxy с автоматическим Let's Encrypt).

### 1. Установка Caddy

Windows:
```powershell
winget install CaddyServer.Caddy
```
Или скачать с https://caddyserver.com/download. Проверка:
```powershell
caddy version
```

### 2. Настройка карты

В `conan-exiles-admin-map.ini` рядом с приложением:
```ini
[SETTINGS]
host = 127.0.0.1     ; слушать локально — Caddy проксирует на этот адрес
port = 3001
auto_refresh = 300   ; авто-обновление данных, секунд
```
Запустите приложение (`conan-exiles-admin-map.exe` или `npm start`). Оно должно отвечать на `http://127.0.0.1:3001`.

### 3. Открытие портов

- DNS-запись вашего домена (например `map.example.com`) должна указывать на IP сервера.
- Откройте входящие порты **80** и **443** (через них Caddy получает сертификат и принимает трафик):
```powershell
New-NetFirewallRule -DisplayName "Caddy HTTP"  -Direction Inbound -Protocol TCP -LocalPort 80  -Action Allow
New-NetFirewallRule -DisplayName "Caddy HTTPS" -Direction Inbound -Protocol TCP -LocalPort 443 -Action Allow
```

### 4. Запуск

Создайте файл `Caddyfile`:
```caddy
map.example.com {
    encode zstd gzip
    reverse_proxy 127.0.0.1:3001
}
```
Запустите:
```powershell
caddy run --config Caddyfile      # на переднем плане
# или фоном:
caddy start --config Caddyfile
```
Caddy сам выпустит HTTPS-сертификат при первом обращении. Откройте `https://map.example.com`.

---

## English

Serve the map over HTTPS with [Caddy](https://caddyserver.com/) (reverse proxy with automatic Let's Encrypt).

### 1. Install Caddy

Windows:
```powershell
winget install CaddyServer.Caddy
```
Or download from https://caddyserver.com/download. Verify:
```powershell
caddy version
```

### 2. Configure the map

In `conan-exiles-admin-map.ini` next to the app:
```ini
[SETTINGS]
host = 127.0.0.1     ; listen locally — Caddy proxies to this address
port = 3001
auto_refresh = 300   ; automatic data refresh, seconds
```
Start the app (`conan-exiles-admin-map.exe` or `npm start`). It should respond on `http://127.0.0.1:3001`.

### 3. Open the ports

- Point your domain's DNS record (e.g. `map.example.com`) at the server's IP.
- Open inbound ports **80** and **443** (Caddy uses them for the certificate and traffic):
```powershell
New-NetFirewallRule -DisplayName "Caddy HTTP"  -Direction Inbound -Protocol TCP -LocalPort 80  -Action Allow
New-NetFirewallRule -DisplayName "Caddy HTTPS" -Direction Inbound -Protocol TCP -LocalPort 443 -Action Allow
```

### 4. Run

Create a `Caddyfile`:
```caddy
map.example.com {
    encode zstd gzip
    reverse_proxy 127.0.0.1:3001
}
```
Run it:
```powershell
caddy run --config Caddyfile      # foreground
# or in the background:
caddy start --config Caddyfile
```
Caddy issues the HTTPS certificate automatically on first request. Open `https://map.example.com`.
