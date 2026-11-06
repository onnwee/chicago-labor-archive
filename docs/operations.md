# Operations

Public deployment to https://cla.subcult.tv/ was authorized by the owner on
November 6, 2026. This deployment is independent of the shared Arkhiv platform
on Almaz: it has its own database, credentials, media, core and frontend.

## Layout on Almaz

| What | Where |
| --- | --- |
| Compose project | `chicago-labor-archive`, root `/mnt/spektr/server/data/chicago-labor-archive` (mode 0700) |
| Configuration | `.env` beside `compose.yml` (image pins, media root, subnet `10.254.40.0/24`) |
| Credentials | `runtime/database-password`, `runtime/database-url` (owner), `runtime/public-database-url` (`cla_public`, read only) |
| Database | `runtime/database` (PostgreSQL 17) |
| Originals | `/mnt/arkhiv/chicago-labor-archive/media`, same relative paths as the MIA acquisition |
| Covers | `runtime/derivatives` (written by the operator, read only to the core) |
| Import inputs and markers | `inputs/` and `runtime/import-state/` |
| Edge | `/opt/server/management/config/caddy/sites/cla.Caddyfile`, imported by the management Caddyfile; the tunnel already sends `*.subcult.tv` to Caddy |

The public core runs with `ARKHIV_PUBLIC=1`, `VHNESS_COLLECTIONS=chicago-labor-archive`
and the `cla_public` role (`default_transaction_read_only=on`). Migrations and
imports use the `operator` profile with the owner role.

## Commands

Run from the deployment root as `onnwee`:

```sh
c="docker compose -p chicago-labor-archive -f compose.yml"
$c run --rm operator migrate
$c up -d db core web
$c run --rm --entrypoint sh operator /inputs/import.sh /inputs /state [LIST]
```

`import.sh` is resumable: every step leaves a marker in `runtime/import-state`.
A failed text index leaves `<item>.index-error` and is retried on the next run;
the document stays readable.

## Import inputs

`scripts/build_import.py --mia /mnt/data2/Archives/Marxists-Internet-Archive
--output DIR --verify-hashes` (on Kvant) writes the snapshot, catalog item and
public review for each selected PDF and `files.txt` for the media copy:

```sh
rsync -a --files-from=DIR/files.txt /mnt/data2/Archives/Marxists-Internet-Archive/ \
  almaz:/mnt/arkhiv/chicago-labor-archive/media/
```

Each review binds the exact snapshot, file hash and size, and
`independent_recovery_sha256`, the SHA-256 of `recovery.json`. That receipt lists
every original and its path in the acquisition on Kvant, which remains the
independent copy. Do not delete or rewrite either copy.

## Updating

- Frontend: merge to `main`; CI publishes
  `git.subcult.tv/subculture-collective/chicago-labor-archive-web:<sha>`. Set
  `CHICAGO_WEB_IMAGE` in `.env` and run `$c up -d web`.
- Core: update `deploy/core-release.json` and `deploy/archive-core.env` in a
  reviewed change, then on Almaz back up the database, run `operator migrate`
  with the new image and `$c up -d core`.
- Rollback: put the previous image in `.env` and `up -d` the service. Migrations
  are additive; a core rollback after a migration needs a compatible checkpoint.

## Backups

Not yet scheduled. Until a timer exists, take a logical dump before any core
change:

```sh
docker exec chicago-labor-archive-db-1 pg_dump -U arkhiv -Fc arkhiv > ~/backups/cla-$(date -u +%Y%m%dT%H%M%SZ).dump
```

The originals have an independent copy on Kvant. The database (reviews, indexes)
does not yet have an off-host copy.
