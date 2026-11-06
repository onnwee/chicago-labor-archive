"""Verify this consumer's immutable core pin and its release receipt."""
import json
import re
from pathlib import Path

root = Path(__file__).resolve().parents[1]
r = json.loads((root / "deploy/core-release.json").read_text())
assert r["artifact_kind"] == "core" and "1" in r["api_versions"]
assert r["modules"]["catalog"] == "1" and r["modules"]["print"] == "1"
assert re.fullmatch(r"[0-9a-f]{40}", r["source_revision"])
assert re.fullmatch(re.escape(r["engine_repository"]) + r"@sha256:[0-9a-f]{64}", r["engine_digest"])
# Generic (non-Internet Archive) source identity arrived in core 0.4.5.
assert tuple(int(x) for x in r["version"].split(".")) >= (0, 4, 5)
assert (root / "deploy/archive-core.env").read_text() == "ARCHIVE_ENGINE_IMAGE=" + r["engine_digest"] + "\n"
print("Core pin verified:", r["version"], r["source_revision"])
