#!/usr/bin/env bash
# Copyright (c) 2025 Jonathan Fontanez
# SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary
#
# Builds the branded drag-to-Applications installer for a signed Tatolab.app with dmgbuild
# (headless: no Finder scripting), then signs the image with the app's identity.
#
# Usage: make-tatolab-dmg.sh <Tatolab.app> <out.dmg>
#   TATOLAB_SIGNING_IDENTITY  identity for the image signature (default: the app's own authority,
#                             ad-hoc when the app is ad-hoc signed)
set -euo pipefail

usage() { awk '/^# Usage:/{p=1} p&&/^#/{sub(/^# ?/,""); print; next} p{exit}' "$0" >&2; exit 2; }
[ $# -eq 2 ] || usage
app_bundle="$(cd "$1" && pwd)"
output_dmg="$2"
repository_root="$(cd "$(dirname "$0")/.." && pwd)"
dmg_packaging_directory="$repository_root/packaging/dmg"
pinned_dmgbuild="dmgbuild==1.6.7"

[ "$(basename "$app_bundle")" = "Tatolab.app" ] || { echo "expected a Tatolab.app, got $app_bundle" >&2; exit 1; }
codesign --verify --strict "$app_bundle" || { echo "sign $app_bundle before building its installer" >&2; exit 1; }

signing_identity="${TATOLAB_SIGNING_IDENTITY:-}"
if [ -z "$signing_identity" ]; then
  app_signature_description="$(codesign -dvv "$app_bundle" 2>&1)"
  signing_identity="$(sed -n "/^Authority=/{s/^Authority=//p;q;}" <<<"$app_signature_description")"
  [ -n "$signing_identity" ] || signing_identity="-"
fi

mkdir -p "$(dirname "$output_dmg")"
output_dmg="$(cd "$(dirname "$output_dmg")" && pwd)/$(basename "$output_dmg")"
rm -f "$output_dmg"
uvx --from "$pinned_dmgbuild" dmgbuild \
  -s "$dmg_packaging_directory/dmgbuild-settings.py" \
  -D app="$app_bundle" \
  -D background="$dmg_packaging_directory/tatolab-dmg-background.png" \
  "Tatolab" "$output_dmg"

case "$signing_identity" in
  "Developer ID Application"*) timestamp_argument="--timestamp" ;;
  *) timestamp_argument="--timestamp=none" ;;
esac
codesign --force "$timestamp_argument" --sign "$signing_identity" "$output_dmg"
codesign --verify --strict "$output_dmg"
echo "built $output_dmg ($(du -h "$output_dmg" | cut -f1)), signed with '$signing_identity'"
