#!/usr/bin/env python3
"""Build engine inputs that attach finished OCR text to imported documents.

For every OCR receipt with status "ok" (from ocr_scans.py), writes:

  sources/<source id>.ocr.json   a new snapshot of the same marxists.org source
                                 that adds the OCR text as a derived file
  rebind/<item id>.json          rebind-representation input (representation,
                                 public review, preservation manifest)
  ocr/<sha256>.ocr.txt           the OCR text, copied for the media root
  attach.tsv                     `<source id>\t<item id>` in processing order
  ocr-recovery.json              receipt binding the original recovery receipt
                                 and every OCR text kept on Kvant

    build_ocr_attach.py --import DIR --ocr DIR --output DIR

The original PDF stays the reading edition; the OCR text only feeds search.
"""
import argparse
import hashlib
import json
import shutil
import sys
from pathlib import Path

MEDIA_PREFIX = "_derived/ocr"
NOTES = "Owner-authorized public reading of the original scan with derived OCR text for search (cla.subcult.tv, 2026-11-06)."


def canonical(value) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--import", dest="inputs", required=True, type=Path)
    parser.add_argument("--ocr", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--retained-root", default="/mnt/data2/Archives/chicago-labor-archive-derivatives/ocr")
    args = parser.parse_args()
    if args.output.exists():
        sys.exit(f"refusing to overwrite {args.output}")
    recovery_raw = (args.inputs / "recovery.json").read_bytes()
    recovery = json.loads(recovery_raw)
    by_item = {e["item"]: e for e in recovery["files"]}
    receipts = []
    for path in sorted(args.ocr.glob("*.json")):
        receipt = json.loads(path.read_text())
        if receipt.get("status") != "ok":
            continue
        text = args.ocr / receipt["output"]
        data = text.read_bytes()
        if hashlib.sha256(data).hexdigest() != receipt["output_sha256"] or receipt["input_sha256"] != by_item[receipt["item"]]["sha256"]:
            sys.exit(f"OCR receipt does not match its files: {path}")
        if not data.strip():
            continue  # nothing recognized; keep the scan as is
        receipts.append(receipt)
    for sub in ("sources", "rebind", "ocr"):
        (args.output / sub).mkdir(parents=True)
    ocr_recovery = {"originals_recovery_sha256": hashlib.sha256(recovery_raw).hexdigest(),
                    "retained_host": "kvant", "retained_root": args.retained_root, "files": []}
    plans = []
    for receipt in receipts:
        item_id = receipt["item"]
        item = json.loads((args.inputs / "items" / f"{item_id}.json").read_text())
        rep = item["representations"][0]
        source_id = rep["source_item_id"]
        snapshot = json.loads((args.inputs / "sources" / f"{source_id}.json").read_text())
        original = by_item[item_id]
        companion = Path(original["file"]).stem + ".ocr.txt"
        if companion == original["file"] or "/" in companion:
            sys.exit(f"unusable companion name for {item_id}")
        snapshot["files"].append({
            "name": companion, "size": str(receipt["output_bytes"]), "sha256": receipt["output_sha256"],
            "derived": {"from": original["file"], "from_sha256": original["sha256"], "image": receipt["image"],
                        "recipe": receipt["recipe"], "pages": receipt["pages_found"]},
        })
        raw = canonical(snapshot)
        (args.output / "sources" / f"{source_id}.ocr.json").write_bytes(raw)
        shutil.copyfile(args.ocr / receipt["output"], args.output / "ocr" / receipt["output"])
        ocr_recovery["files"].append({"item": item_id, "file": companion, "sha256": receipt["output_sha256"],
                                      "bytes": receipt["output_bytes"], "path": receipt["output"]})
        plans.append((source_id, item_id, rep, original, companion, receipt, hashlib.sha256(raw).hexdigest()))
    ocr_recovery_raw = canonical(ocr_recovery)
    (args.output / "ocr-recovery.json").write_bytes(ocr_recovery_raw)
    recovery_sha = hashlib.sha256(ocr_recovery_raw).hexdigest()
    for source_id, item_id, rep, original, companion, receipt, snapshot_sha in plans:
        representation = dict(rep, snapshot_sha256=snapshot_sha)
        representation["extension"] = {"print": dict(rep["extension"]["print"], companions=[{"file": companion, "role": "ocr"}])}
        rebind = {
            "representation": representation,
            "review": {"snapshot_sha256": snapshot_sha, "files": [original["file"], companion], "read": True,
                       "download": True, "public": True, "notes": NOTES},
            "preservation": {"snapshot_sha256": snapshot_sha, "independent_recovery_sha256": recovery_sha, "manifest": [
                {"file": original["file"], "bytes": original["bytes"], "sha256": original["sha256"], "path": original["path"]},
                {"file": companion, "bytes": receipt["output_bytes"], "sha256": receipt["output_sha256"], "path": f"{MEDIA_PREFIX}/{receipt['output']}"},
            ]},
        }
        (args.output / "rebind" / f"{item_id}.json").write_text(json.dumps(rebind, ensure_ascii=False, indent=1))
    (args.output / "attach.tsv").write_text("".join(f"{p[0]}\t{p[1]}\n" for p in plans))
    shutil.copyfile(Path(__file__).with_name("attach_ocr.sh"), args.output / "attach_ocr.sh")
    print(json.dumps({"attach": len(plans), "ocr_recovery_sha256": recovery_sha}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
