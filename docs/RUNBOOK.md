# Runbook — CycleConnect

Состояние на 01.11.2026. Документ описывает новый production VPS и выполняемые
операции. Секретов и значений ключей здесь нет.

## Архитектура и состояние переключения

- Production VPS: `cc`, `185.186.142.168:22`. Git-клон и runtime env:
  `/opt/cycleconnect`; `.env.production` принадлежит root и имеет режим `600`.
- Supabase stack: `/opt/cycleconnect-stack/compose.json`, Compose project
  `cc-stage`. Рабочие контейнеры: `cc-stage-app`, `cc-stage-db`, `cc-stage-auth`,
  `cc-stage-rest`, `cc-stage-storage`, `cc-stage-imgproxy`, `cc-stage-kong`,
  `cc-stage-functions`, `cc-stage-realtime`, `cc-stage-gateway`, а также
  `supabase-studio` и `supabase-meta`.
- Все 12 контейнеров запущены для приватной проверки; Realtime, Edge Functions,
  Studio и Meta проверялись вместе с Auth, Storage и API.
- Caddy работает в Docker на gateway. У хоста нет systemd Caddy. Все backend
  ports остаются непубликованными; web-трафик входит через gateway `80/443`,
  административный доступ — SSH.
  Gateway соединён с приватной сетью (`172.18.0.1` на основном bridge) и отдельным
  egress bridge. Сертификаты Caddy хранятся в
  `/opt/cycleconnect-stack/caddy-data/caddy`.
- SRTM-данные объёмом 4 GB перенесены на новый VPS.
- На момент обновления меняются четыре DNS A-записи: apex, `api`, `studio` и
  `www`; три уже сохранены, состояние четвёртой ещё загружается. Proxy выключен,
  TTL — Auto. DNS-переход считать незавершённым, пока не проверены все записи.
- Старый `front` для доменов CycleConnect проксирует TLS на новый VPS,
  сохраняя исходные Host и SNI. Старые CycleConnect app и Edge Functions на нём
  остановлены; CycleConnect cron и watchdog отключены. Их данные оставлены.
  Другие проекты на `front` не менялись.
- Auth, Storage (включая скачивание 186 файлов), основные browser flows и
  поиск по 30 проиндексированным маршрутам прошли проверки. Реальный вход через Google
  OAuth в браузере не проверялся. Production startup, финальная переиндексация,
  DNS и часть финальных проверок ещё продолжаются.
- При одновременном чтении образов с HDD возможны задержки; после тяжёлых
  операций дайте сервисам 15 секунд и повторите проверки. После этой паузы
  health checks всех сервисов проходили; признаков нехватки RAM в этих случаях
  не было.

## Gemini и исходящий трафик

Production использует Gemini native API: `gemini-3.5-flash-lite` для чата/JSON
и `gemini-embedding-2` размерности 1024 для векторов. В env установлены
`LOCAL_AI_ENABLED=false` и `EMBEDDING_PROVIDER=gemini`; локальный Ollama не нужен.
Не выводить env или ключи в shell history и логи.

Отдельный systemd unit `cc-egress` поднимает ограниченный SSH/SOCKS-туннель на
узел в Польше. Правило ключа ограничено `PermitOpen` на пять нужных API hosts.
SOCKS доступен на `172.18.0.1:1080`; порт `8444` обслуживает Telegram relay,
`8445` — Gemini relay. Deno endpoints на gateway используют private ports
`8087/8088`.

```bash
systemctl status cc-egress
journalctl -u cc-egress --since '15 minutes ago' --no-pager
```

## Deploy и проверка

Workflow нового deploy находится в ветке `77fdb21`: CI прошёл, но merge в `main`
и переключение production deploy ещё pending. Секрет SSH для GitHub подготовлен.
Workflow повторно использует CI
(TypeScript и Vitest обязательны, ESLint пока informational), затем по SSH
обновляет клон до точного GitHub SHA и запускает `scripts/vps-deploy.sh`.
Деплои сериализованы и не отменяют уже выполняющуюся выкладку.

После merge обычная выкладка запускается push в `main`. Скрипт на VPS:

1. Берёт `flock`, сохраняет текущий `cycleconnect:latest` как
   `cycleconnect:previous` и строит новый образ с BuildKit secret из
   `/opt/cycleconnect/.env.production`.
2. При необходимости обновляет только image сервиса `app` в приватном compose
   JSON и выполняет `docker compose ... up -d --no-deps app`.
3. Проверяет HTTP через внутренний IP gateway (порт 80, `Host: localhost`) до
   30 раз. При неготовности app image возвращается на `previous` и пересоздаётся
   только сервис app.
4. После успешной проверки синхронизирует `tg-notify`, `tg-webhook` и
   `email-notify`, затем перезапускает только сервис `functions`.

