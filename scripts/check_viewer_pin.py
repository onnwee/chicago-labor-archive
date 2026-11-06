"""Verify the reviewed frontend SDK receipt matches the installed dependency."""
import json
import re
from pathlib import Path

root = Path(__file__).resolve().parents[1]
receipt = json.loads((root / "deploy/viewer-release.json").read_text())
package = json.loads((root / "web/package.json").read_text())
lock = (root / "web/pnpm-lock.yaml").read_text()
assert receipt["package"] == "@subcult/archive-viewer"
assert package["dependencies"][receipt["package"]] == receipt["version"]
assert f"'@subcult/archive-viewer@{receipt['version']}'" in lock or f"/@subcult/archive-viewer@{receipt['version']}" in lock
assert re.fullmatch(r"[0-9a-f]{40}", receipt["source_revision"])
assert re.fullmatch(r"[0-9a-f]{64}", receipt["package_sha256"])
# Sources from marxists.org need source_provider support (viewer 0.4.6).
assert tuple(int(x) for x in receipt["version"].split(".")) >= (0, 4, 6)
print("Frontend SDK pin verified:", receipt["version"], receipt["source_revision"])
