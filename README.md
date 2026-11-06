# Chicago Labor Archive

Periodicals and documents published in Chicago, its suburbs and the Calumet
region of northwest Indiana, served at https://cla.subcult.tv/.

This repository is a consumer of the [Arkhiv engine](https://git.subcult.tv/subculture-collective/arkhiv):

| Part | Where |
| --- | --- |
| Interface (Facsimile index design, PDF reader) | `web/` |
| Pinned core image and SDK receipts | `deploy/archive-core.env`, `deploy/core-release.json`, `deploy/viewer-release.json` |
| Deployment (database, core, frontend, operator) | `deploy/compose.yml`, `deploy/cla.Caddyfile`, `deploy/public-role.sql` |
| Import inputs from the MIA acquisition | `scripts/build_import.py`, `scripts/import.sh` |
| Operations and current state | `docs/operations.md` |

The first release publishes the 2,848 acquired PDFs of the twelve titles that
the engine's starter research register lists as Chicago imprint candidates.
Titles that need issue-by-issue location decisions (Social Democratic Herald,
Agitator/Syndicalist, Il Proletario, The Proletarian, Proletarian News, SDS) and
titles from outside the region (Appeal to Reason, The Toiler) are not published.

## Development

```sh
make verify
# Against a running core on 127.0.0.1:8080:
pnpm --dir web dev
```

The `@subcult` packages come from the Gitea npm registry. Anonymous read access
is enough; a stale token in `~/.npmrc` for that registry causes a 401.

Licensed GPL-3.0-only, like the engine and viewer it builds on.