BuildKit secret не инвалидирует build cache сам по себе. `NEXT_PUBLIC_*` значения
встраиваются в браузерный JS; при их смене нужна сборка без cache. Для изменения
серверных runtime env приложение нужно пересоздать через Compose — обычный
`docker restart` не перечитывает env-файл.

Скрипт не останавливает стек целиком и не делает автоматическую очистку Docker.
`app` управляется Compose; не заменяйте его отдельным контейнером и не
останавливайте весь стек при обычной выкладке.

Просмотр состояния и логов:

```bash
cd /opt/cycleconnect-stack
docker compose -p cc-stage -f compose.json ps
docker logs --since 10m cc-stage-app --tail 100
docker logs --since 10m cc-stage-gateway --tail 100
docker exec cc-stage-app node -e 'console.log(require("next/package.json").version)'
```

Для внутренней HTTP-проверки определите текущий gateway IP динамически:

```bash
cd /opt/cycleconnect-stack
gateway_id=$(docker compose -p cc-stage -f compose.json ps -q gateway)
gateway_ip=$(docker inspect --format '{{range .NetworkSettings.Networks}}{{println .IPAddress}}{{end}}' "$gateway_id" | head -n1)
curl --fail --max-time 10 -H 'Host: localhost' "http://$gateway_ip/" -o /dev/null
```

После завершения DNS-перехода проверяйте публичные домены отдельно. HTTP 200
главной страницы не проверяет Auth, Storage, Gemini, OAuth или уведомления.

### Откат

**Откат только app на новом VPS.** При неготовности скрипт deploy автоматически
переставляет `cycleconnect:latest` на `cycleconnect:previous` и поднимает только
сервис app. Это не откатывает базу, Edge Functions или env. Для ручного отката:

```bash
docker image inspect cycleconnect:previous >/dev/null || exit 1
docker tag cycleconnect:previous cycleconnect:latest
cd /opt/cycleconnect-stack
docker compose -p cc-stage -f compose.json up -d --no-deps app
```

**Возврат production на старый `front` после открытия записей на `cc` не сводится
к DNS.** Старый `front` теперь проксирует домены CycleConnect на новый сервер и
сам по себе не вернёт старую БД. Сначала заморозить новые записи, синхронизировать
актуальные DB и Storage обратно на `front` с сохранением xattrs, подготовить там
совместимые app/env и Gemini embeddings, затем восстановить прежние Caddy, DNS и
relay. Автоматический failover на старую production-базу не настроен; точный
план синхронизации нужно подтвердить до любых обратных переключений.

## Миграции БД

Deploy не применяет SQL-миграции. Следующий номер и совместимость проверьте в
`supabase/migrations/`; после `067` следующий номер `068`. Есть дубликаты `005`,
их не переиспользовать. До SQL-изменений сделать бэкап.

```bash
docker exec -i cc-stage-db psql -v ON_ERROR_STOP=1 -U postgres -d postgres \
  < /opt/cycleconnect/supabase/migrations/NNN_name.sql
```

Миграции не являются полным bootstrap пустой БД. При восстановлении применялся
production dump и baseline; не запускать все старые миграции как замену dump.

### Caveats полного восстановления

- Из `globals.sql` восстановить роли; существующие роли не создавать повторно,
  но сохранить соответствующие `ALTER`/`GRANT`.
- Полный `pg_restore` выполнялся с `--no-acl`, затем восстанавливались все 1162
  ACL/default ACL и `database-settings.sql`.
- После dump надо восстановить `graphql_public.graphql(text,text,jsonb,jsonb)`
  из `graphql-wrapper.sql` и вернуть её в extension `pg_graphql`: обычный dump не
  включает это определение как объект расширения.
- Для Storage обязательны GNU tar параметры `--xattrs --xattrs-include='*'
  --acls --numeric-owner`. Архив без xattrs приводил к HTTP 500 `ENODATA` при
  чтении существующих GPX. Проверять восстановление через Storage API.
- Полное восстановление final copy проверено: Auth, Vault, RLS, hashes ролей и
  Storage сверены. Не выполнять `pg_restore --clean` на живой production БД.

## Cron и host timers

В production `cron.launch_active_jobs=on`. Сейчас активны ровно два задания:

| Job | Schedule |
|---|---|
| `grabber-telegram` | `0 * * * *` |
| `grabber-forum` | `0 6 * * *` |

Миграция 060 описывает форумный запуск как 06:00 UTC. Настроенный timezone
pg_cron для исходной БД в документации не зафиксирован; проверить его перед
пересчётом локального времени:

```bash
docker exec cc-stage-db psql -U postgres -d postgres -c \
  'select jobname, schedule, active from cron.job order by jobname;'
docker exec cc-stage-db psql -U postgres -d postgres -c 'show cron.launch_active_jobs;'
docker exec cc-stage-db psql -U postgres -d postgres -c 'show cron.timezone;'
```

