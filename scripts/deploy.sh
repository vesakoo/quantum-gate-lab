#!/usr/bin/env bash
# Build and upload the site to the Linode Object Storage bucket (static website).
# Uses s3cmd with ~/.s3cfg (host_base eu-central-1.linodeobjects.com).
#
#   npm run deploy               build + upload
#   npm run deploy -- --dry-run  show what would be uploaded, change nothing
#   npm run deploy -- --prune    also delete files no longer in dist/ (old hashed assets)
#
# Site: http://quantum-gate-lab.website-eu-central-1.linodeobjects.com/
# Written for macOS's bash 3.2 (no empty arrays under set -u).
set -euo pipefail

BUCKET="${BUCKET:-s3://quantum-gate-lab}"
SITE="http://quantum-gate-lab.website-eu-central-1.linodeobjects.com/"
DRY=""
PRUNE=""
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY="--dry-run" ;;
    --prune) PRUNE="yes" ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

cd "$(dirname "$0")/.."
npm run build

sync() {
  # $DRY is intentionally unquoted: empty means no argument
  # shellcheck disable=SC2086
  s3cmd sync --acl-public --guess-mime-type --no-mime-magic --no-preserve $DRY "$@"
}

# 1. hashed assets first: cache for a year (file names change on every build)
sync --add-header="Cache-Control: public, max-age=31536000, immutable" dist/assets/ "$BUCKET/assets/"

# 2. everything else (index.html etc.) last and never cached, so it only points at assets already uploaded
sync --exclude 'assets/*' --add-header="Cache-Control: no-cache" dist/ "$BUCKET/"

# 3. optional cleanup of old assets, after the new index.html is live
if [ -n "$PRUNE" ]; then
  sync --delete-removed --exclude 'index.html' dist/ "$BUCKET/"
fi

if [ -n "$DRY" ]; then echo "Dry run only, nothing changed."; else echo "Deployed to $SITE"; fi
