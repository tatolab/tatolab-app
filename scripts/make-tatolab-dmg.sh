#!/usr/bin/env bash
# Builds the branded drag-to-Applications installer for a Developer ID-signed Tato Studio.app with
# dmgbuild (headless: no Finder scripting), then signs the image with the app's own Developer ID.
#
# Usage: make-tatolab-dmg.sh <Tato Studio.app> <out.dmg>
set -euo pipefail

usage() { awk '/^# Usage:/{p=1} p&&/^#/{sub(/^# ?/,""); print; next} p{exit}' "$0" >&2; exit 2; }
[ $# -eq 2 ] || usage
app_bundle="$(cd "$1" && pwd)"
output_dmg="$2"
repository_root="$(cd "$(dirname "$0")/.." && pwd)"
dmg_packaging_directory="$repository_root/packaging/dmg"
pinned_dmgbuild="dmgbuild==1.6.7"

[ "$(basename "$app_bundle")" = "Tato Studio.app" ] || { echo "expected a Tato Studio.app, got $app_bundle" >&2; exit 1; }
signing_identity="$(codesign -dvv "$app_bundle" 2>&1 | sed -n "/^Authority=/{s/^Authority=//p;q;}" || true)"
case "$signing_identity" in
  "Developer ID Application: "*) ;;
  *) echo "$app_bundle is not signed with a Developer ID Application identity: sign it with sign-tatolab-app-bundle.sh before building its installer" >&2; exit 1 ;;
esac
codesign --verify --strict "$app_bundle" || { echo "$app_bundle's signature does not verify: sign it again before building its installer" >&2; exit 1; }

mkdir -p "$(dirname "$output_dmg")"
output_dmg="$(cd "$(dirname "$output_dmg")" && pwd)/$(basename "$output_dmg")"
rm -f "$output_dmg"
uvx --from "$pinned_dmgbuild" dmgbuild \
  -s "$dmg_packaging_directory/dmgbuild-settings.py" \
  -D app="$app_bundle" \
  -D background="$dmg_packaging_directory/tatolab-dmg-background.png" \
  "Tato Studio" "$output_dmg"

codesign --force --timestamp --sign "$signing_identity" "$output_dmg"
codesign --verify --strict "$output_dmg"
echo "built $output_dmg ($(du -h "$output_dmg" | cut -f1)), signed with '$signing_identity'"
