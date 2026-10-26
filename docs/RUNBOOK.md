# Runbook — CycleConnect

Как устроен прод и что делать, когда что-то сломалось. Репозиторий публичный:
секретов, личных ID и адресов вспомогательных серверов здесь нет — они только
в env-файлах на сервере.

## Схема

```
GitHub main ──push──▶ GitHub Action deploy.yml ──ssh──▶ VPS «front» (Ubuntu)
                                                         ├─ Caddy: cycleconnect.cc, api.*, studio.*
                                                         ├─ Docker: cycleconnect-app (Next.js, :4000)
                                                         ├─ Docker compose: self-hosted Supabase (/root/supabase/docker)
                                                         ├─ Ollama (systemd, :11434, закрыт файрволом)
                                                         └─ backup-tunnel.service — SOCKS/SSH-туннель на второй VPS
```

- Облачный Supabase (supabase.com) **устарел**, его не трогаем. Supabase MCP
  ходит только туда — для этого проекта не использовать.
- С российского IP заблокированы Google AI, OpenRouter, Telegram и Open-Meteo —
  весь такой трафик идёт через `SOCKS_PROXY` / туннель.

## Деплой

**Деплой = коммит в `main`.** `.github/workflows/deploy.yml` по SSH делает на
сервере `git reset --hard origin/main`, копирует edge-функции, собирает образ
и перезапускает контейнер. Занимает 3–5 минут, в логе Action в конце `Deployed`.

- Секрет Action: `SSH_PRIVATE_KEY`.
- PR и ветки проверяет `.github/workflows/ci.yml` (tsc + vitest; eslint пока
  не блокирует).
- После деплоя проверить версию:
  `docker exec cycleconnect-app node -e "console.log(require('next/package.json').version)"`

### Откат

```bash
cd /opt/cycleconnect && git log --oneline -5
git reset --hard <хороший-коммит>
docker build -t cycleconnect:latest .
docker stop cycleconnect-app && docker rm cycleconnect-app
# затем docker run с теми же флагами, что в deploy.yml
```

Быстрее — если есть заранее помеченный образ (`docker images cycleconnect`),
запустить его тем же `docker run`.

## Где что лежит на сервере

| Что | Где |
|---|---|
| Код приложения (git-клон) | `/opt/cycleconnect` |
| Env приложения | `/opt/cycleconnect/.env.production` (попадает в образ при сборке) |
| Supabase compose + env | `/root/supabase/docker/` (`.env`, `docker-compose.override.yml`) |
| Edge-функции (живые) | `/root/supabase/docker/volumes/functions/<name>/` |
| Storage | `/root/supabase/docker/volumes/storage/` |
| Бэкапы | `/root/backups/db/*.dump`, `/root/backups/storage/*.tar.gz` (ежедневно 03:00, хранятся 14 дней) |
| Caddy | `/etc/caddy/Caddyfile` |
| SRTM-тайлы рельефа | `/opt/srtm` |

Email-шаблоны авторизации GoTrue забирает по URL с сайта —
`public/email-templates/*.html` в этом репо. Правка там = правка писем.

## Миграции

Деплой миграции **не применяет**. Новая миграция — файл
`supabase/migrations/NNN_name.sql` (следующий номер). Применить на сервере:

```bash
docker exec -i supabase-db psql -U postgres -d postgres \
  < /opt/cycleconnect/supabase/migrations/NNN_name.sql
```

Порядок: сначала миграция, потом деплой кода, который на неё опирается.

## Edge-функции

`tg-notify`, `tg-webhook`, `email-notify` синхронизируются деплоем автоматически
(копирование в `volumes/functions` + `docker restart supabase-edge-functions`).

## Частые поломки

| Симптом | Куда смотреть |
|---|---|
| Сайт не открывается, приложение живо | `systemctl status caddy`. Caddy должен стартовать после Docker (drop-in `caddy.service.d/after-docker.conf`) |
| Сайт лёг сам и поднялся | `journalctl -u site-watchdog` — сторож перезапускает Caddy/контейнер |
| Не работает AI, Telegram-бот, ветер | `systemctl status backup-tunnel.service`, переменная `SOCKS_PROXY` |
| Бот не получает сообщения | вебхук идёт через релей на втором VPS; `getWebhookInfo` у Bot API |
| Кончилось место | `df -h /`; крупное: образы Docker, Ollama, `/opt/srtm`, бэкапы |
| pg_cron-задачи не выполняются | `select * from cron.job;` — часть задач из миграций 006/053 не запланирована |

Мониторинг: `site-watchdog.timer` на самом сервере и внешний `cc-uptime.timer`
на втором VPS, алерты приходят в Telegram.

## Открытые хвосты

- Бэкапы только локальные: нет offsite-копии и не было пробного восстановления.
- Старый облачный проект Supabase ещё дёргает `/api/strava/cron/process-events`
  с настоящим `CRON_SECRET` — удалить проект в дашборде и сменить секрет.
