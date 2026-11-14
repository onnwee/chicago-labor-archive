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
# The deployable core wrapper must add labels only, on top of the image CI
# passes in from deploy/archive-core.env. CI also compares the built layers.
dockerfile = re.sub(r"\\\n", " ", (root / "deploy/core.Dockerfile").read_text())
steps = [line.split(None, 1) for line in dockerfile.splitlines() if line.strip() and not line.lstrip().startswith("#")]
assert {s[0].upper() for s in steps} <= {"ARG", "FROM", "LABEL"}, "core.Dockerfile may only use ARG, FROM and LABEL"
assert [s[1].strip() for s in steps if s[0].upper() == "FROM"] == ["${CORE_IMAGE}"], "core.Dockerfile must build FROM ${CORE_IMAGE}"
assert steps[0] == ["ARG", "CORE_IMAGE"], "CORE_IMAGE must be declared first, without a default"
print("Core pin verified:", r["version"], r["source_revision"])
