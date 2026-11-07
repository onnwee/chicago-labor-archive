#!/usr/bin/env python3
"""OCR the scan-only originals into per-page text companions.

For each listed item, runs a pinned OCRmyPDF/Tesseract image on the verified
original and writes `<sha256>.ocr.txt` (pages separated by form feeds) and a
receipt `<sha256>.json` beside it. Originals are mounted read only and never
modified. Existing results whose receipt matches the input hash are skipped, so
the job can be stopped and resumed.

    ocr_scans.py --import DIR --list no-text.tsv --mia ROOT --output DIR [--parallel 6]

Containers run inside the systemd slice `cla-ocr.slice` (see docs/operations.md),
which caps all OCR together at 14 GB of memory and six cores with the lowest CPU
and disk priority. On November 6, 2026 sixteen unbounded workers exhausted
Kvant's memory and forced a reboot; do not raise the limits without that slice.

`--list` holds `<item id>\t<page count>` lines from the deployed print index.
"""
import argparse
import concurrent.futures
import hashlib
import json
import os
import subprocess
import sys
import time
from pathlib import Path

IMAGE = "jbarlow83/ocrmypdf-alpine:v16.13.0"
SLICE = "cla-ocr.slice"
CONTAINER_MEMORY = "2g"
LANGUAGE = "eng"
RECIPE = f"ocrmypdf -l {LANGUAGE} --jobs 1 --skip-text --output-type none --sidecar"


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def run(entry: dict, mia: Path, output: Path, pages: int) -> tuple[str, str]:
    digest = entry["sha256"]
    text, receipt = output / f"{digest}.ocr.txt", output / f"{digest}.json"
    if receipt.exists():
        done = json.loads(receipt.read_text())
        if done.get("input_sha256") == digest and done.get("status") == "ok" and text.exists():
            return entry["item"], "skipped"
    source = mia / entry["path"]
    if source.stat().st_size != entry["bytes"] or sha256(source) != digest:
        return entry["item"], "input hash mismatch"
    partial = output / f".{digest}.ocr.txt.partial"
    name = f"cla-ocr-{digest[:16]}"
    # A container left by an interrupted run would write the same partial file.
    subprocess.run(["docker", "rm", "-f", name], capture_output=True)
    partial.unlink(missing_ok=True)
    started = time.time()
    proc = subprocess.run(
        ["docker", "run", "--rm", "--name", name, "--cgroup-parent", SLICE, "--network", "none", "-u", f"{os.getuid()}:{os.getgid()}",
         "--memory", CONTAINER_MEMORY, "--memory-swap", CONTAINER_MEMORY, "--cpus", "1",
         "-v", f"{source.parent}:/in:ro", "-v", f"{output}:/out", IMAGE,
         "-l", LANGUAGE, "--jobs", "1", "--skip-text", "--output-type", "none",
         "--sidecar", f"/out/{partial.name}", f"/in/{source.name}", "-"],
        capture_output=True, text=True, timeout=3 * 3600)
    if proc.returncode != 0 or not partial.exists():
        receipt.write_text(json.dumps({"item": entry["item"], "input_sha256": digest, "status": "failed",
                                       "exit": proc.returncode, "stderr": proc.stderr[-2000:]}, indent=1))
        partial.unlink(missing_ok=True)
        return entry["item"], "failed"
    data = partial.read_text(encoding="utf-8", errors="replace")
    found = data.count("\f") + 1 if data else 0
    os.replace(partial, text)
    receipt.write_text(json.dumps({
        "item": entry["item"], "file": entry["file"], "input_sha256": digest, "input_bytes": entry["bytes"],
        "output": text.name, "output_sha256": sha256(text), "output_bytes": text.stat().st_size,
        "pages_expected": pages, "pages_found": found, "words": len(data.split()),
        "image": IMAGE, "recipe": RECIPE, "seconds": round(time.time() - started, 1),
        "status": "ok"}, indent=1))
    return entry["item"], "ok"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--import", dest="inputs", required=True, type=Path)
    parser.add_argument("--list", required=True, type=Path)
    parser.add_argument("--mia", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--parallel", type=int, default=6)
    args = parser.parse_args()
    if subprocess.run(["systemctl", "show", SLICE, "-p", "MemoryMax", "--value"], capture_output=True, text=True).stdout.strip() in ("", "infinity"):
        sys.exit(f"{SLICE} has no memory limit; install it before running OCR")
    recovery = json.loads((args.inputs / "recovery.json").read_text())
    by_item = {e["item"]: e for e in recovery["files"]}
    work = []
    for line in args.list.read_text().splitlines():
        item, pages = line.split("\t")
        work.append((by_item[item], int(pages)))
    work.sort(key=lambda w: w[1])  # small documents first: early results, steady progress
    args.output.mkdir(parents=True, exist_ok=True)
    counts: dict[str, int] = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.parallel) as pool:
        futures = [pool.submit(run, entry, args.mia, args.output, pages) for entry, pages in work]
        for n, future in enumerate(concurrent.futures.as_completed(futures), 1):
            item, status = future.result()
            counts[status] = counts.get(status, 0) + 1
            if status not in ("ok", "skipped"):
                print(f"{item}: {status}", flush=True)
            if n % 50 == 0 or n == len(work):
                print(f"progress {n}/{len(work)} {json.dumps(counts, sort_keys=True)}", flush=True)
    return 0 if set(counts) <= {"ok", "skipped"} else 1


if __name__ == "__main__":
    sys.exit(main())
