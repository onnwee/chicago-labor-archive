# Chicago Labor Archive

A record in print. Chicago Labor Archive is a public reading room for the labor
and radical press of Chicago, its suburbs and the Calumet region of northwest
Indiana. Readers can browse periodicals and documents by publication and date,
search their text and open each original PDF.

The archive is live at <https://cla.subcult.tv/> and the catalog is still
growing. No blanket reuse license is claimed for the documents.

This repository holds the site's interface, its deployment files and the
scripts that prepare imports, text recognition and topic labels. The catalog,
search and PDF delivery run on the Arkhiv archive engine, which is pulled in as
a pinned container image and the `@subcult/archive-viewer` package.

## Features

- Catalog table with paging and a jump-to-page control.
- Search by title and description, or by document text with matching passages.
- Filters for publication, original date range, and topic or tag.
- Document view with page count, edition details, accepted topic and tag labels
  and a PDF reader (PDF.js), plus a focus mode for reading.
- Share a document link, including a Bluesky compose link.
- Appearance settings: system, light or dark mode and a custom accent color.

## Collection scope

The first release publishes the acquired PDFs of twelve titles identified as
Chicago imprints. Titles that need issue-by-issue location decisions (Social
Democratic Herald, Agitator/Syndicalist, Il Proletario, The Proletarian,
Proletarian News, SDS) and titles from outside the region (Appeal to Reason,
The Toiler) are not published.

Source PDFs come from a Marxists Internet Archive acquisition. Scan-only PDFs
get a text layer from OCRmyPDF and Tesseract; the originals are never modified.

## Quick start

Requirements: Node.js 24, pnpm 10, Python 3, and Docker with Compose.

The `@subcult` packages are published to the SUBCULT npm registry set in
`web/.npmrc`. Anonymous read access is enough; a stale token for that registry
in `~/.npmrc` causes a 401.

```sh
git clone https://github.com/subculture-collective/chicago-labor-archive.git
cd chicago-labor-archive
pnpm --dir web install --frozen-lockfile
pnpm --dir web dev
```

The dev server runs on port 5173 and proxies `/api` to an archive engine at
`http://127.0.0.1:8080`. Set `VHNESS_API` to point it somewhere else.

Run every check:

```sh
make verify
```

`make verify` checks the pinned engine and viewer versions, compiles and tests
the Python scripts, syntax-checks the shell scripts, runs the frontend type
check, ESLint, Vitest and production build, and validates the Compose file.

## Configuration

- `web/public/brand/chicago-labor-archive/site.json`: title, headline,
  description, collection name, logo and colors.
- `labels/vocabulary.json`: the controlled vocabulary of topics, places,
  organizations, people and events.
- `labels/review.json`: which proposed labels are accepted or rejected.
- `deploy/archive-core.env`: the pinned engine image.

`deploy/compose.yml` reads these variables from a `.env` beside it:

- `ARCHIVE_ENGINE_IMAGE`: the engine image.
- `CHICAGO_WEB_IMAGE`: the frontend image.
- `MEDIA_ROOT`: directory holding the original PDFs, mounted read only.
- `ARCHIVE_SUBNET`: subnet for the internal archive network.
- `IMPORT_ROOT` (optional): import inputs for operator jobs.

Database credentials are read from files under `runtime/`, not from the
environment.

## Deploy

1. Build the frontend image from the repository root. Pass an npm config for
   the `@subcult` registry as the `npmrc` build secret, and point nginx at the
   engine's Compose service name:

   ```sh
   DOCKER_BUILDKIT=1 docker build -f deploy/frontend.Dockerfile \
     --build-arg CORE_UPSTREAM=core:8080 \
     --secret id=npmrc,src=web/.npmrc \
     -t chicago-labor-archive-web .
   ```

   The image serves the built site from nginx on port 8080 using
   `deploy/frontend-nginx.conf`. Without `CORE_UPSTREAM` it proxies `/api` to
   `api:8080`, which does not exist in `deploy/compose.yml`.
2. Copy `deploy/compose.yml` to the server, create the `.env` above and the
   database password and URL files under `runtime/`.
3. Start the database and run migrations with the operator profile:

   ```sh
   docker compose up -d db
   docker compose run --rm operator migrate
   ```

4. Apply `deploy/public-role.sql` as the database owner. It creates the
   read-only `cla_public` role that the public engine connects as.
5. Start the engine and frontend with `docker compose up -d core web`.
6. Put a reverse proxy in front of the `web` service. `deploy/cla.Caddyfile`
   is an example for Caddy.

The stack expects an external Docker network named `projects` for the proxy.
Imports, OCR and labels use the scripts in `scripts/` with the operator
profile: `build_import.py` and `import.sh` load documents, `ocr_scans.py` and
`attach_ocr.sh` add recognized text, `label_documents.py` and
`review_labels.py` propose and apply topic labels, and `backup_database.sh`
dumps the database.

## Project layout

| Path | Contents |
| --- | --- |
| `web/` | React and Vite interface |
| `deploy/` | Compose file, frontend Dockerfile, nginx and Caddy configuration, engine pins |
| `scripts/` | Import, OCR, labeling and backup scripts with their tests |
| `labels/` | Topic vocabulary and review policy |

## Contributing

- Bugs and feature requests: [GitHub issues](https://github.com/subculture-collective/chicago-labor-archive/issues).
- Questions and ideas: [GitHub Discussions](https://github.com/subculture-collective/chicago-labor-archive/discussions).
- Code: open a pull request on GitHub against `main`. CI runs `make verify` on
  every pull request.

## License

GNU General Public License, version 3 only (`GPL-3.0-only`), like the engine
and viewer it builds on. See [LICENSE](LICENSE). The bundled Barlow Condensed
and Public Sans fonts are under the SIL Open Font License; their license files
are in `web/public/brand/chicago-labor-archive/fonts/`.
