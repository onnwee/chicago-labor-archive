#!/usr/bin/env python3
"""Build reviewed engine import inputs from the MIA acquisition manifest.

Reads the acquisition catalogue (never writes into the archive) and writes, for
each acquired PDF of a selected local publication:

  sources/<source id>.json   generic provider snapshot (marxists.org)
  items/<item id>.json       catalog item with one print representation
  reviews/<item id>.json     public read/download review and local manifest

plus `items.tsv` (import order), `files.txt` (rsync --files-from list relative
to the MIA root) and `recovery.json`, the receipt whose SHA-256 binds every
local manifest to the independently retained originals on Kvant.

Selection follows the starter register in the engine's plan 0011: only titles
whose source introductions identify a Chicago imprint are published. Titles that
need issue-level geographic decisions or lie outside the region are reported and
skipped, never silently included.
"""
import argparse
import csv
import hashlib
import json
import os
import re
import sys
from datetime import date
from pathlib import Path
from urllib.parse import urlparse

COLLECTION = "chicago-labor-archive"
PROVIDER = "marxists.org"

# Publication prefix in the manifest -> display name. Local publication
# candidates from docs/research/chicago-periodical-register.md.
LOCAL = {
    "American Socialist": "American Socialist",
    "Chicago Daily Socialist": "Chicago Daily Socialist",
    "Workers' Call/Chicago Socialist": "Workers' Call / Chicago Socialist",
    "Hope": "Hope",
    "Industrial Pioneer": "Industrial Pioneer",
    "International Socialist Review": "International Socialist Review",
    "New Majority": "New Majority",
    "Proletarec": "Proletarec",
    "Socialist Party of America Bulletin": "Socialist Party Official Bulletin / Party Builder",
    "Socialist World": "Socialist World",
    "Voice of Labor": "Voice of Labor",
    "Sojourner Truth": "Sojourner Truth Organization",
}
DEFERRED = {
    "Agitator": "issue-level geographic decision",
    "Proletario": "issue-level geographic decision",
    "The Proletarian": "issue-level geographic decision",
    "Proletarian News": "issue-level geographic decision",
    "Social Democratic Herald": "issue-level geographic decision",
    "Appeal to Reason": "outside the region (context only)",
    "Toiler": "outside the region (context only)",
    "sds": "issue-level geographic decision",
}
MONTHS = {m: i for i, m in enumerate(
    ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"], 1)}
ABBREVIATIONS = {"jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6, "jul": 7, "aug": 8, "sep": 9, "sept": 9, "oct": 10, "nov": 11, "dec": 12}
SAFE_ID = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,200}$")


def month(word: str) -> int | None:
    w = word.lower().rstrip(".")
    return MONTHS.get(w) or ABBREVIATIONS.get(w)


def parse_date(label: str, filename: str) -> tuple[str, str]:
    """Return (date, evidence). Exact days only when the label states one."""
    for m in re.finditer(r"([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(1[89]\d\d)", label):
        mo = month(m.group(1))
        if mo:
            try:
                return date(int(m.group(3)), mo, int(m.group(2))).isoformat(), "label day"
            except ValueError:
                pass
    for m in re.finditer(r"([A-Za-z]{3,9})\.?,?\s+(1[89]\d\d)", label):
        mo = month(m.group(1))
        if mo:
            return f"{m.group(2)}-{mo:02d}", "label month"
    # File names such as v14n01-jul-1913-ISR.pdf or v1n35-mar-13-1915-TAS.pdf.
    stem = filename.lower()
    for m in re.finditer(r"(?:^|[-_ (])([a-z]{3,9})[-_ ](\d{1,2})[-_ ,]+(1[89]\d\d)", stem):
        mo = month(m.group(1))
        if mo:
            try:
                return date(int(m.group(3)), mo, int(m.group(2))).isoformat(), "file name day"
            except ValueError:
                pass
    for m in re.finditer(r"(?:^|[-_ (])([a-z]{3,9})[-_ ]+(1[89]\d\d)", stem):
        mo = month(m.group(1))
        if mo:
            return f"{m.group(2)}-{mo:02d}", "file name month"
    # File names such as 091102-chicagodailysocialist-v04n008.pdf encode YYMMDD.
    m = re.match(r"^(\d{2})(\d{2})(\d{2})-", filename)
    if m:
        yy, mo, dd = (int(x) for x in m.groups())
        year = 1800 + yy if yy >= 90 else 1900 + yy
        if 1 <= mo <= 12:
            if dd:
                try:
                    return date(year, mo, dd).isoformat(), "file name day"
                except ValueError:
                    pass
            return f"{year}-{mo:02d}", "file name month"
    m = re.search(r"\b(1[89]\d\d)\b", label)
    if m:
        return m.group(1), "label year"
    return "", "unknown"


# Link text that names the link rather than the document.
BOILERPLATE = re.compile(r"^(pdf|here|click here|download|alt(ernate)? presentation|pdf of collection)$", re.I)


def title_for(display: str, label: str, filename: str) -> tuple[str, str]:
    label = label.strip().strip('"').strip()
    stem = re.sub(r"[-_]+", " ", Path(filename).stem).strip()
    if re.fullmatch(r"part [ivx]+", label, re.I):
        return f"{display}: {stem}", "file name"
    if label and not BOILERPLATE.match(label):
        return f"{display}, {label}", "label"
    return f"{display}: {stem}", "file name"


def publication(name: str) -> tuple[str | None, str | None]:
    for prefix, display in LOCAL.items():
        if name.startswith(prefix):
            return display, None
    for prefix, reason in DEFERRED.items():
        if name.startswith(prefix):
            return None, reason
    return None, "not in the starter register"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--mia", required=True, type=Path, help="MIA acquisition root (read only)")
    parser.add_argument("--output", required=True, type=Path, help="new output directory")
    parser.add_argument("--retained-host", default="kvant", help="host holding the independent originals")
    parser.add_argument("--verify-hashes", action="store_true", help="re-hash every selected original")
    args = parser.parse_args()
    if args.output.exists():
        sys.exit(f"refusing to overwrite {args.output}")
    rows = list(csv.DictReader(open(args.mia / "_catalog/manifest.csv", newline="")))
    selected, skipped, seen = [], {}, set()
    for r in rows:
        if r["group"] != "1" or r["status"] != "done" or not r["relative_path"].lower().endswith(".pdf"):
            continue
        display, reason = publication(r["publication"])
        if not display:
            skipped[r["publication"]] = (reason, skipped.get(r["publication"], (reason, 0))[1] + 1)
            continue
        if r["sha256"] in seen:
            continue  # the same original listed twice keeps one record
        seen.add(r["sha256"])
        source = urlparse(r["source_url"])
        if source.scheme != "https" or not (source.hostname == PROVIDER or source.hostname.endswith("." + PROVIDER)):
            sys.exit(f"unexpected source host: {r['source_url']}")
        selected.append((display, r))

    out = args.output
    for sub in ("sources", "items", "reviews"):
        (out / sub).mkdir(parents=True)
    recovery = {"collection": COLLECTION, "provider": PROVIDER, "retained_host": args.retained_host,
                "retained_root": str(args.mia), "files": []}
    order, files, dates = [], [], {"label day": 0, "label month": 0, "file name day": 0, "file name month": 0, "label year": 0, "unknown": 0}
    for display, r in selected:
        digest = r["sha256"]
        source_id, item_id = f"mia-{digest[:24]}", f"cla-{digest[:24]}"
        assert SAFE_ID.match(source_id) and SAFE_ID.match(item_id)
        filename = os.path.basename(r["relative_path"])
        if not filename or "/" in filename or "\\" in filename or "\x00" in filename:
            sys.exit(f"unsafe file name: {r['relative_path']}")
        path = args.mia / r["relative_path"]
        size = path.stat().st_size
        if size != int(r["bytes"]):
            sys.exit(f"size differs from manifest: {path}")
        if args.verify_hashes:
            h = hashlib.sha256()
            with open(path, "rb") as f:
                for chunk in iter(lambda: f.read(1 << 20), b""):
                    h.update(chunk)
            if h.hexdigest() != digest:
                sys.exit(f"hash differs from manifest: {path}")
        when, evidence = parse_date(r["label"], filename)
        dates[evidence] += 1
        title, title_source = title_for(display, r["label"], filename)
        snapshot = {
            "source": {"provider": PROVIDER, "id": source_id, "url": r["source_url"]},
            "metadata": {"publication": r["publication"], "label": r["label"], "kind": r["kind"],
                         "fetched_at": r["fetched_at"], "acquisition_path": r["relative_path"]},
            "files": [{"name": filename, "size": str(size), "sha256": digest, "url": r["source_url"]}],
        }
        raw = json.dumps(snapshot, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()
        snapshot_sha = hashlib.sha256(raw).hexdigest()
        (out / "sources" / f"{source_id}.json").write_bytes(raw)
        item = {
            "id": item_id, "title": title, "date": when, "creator": display,
            "description": "Scan from the Marxists Internet Archive. The original file is kept unchanged.",
            "editorial": {"publication_source": r["publication"], "title_source": title_source, "date_source": evidence,
                          "geography": "Chicago imprint candidate in the starter register; mastheads not yet verified issue by issue"},
            "collections": [COLLECTION],
            "representations": [{"id": "pdf", "media": "print", "source_item_id": source_id, "snapshot_sha256": snapshot_sha,
                                 "file": filename, "collections": [COLLECTION],
                                 "extension": {"print": {"document_id": item_id, "variant": "Original PDF", "pages": 0}}}],
        }
        (out / "items" / f"{item_id}.json").write_text(json.dumps(item, ensure_ascii=False, indent=1))
        order.append((source_id, item_id))
        files.append(r["relative_path"])
        recovery["files"].append({"item": item_id, "file": filename, "bytes": size, "sha256": digest, "path": r["relative_path"]})
    recovery_raw = json.dumps(recovery, sort_keys=True, separators=(",", ":")).encode()
    (out / "recovery.json").write_bytes(recovery_raw)
    recovery_sha = hashlib.sha256(recovery_raw).hexdigest()
    for (source_id, item_id), entry in zip(order, recovery["files"]):
        snapshot_sha = json.loads((out / "items" / f"{item_id}.json").read_text())["representations"][0]["snapshot_sha256"]
        review = {
            "review": {"snapshot_sha256": snapshot_sha, "files": [entry["file"]], "read": True, "download": True, "public": True,
                       "notes": "Owner-authorized public reading and download for cla.subcult.tv (2026-11-06); MIA scan of a Chicago imprint candidate."},
            "preservation": {"snapshot_sha256": snapshot_sha, "independent_recovery_sha256": recovery_sha,
                             "manifest": [{"file": entry["file"], "bytes": entry["bytes"], "sha256": entry["sha256"], "path": entry["path"]}]},
        }
        (out / "reviews" / f"{item_id}.json").write_text(json.dumps(review, ensure_ascii=False, indent=1))
    (out / "items.tsv").write_text("".join(f"{s}\t{i}\n" for s, i in order))
    (out / "files.txt").write_text("".join(f + "\n" for f in files))
    total = sum(e["bytes"] for e in recovery["files"])
    summary = {"selected": len(order), "bytes": total, "largest": max(e["bytes"] for e in recovery["files"]),
               "recovery_sha256": recovery_sha, "dates": dates,
               "skipped": {k: {"reason": v[0], "files": v[1]} for k, v in sorted(skipped.items())}}
    (out / "summary.json").write_text(json.dumps(summary, indent=1))
    print(json.dumps(summary, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
