#!/usr/bin/env bash
# One publish cycle for OCR text and labels, run on Kvant by cla-ocr-publish.timer.
#
# 1. Attach every finished OCR text to the live site (already attached documents
#    are skipped by the markers in Almaz's runtime/import-state).
# 2. Once cla-ocr.service has finished, export all indexed page text, run the
#    lexicon labeler, import its proposals (still private) and disable the timer.
#
# Requires the site checkout (for the scripts and vocabulary) and SSH to almaz.
set -euo pipefail
repo=${CLA_REPO:-$HOME/Work/Subcult/chicago-labor-archive}
root=/mnt/data2/Archives/chicago-labor-archive-derivatives
deploy=/mnt/spektr/server/data/chicago-labor-archive
media=/mnt/arkhiv/chicago-labor-archive/media/_derived/ocr
compose="docker compose -p chicago-labor-archive -f compose.yml"
stamp=$(date -u +%Y%m%dT%H%M%SZ)
batch=$root/attach/cycle-$stamp
umask 022

ocr_running=0
systemctl --user is-active --quiet cla-ocr.service && ocr_running=1

python3 "$repo/scripts/build_ocr_attach.py" --import "$root/inputs/import" --ocr "$root/ocr" --output "$batch"
rsync -a "$batch/ocr/" "almaz:$media/"
rsync -a --exclude ocr "$batch/" "almaz:$deploy/inputs/ocr-$stamp/"
ssh -n -o BatchMode=yes almaz "chmod -R a+rX $media $deploy/inputs/ocr-$stamp && cd $deploy && $compose run --rm -T --entrypoint sh operator /inputs/ocr-$stamp/attach_ocr.sh /inputs/ocr-$stamp /state" 2>&1 | grep -E '^(progress|done|.*failed:)' || true

# Keep only the two newest local batch directories; Almaz keeps the inputs as a record.
find "$root/attach" -mindepth 1 -maxdepth 1 -type d -name 'cycle-*' | sort | head -n -2 | xargs -r rm -rf

if [ "$ocr_running" -eq 1 ]; then
  echo "OCR still running; labels wait for the final cycle"
  exit 0
fi

labels=$root/labels/$stamp
mkdir -p "$labels"
ssh -n -o BatchMode=yes almaz "docker exec chicago-labor-archive-db-1 psql -U arkhiv -d arkhiv -c \"\\copy (SELECT t.item_id,i.creator,t.page,t.text FROM print_page_text t JOIN catalog_items i ON i.id=t.item_id WHERE t.representation_id='pdf' ORDER BY 1,3) TO STDOUT WITH CSV\"" > "$labels/pages.csv"
python3 "$repo/scripts/label_documents.py" --vocabulary "$repo/labels/vocabulary.json" --pages "$labels/pages.csv" --output "$labels/proposals.json" > "$labels/summary.json"
rsync -a "$repo/labels/vocabulary.json" "$labels/proposals.json" "$labels/summary.json" "almaz:$deploy/inputs/labels/$stamp/"
ssh -n -o BatchMode=yes almaz "chmod -R a+rX $deploy/inputs/labels/$stamp && cd $deploy && $compose run --rm -T operator import-labels --file /inputs/labels/$stamp/vocabulary.json && $compose run --rm -T operator propose-labels --file /inputs/labels/$stamp/proposals.json --notes 'lexicon-v1 over all indexed page text after OCR ($stamp)'"
echo "labels proposed: $(python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); print(d["proposals"], "proposals for", d["items_labeled"], "documents")' "$labels/summary.json")"
systemctl --user disable --now cla-ocr-publish.timer
echo "final cycle complete; timer disabled"
