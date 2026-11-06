# Chicago Labor Archive

Consumer of the Arkhiv engine (`subculture-collective/arkhiv`) for periodicals and
documents published in Chicago, its suburbs and the Calumet region. The engine's
plan 0011 and research register are the planning record; this repository owns
the interface, import inputs and deployment configuration.

- Frontend in `web/` (React, `@subcult/archive-viewer` pinned in
  `deploy/viewer-release.json`). The core is pinned by digest in
  `deploy/archive-core.env` and `deploy/core-release.json`. Upgrade either only
  through a reviewed change that keeps `make verify` green.
- Required gate: `make verify`.
- Import inputs come from `scripts/build_import.py`. It reads the MIA acquisition
  catalogue and never writes into it. Only register-listed Chicago imprint
  candidates are published; issue-level and outside-region titles stay out until
  an editor records the decision.
- Runtime data, credentials, media and generated inputs stay outside Git.
  Originals are never modified or deleted; the independent copy stays on Kvant.
- Public deployment to cla.subcult.tv was authorized by the owner on 2026-11-06.
  See `docs/operations.md` before changing the running deployment.
