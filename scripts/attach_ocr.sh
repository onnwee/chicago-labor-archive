#!/bin/sh
# Attach OCR text to imported documents inside the operator container.
# Usage: attach_ocr.sh INPUT_DIR STATE_DIR (INPUT_DIR from build_ocr_attach.py).
# The OCR files must already be under $VHNESS_MEDIA/_derived/ocr. Each step
# leaves a marker, so reruns resume; a failed step is retried on the next run.
set -u
input=$1
state=$2
collection=chicago-labor-archive
notes="Attach derived OCR text to the original scan for search (cla.subcult.tv, 2026-11-06)"
mkdir -p "$state"
total=0 attached=0 failed=0
tab=$(printf '\t')
while IFS="$tab" read -r source item; do
  total=$((total + 1))
  if [ ! -e "$state/$item.ocr-source" ]; then
    vhness import-source --collection "$collection" --id "$source" --file "$input/sources/$source.ocr.json" || { echo "ocr source failed: $item" >&2; failed=$((failed + 1)); continue; }
    : > "$state/$item.ocr-source"
  fi
  if [ ! -e "$state/$item.ocr-rebind" ]; then
    vhness rebind-representation --approve-public --id "$item" --representation pdf --collection "$collection" --file "$input/rebind/$item.json" --notes "$notes" || { echo "rebind failed: $item" >&2; failed=$((failed + 1)); continue; }
    : > "$state/$item.ocr-rebind"
  fi
  if [ ! -e "$state/$item.ocr-index" ]; then
    vhness index-print --id "$item" --representation pdf --collection "$collection" || { echo "ocr index failed: $item" >&2; failed=$((failed + 1)); continue; }
    : > "$state/$item.ocr-index"
  fi
  attached=$((attached + 1))
  [ $((total % 100)) -eq 0 ] && echo "progress: $total read, $attached attached, $failed failed"
done < "$input/attach.tsv"
echo "done: $total read, $attached attached, $failed failed"
[ "$failed" -eq 0 ]
