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

No backup timer is installed yet. Take a logical dump before any core change and
copy it off Almaz:

```sh
B=/mnt/spektr/server/data/chicago-labor-archive/backups
docker exec chicago-labor-archive-db-1 pg_dump -U arkhiv -Fc arkhiv > $B/cla-$(date -u +%Y%m%dT%H%M%SZ).dump
# on Kvant
scp almaz:$B/cla-<stamp>.dump ~/.local/state/chicago-labor-archive/backups/
```

The originals have an independent copy in the acquisition on Kvant.

## Current deployment (2026-11-06)

| Item | Value |
| --- | --- |
| Core | 0.4.5, `archive-core@sha256:757618a645a46c1258d1c25e6fc267ca09e0d6c75eb70f4abbe333854ff7b7bc` (source `805f702`) |
| Frontend | `chicago-labor-archive-web:1bea3fa0083dbdc530cd0a0cb65381656725167b` |
| Catalog | 2,848 public documents from 12 titles; 40,809,188,015 bytes of originals, each verified against the manifest hash on Kvant and again by the importer on Almaz |
| Text | 376 documents have page text (17,965 pages); 2,472 scans (13,756 pages) have none and show "Document search is unavailable" until OCR runs |
| Recovery receipt | `independent_recovery_sha256` `146f615589f19ed03b9d71a0a499db754e8b7830d973803e2fea3d450b9e4348` |
| Database dump | `cla-20261106T200540Z.dump`, SHA-256 `2a47a69d…5d69e`, on Almaz and Kvant; restored into a disposable PostgreSQL 17 on Kvant with matching counts for items, public reviews, indexes, page text, snapshots, observations and review history |
| Edge | `cla.Caddyfile` imported after `arkhiv.Caddyfile`; previous main file at `Caddyfile.before-cla-20261106`. The running Caddy was reloaded from `sites/_main-Caddyfile.reload-20261106` because its single-file bind mount still points at the pre-edit inode; the next container restart reads the same content from the main path |

Rollback of the public site: remove the `import /etc/caddy/sites/cla.Caddyfile`
line (edit in place so the inode is kept, or reload from a copy as above), then
`docker compose -p chicago-labor-archive -f compose.yml stop web core`. The
database, originals and inputs stay in place.
