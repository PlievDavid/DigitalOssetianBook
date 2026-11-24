# Образ «Адам» на сервере: полная инструкция

Документ описывает реальную установку на сервере `servmd` (`adam@10.29.0.100`). Все команды выполняются в SSH-сессии пользователя `adam`.

## Параметры установки

| Что | Значение |
| --- | --- |
| Каталог проекта | `/home/adam/digitalbook` |
| Ветка | `deploy/dev-docker` |
| Docker | rootless, контекст `adam-rootless`, сокет `/run/user/1002/docker.sock` |
| Сайт | `http://10.29.0.100:4000` (внутри контейнера порт `8080`) |
| Секреты | `/home/adam/digitalbook/.env` и `/home/adam/admin-seed.json`, режим `600` |
| Тома | `digitalbook_pgdata`, `digitalbook_keys`, `digitalbook_media` |

Сервер не имеет выхода в GitHub и NuGet, поэтому образы доставляются файлами, а `git pull` внутри сервера не работает. Обновление описано ниже.

## Подключение и первичная проверка

```bash
ssh adam@10.29.0.100
docker context show                  # должно быть adam-rootless
docker info --format '{{.ServerVersion}}'
systemctl --user is-active docker     # active

cd /home/adam/digitalbook
git status --short --branch
docker compose ps
docker compose config --services
docker compose config --images
```

Если `docker` отвечает ошибкой `Cannot connect to the Docker daemon`, явно задайте сокет:

```bash
export DOCKER_HOST=unix:///run/user/1002/docker.sock
```

## Управление контейнерами

```bash
cd /home/adam/digitalbook

docker compose up -d              # поднять db и web
docker compose up -d db           # только PostgreSQL
docker compose up -d web          # только сайт
docker compose stop web           # остановить сайт, база продолжает работать
docker compose start web
docker compose restart web
docker compose ps                 # статус и пробросы портов

docker compose down               # удалить контейнеры и сеть; ТОМА сохраняются
```

**Никогда не выполняйте `docker compose down -v`**: флаг `-v` удалит тома вместе с базой, ключами входа и медиа.

Статус и логи:

```bash
docker compose logs --tail=200 --timestamps web
docker compose logs -f web
docker compose logs --tail=100 db
docker inspect --format '{{.State.Status}} {{.State.Health.Status}}' digitalbook-db-1
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4000/
```

## Команды приложения внутри образа

`ENTRYPOINT` образа уже содержит `dotnet IronLanguage.Web.dll`, поэтому после `web` передаётся только имя команды — без повторного `dotnet`:

```bash
docker compose run --rm web migrate
docker compose run --rm web dictionary-import
docker compose run --rm web admin-grant --email user@example.com
```

- `migrate` применяет ожидающие миграции и не меняет данные.
- `dictionary-import` тоже применяет миграции, добавляет книгу «Азар!», словарь и пересчитывает подсказки. Повторный запуск сохраняет ID неизменённых записей.
- `admin-grant --email` выдает роль `Admin` существующему аккаунту.

Все команды запускаются в том же окружении и с той же строкой подключения, что и основной сайт.

## Админы из файла

Файл `/home/adam/admin-seed.json` содержит массив:

```json
[
  {"email": "admin1@example.com", "password": "парольнекорее8символов"},
  {"email": "admin2@example.com", "password": "ещёодинпароль"}
]
```

Повторный запуск безопасен: отсутствующие аккаунты создаются, существующие получают роль `Admin`, но их пароли не меняются. Пароли не выводятся в лог.

Контейнер работает пользователем `app` (`uid 1654`). Если файл на хосте имеет режим `600` и принадлежит `adam`, прямой bind-монт не читается. Рабочий способ — скопировать файл во временный контейнер:

```bash
nano /home/adam/admin-seed.json

cd /home/adam/digitalbook
docker compose run -d --name adam-seed-runner --entrypoint sleep web infinity
docker cp /home/adam/admin-seed.json adam-seed-runner:/app/admin-seed.json
docker exec -u root adam-seed-runner chown app:app /app/admin-seed.json
docker exec -u root adam-seed-runner chmod 600 /app/admin-seed.json
docker exec adam-seed-runner dotnet IronLanguage.Web.dll admin-seed --file /app/admin-seed.json
docker rm -f adam-seed-runner
```

Если файл на хосте доступен контейнеру (например, режим `644`), достаточно одной команды:

```bash
docker compose run --rm -v /home/adam/admin-seed.json:/app/admin-seed.json:ro web admin-seed --file /app/admin-seed.json
```

## Работа с PostgreSQL

Внешний порт базы не публикуется; подключайтесь через контейнер:

```bash
docker compose exec -T db psql -U adam -d adam -c 'SELECT count(*) FROM "Users";'
docker compose exec -T db psql -U adam -d adam -Atc 'SELECT r."Name", count(*) FROM "AspNetUserRoles" ur JOIN "AspNetRoles" r ON r."Id" = ur."RoleId" GROUP BY 1;'
docker compose exec -T db psql -U adam -d adam -Atc 'SELECT count(*) FROM "DictionarySenses";'
docker compose exec -T db psql -U adam -d adam -Atc 'SELECT count(*) FROM "__EFMigrationsHistory";'
docker compose exec db sh
```

Другие контейнеры этой compose-сети обращаются к базе по хосту `db`, порт `5432`.

## Резервное копирование и восстановление

```bash
mkdir -p /home/adam/backups
cd /home/adam/digitalbook

# База
docker compose exec -T db pg_dump -U adam adam > /home/adam/backups/adam-$(date +%F).sql

# Ключи Data Protection и загруженные файлы
docker run --rm -u root --entrypoint tar \
  -v digitalbook_keys:/keys \
  -v digitalbook_media:/media \
  -v /home/adam/backups:/backup \
  digitalbook-web czf /backup/files-$(date +%F).tgz -C / keys media
```

Восстановление (остановите сайт, чтобы не было параллельных записей):

```bash
cd /home/adam/digitalbook
docker compose stop web

cat /home/adam/backups/adam-2026-11-24.sql | docker compose exec -T db psql -U adam -d adam

docker run --rm -u root --entrypoint tar \
  -v digitalbook_keys:/keys \
  -v digitalbook_media:/media \
  -v /home/adam/backups:/backup \
  digitalbook-web xzf /backup/files-2026-11-24.tgz -C /

docker compose start web
```

Имя файла замените на реальную дату. Проверьте архив перед восстановлением командой `tar tzf`.

## Обновление без интернета на сервере

Порядок выполняется на рабочей машине, где есть GitHub и NuGet, затем файлы переносятся на сервер.

На рабочей машине:

```powershell
$repo = 'C:\Users\ADMIN\Documents\DigitalBook\dev-docker'
$tag = 'a5f2175'

git -C $repo fetch origin dev
git -C $repo switch deploy/dev-docker
git -C $repo merge --ff-only origin/dev
git -C $repo bundle create C:\Users\ADMIN\AppData\Local\Temp\opencode\dev-docker.bundle deploy/dev-docker
docker build -t adam-dev-docker:$tag $repo
docker save -o C:\Users\ADMIN\AppData\Local\Temp\opencode\adam-dev-docker.tar adam-dev-docker:$tag
scp C:\Users\ADMIN\AppData\Local\Temp\opencode\dev-docker.bundle adam@10.29.0.100:/home/adam/
scp C:\Users\ADMIN\AppData\Local\Temp\opencode\adam-dev-docker.tar adam@10.29.0.100:/home/adam/
```

Если в `deploy/dev-docker` есть собственные коммиты, `merge --ff-only` не сработает — используйте обычный `merge` и разрешите конфликты до сборки.

На сервере:

```bash
cd /home/adam/digitalbook
git fetch /home/adam/dev-docker.bundle deploy/dev-docker
git merge --ff-only FETCH_HEAD
git status --short --branch

docker load -i /home/adam/adam-dev-docker.tar
docker tag adam-dev-docker:a5f2175 digitalbook-web

docker compose run --rm web migrate
docker compose up -d --force-recreate web
docker compose ps

rm -f /home/adam/dev-docker.bundle /home/adam/adam-dev-docker.tar
```

`--force-recreate` нужен, потому что compose не пересоздаёт контейнер при смене содержимого образа с тем же именем тега.

Откат образа:

```bash
docker images digitalbook-web --format '{{.ID}} {{.CreatedSince}}'
docker tag <идентификатор-предыдущего-образа> digitalbook-web
docker compose up -d --force-recreate web
```

Откат миграций EF Core не выполняется автоматически: перед откатом кода на предыдущую версию проверьте, совместима ли с ней текущая схема базы.

## Известные предупреждения

- `libgssapi_krb5.so.2: cannot open shared object file` — необязательная GSSAPI-библиотека Npgsql; подключение к PostgreSQL работает.
- `Failed to determine the https port for redirect` — внутри контейнера поднят только HTTP. TLS terminating следует настроить на прокси перед портом 4000.
- Предупреждение Data Protection при первом запуске связано с созданием ключа в томе `keys`.

## Безопасность

- `.env` и `admin-seed.json` не добавляйте в git; оба файла уже игнорируются или находятся вне репозитория.
- Не публикуйте пароли в чат, логи и вывод команд.
- Не запускайте `dictionary-import` как обычную проверку: он меняет данные.
- Резервные копии храните вне томов compose и включайте `pgdata`, `keys`, `media` в единый график копирования.
