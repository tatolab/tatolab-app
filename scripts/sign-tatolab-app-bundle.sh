#!/usr/bin/env bash
# Copyright (c) 2025 Jonathan Fontanez
# SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary
#
# Signs an assembled Tatolab.app inside-out with the hardened runtime: every Mach-O in
# Contents/Frameworks, then Contents/MacOS/tatolabd and Contents/MacOS/tatolab-cli, then the app.
# Ad-hoc ("-") signatures carry no hardened runtime.
#
# Usage: sign-tatolab-app-bundle.sh <Tatolab.app> <identity>
#   identity  "-" (ad-hoc), an "Apple Development: …" identity, or a "Developer ID Application: …"
#             identity; only Developer ID gets a secure timestamp, which notarization requires
set -euo pipefail

usage() { awk '/^# Usage:/{p=1} p&&/^#/{sub(/^# ?/,""); print; next} p{exit}' "$0" >&2; exit 2; }
[ $# -eq 2 ] || usage
app_bundle="$(cd "$1" && pwd)"
signing_identity="$2"
contents="$app_bundle/Contents"
repository_root="$(cd "$(dirname "$0")/.." && pwd)"
app_entitlements="$repository_root/src-tauri/macos/Tatolab.entitlements"
tatolabd_entitlements="$repository_root/packaging/entitlements/tatolabd.entitlements"

for required in MacOS/Tatolab MacOS/tatolabd MacOS/tatolab-cli Frameworks/tatolab-runtime Library/LaunchAgents/com.tatolab.tatolabd.plist; do
  [ -e "$contents/$required" ] || { echo "$app_bundle is not assembled: Contents/$required is missing" >&2; exit 1; }
done

case "$signing_identity" in
  "Developer ID Application"*) timestamp_argument="--timestamp" ;;
  *) timestamp_argument="--timestamp=none" ;;
esac
# Ad-hoc code has no Team ID, so the hardened runtime's library validation would refuse the
# Frameworks dylibs (dyld: "different Team IDs"); an ad-hoc build is never notarized, so it skips it.
if [ "$signing_identity" = "-" ]; then
  hardened_runtime_arguments=()
else
  hardened_runtime_arguments=(--options runtime)
fi
codesign_common_arguments=(--force ${hardened_runtime_arguments[@]+"${hardened_runtime_arguments[@]}"} "$timestamp_argument" --sign "$signing_identity")

is_mach_o() { [[ "$(file -b "$1")" == Mach-O* ]]; }

framework_mach_o_count=0
while IFS= read -r -d '' framework_file; do
  is_mach_o "$framework_file" || continue
  codesign "${codesign_common_arguments[@]}" "$framework_file"
  framework_mach_o_count=$((framework_mach_o_count + 1))
done < <(find "$contents/Frameworks" -type f -print0)

codesign "${codesign_common_arguments[@]}" --identifier com.tatolab.tatolabd \
  --entitlements "$tatolabd_entitlements" "$contents/MacOS/tatolabd"
codesign "${codesign_common_arguments[@]}" --identifier com.tatolab.tatolab-cli "$contents/MacOS/tatolab-cli"
codesign "${codesign_common_arguments[@]}" --entitlements "$app_entitlements" "$app_bundle"

codesign --verify --deep --strict "$app_bundle"
echo "signed $app_bundle with '$signing_identity': $framework_mach_o_count Mach-O in Frameworks, tatolabd, tatolab-cli, the app"
