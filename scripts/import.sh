#!/bin/sh
# Import reviewed Chicago Labor Archive inputs into an engine database.
# Runs inside an operator container built from the pinned core image, with
# DATABASE_URL_FILE (owner role), VHNESS_COLLECTIONS, VHNESS_MEDIA and a
# writable VHNESS_DERIVATIVES. Usage: import.sh INPUT_DIR STATE_DIR [LIST]
# LIST defaults to INPUT_DIR/items.tsv; disjoint lists can run in parallel.
#
# Each step leaves a marker in STATE_DIR, so a rerun resumes without
# duplicating source observations or catalog rows. A failed text index does not
# block reading; it is recorded and retried on the next run.
set -u
input=$1
state=$2
list=${3:-$input/items.tsv}
collection=chicago-labor-archive
notes="Owner-authorized Chicago Labor Archive import from the reviewed MIA manifest (2026-11-06)"
mkdir -p "$state"
total=0 imported=0 indexed=0 failed=0
tab=$(printf '\t')
while IFS="$tab" read -r source item; do
  total=$((total + 1))
  if [ ! -e "$state/$item.source" ]; then
    vhness import-source --collection "$collection" --id "$source" --file "$input/sources/$source.json" || { echo "source failed: $item" >&2; failed=$((failed + 1)); continue; }
    : > "$state/$item.source"
  fi
  if [ ! -e "$state/$item.catalog" ]; then
    vhness import-catalog --file "$input/items/$item.json" --notes "$notes" || { echo "catalog failed: $item" >&2; failed=$((failed + 1)); continue; }
    : > "$state/$item.catalog"
  fi
  if [ ! -e "$state/$item.review" ]; then
    vhness review-transport --approve-public --id "$item" --representation pdf --collection "$collection" --file "$input/reviews/$item.json" || { echo "review failed: $item" >&2; failed=$((failed + 1)); continue; }
    : > "$state/$item.review"
  fi
  imported=$((imported + 1))
  if [ ! -e "$state/$item.index" ]; then
    if vhness index-print --id "$item" --representation pdf --collection "$collection" 2> "$state/$item.index-error"; then
      : > "$state/$item.index"; rm -f "$state/$item.index-error"
    else
      echo "index failed: $item" >&2
      continue
    fi
  fi
  indexed=$((indexed + 1))
  [ $((total % 100)) -eq 0 ] && echo "progress: $total read, $imported imported, $indexed indexed, $failed failed"
done < "$list"
echo "done: $total read, $imported imported, $indexed indexed, $failed failed"
[ "$failed" -eq 0 ]