Не включать email cron из миграции 053 и Strava job из миграции 006. Strava также
отключена флагами приложения. На старом хосте CycleConnect cron выключен.

На host включены systemd timers: `cc-finish-events` ежедневно в 09:30
Europe/Moscow; `cc-backup` ежедневно в 03:00 Europe/Moscow с random delay до
10 минут и `Persistent=true`.

```bash
systemctl list-timers --all | grep -E 'cc-(backup|finish-events)'
systemctl status cc-backup.timer cc-finish-events.timer
```

## Бэкапы

`/usr/local/bin/cc-backup.sh` установлен из `scripts/vps-backup.sh`; timers
включены, но первый scheduled run и реальное восстановление именно этим timer
ещё не проверены. Бэкапы создаются локально в
`/var/backups/cycleconnect/<UTC timestamp>` и хранятся 14 дней. Включены custom
DB dump, globals, Storage с xattrs, чувствительные конфиги/env/SSH files,
SHA256SUMS и marker `COMPLETE`. Retention затрагивает только завершённые копии.
Каталоги и файлы доступны только root. Offsite-копия не настроена.

Проверка работы после первого запуска:

```bash
systemctl list-timers --all | grep cc-backup
systemctl status cc-backup.timer
journalctl -u cc-backup.service --since today --no-pager
find /var/backups/cycleconnect -maxdepth 2 -name COMPLETE -type f -print
```

Не копировать содержимое env, SQL с password hashes, Vault secrets или закрытых
ключей в issue, логи или Git. Проверять конкретную копию можно её SHA256SUMS,
`pg_restore --list` внутри совместимого DB container и `tar -tzf` для архивов.

## Edge Functions и same-origin Supabase

Живые функции находятся в `/opt/cycleconnect-stack/supabase/volumes/functions/`;
`vps-deploy.sh` синхронизирует `tg-notify`, `tg-webhook`, `email-notify` и
перезапускает Compose service `functions`. Env добавляется через production
Compose configuration; выводить его значения запрещено. `TG_WEBHOOK_SECRET`
должен совпадать с секретом webhook, `CRON_SECRET` — в приложении, Edge Functions
и Vault. На фронтенде продолжают использоваться Supabase JS/SSR SDK и rewrites
`/api/supabase/*`; это действующая схема self-hosted Supabase.

## Poland relay и старый front

Сохранён существующий путь мониторинга и Telegram relay через Poland. Схема:
второй VPS → Poland → production gateway; порт `18443` на Poland теперь ведёт на
`185.186.142.168:443` (раньше `front:443`) с TLS passthrough. Адрес Telegram
webhook не менялся.

- На Poland работают `cc-front-relay.socket` и `cc-front-relay.service`
  (`systemd-socket-proxyd`), а `cc-front-relay-firewall.service` ограничивает
  доступ адресами второго VPS. Цепь `CC-FRONT-RELAY` должна быть первой в INPUT;
  `/usr/local/sbin/cc-front-relay-guard` восстанавливает её позицию через
  `/root/antizapret/custom-up.sh` после перезапуска AntiZapret.
- `cc-uptime.sh` на втором VPS использует `curl --connect-to` для обоих доменов:
  так проверяется именно маршрут через Poland, а не прямой путь.
- Nginx `/etc/nginx/sites-available/tg-relay` направляет upstream через этот
  relay, сохраняя `Host`/SNI `api.cycleconnect.cc`; TLS-проверка включена с
  `proxy_ssl_verify_depth 3`.
- Старый `front` теперь проксирует только домены CycleConnect к новому TLS
  endpoint. Его app и Edge Functions остановлены, CycleConnect cron/watchdog
  отключены, данные оставлены; другие проекты и процессы не менялись.

Если потребуется откат relay-настроек, сначала восстановить резервные копии на
втором VPS, проверить `bash -n` и `nginx -t`, затем перезагрузить Nginx. Это
вернёт лишь маршрут проверки/доставки; после открытия новых записей на `cc`
возврат production требует обратной синхронизации DB и Storage по процедуре выше.

## Pending

- Завершить production startup, финальную переиндексацию и health checks.
- Дождаться применения всех четырёх DNS A-записей и проверить apex, `api`,
  `studio`, `www` с выключенным proxy.
- Слить workflow из прошедшей CI ветки в `main`, проверить первый deploy на новый
  VPS и сверить логи/функции.
- Проверить первый запуск timer-бэкапа и выполнить restore rehearsal; offsite
  backup не настроен.
- Реальный Google OAuth browser login не проверен. Не объявлять OAuth-путь
  подтверждённым до отдельной успешной проверки.
