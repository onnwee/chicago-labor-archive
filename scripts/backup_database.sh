#!/usr/bin/env bash
# Nightly Chicago Labor Archive database backup, run on Kvant.
# Dumps the Almaz database into the deployment's backups directory, copies the
# dump to Kvant, verifies the copy's SHA-256, and keeps the newest 14 dumps on
# each side. Originals are not copied here: the acquisition on Kvant and the
# OCR texts under /mnt/data2/Archives/chicago-labor-archive-derivatives are the
# independent copies.
set -euo pipefail
remote_dir=/mnt/spektr/server/data/chicago-labor-archive/backups
local_dir=${CLA_BACKUP_DIR:-$HOME/.local/state/chicago-labor-archive/backups}
keep=14
stamp=$(date -u +%Y%m%dT%H%M%SZ)
name="cla-$stamp.dump"
umask 077
mkdir -p "$local_dir"
remote_sha=$(ssh -o BatchMode=yes almaz "set -euo pipefail; umask 077; docker exec chicago-labor-archive-db-1 pg_dump -U arkhiv -Fc arkhiv > $remote_dir/$name.partial && mv $remote_dir/$name.partial $remote_dir/$name && sha256sum $remote_dir/$name | cut -d' ' -f1; ls -1t $remote_dir/cla-*.dump | tail -n +$((keep + 1)) | xargs -r rm --")
scp -q -o BatchMode=yes "almaz:$remote_dir/$name" "$local_dir/$name.partial"
local_sha=$(sha256sum "$local_dir/$name.partial" | cut -d' ' -f1)
if [ "$local_sha" != "$remote_sha" ]; then
  echo "backup copy hash mismatch for $name" >&2
  rm -f "$local_dir/$name.partial"
  exit 1
fi
mv "$local_dir/$name.partial" "$local_dir/$name"
# shellcheck disable=SC2012 # names are generated above
ls -1t "$local_dir"/cla-*.dump | tail -n +$((keep + 1)) | xargs -r rm --
printf '{"dump":"%s","sha256":"%s","bytes":%s,"finished_at":"%s"}\n' "$name" "$local_sha" "$(stat -c %s "$local_dir/$name")" "$(date -u +%FT%TZ)" > "$local_dir/last-success.json"
echo "backup ok: $name $local_sha"
