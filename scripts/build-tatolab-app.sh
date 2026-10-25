#!/usr/bin/env bash
# Copyright (c) 2025 Jonathan Fontanez
# SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary
#
# Builds Tatolab.app and its installer end to end: streamlib's runtime unit, the Electron app, the
# assembled bundle, signatures, the branded .dmg, optional notarization, and the bundle checks.
# Outputs build/Tatolab.app, build/Tatolab-<version>-arm64.dmg, and the update Squirrel.Mac takes:
# build/Tatolab-<version>-arm64-mac.zip and its feed manifest build/latest-mac.yml.
#
# Usage: build-tatolab-app.sh [--streamlib PATH] [--runtime-unit DIR] [--local-proof-test-root]
#                             [--sign-identity ID] [--notarize] [--app-version X.Y.Z]
#                             [--app-update-feed-url URL]
#   --streamlib PATH         streamlib checkout to build the runtime unit in (default: ../streamlib)
#   --runtime-unit DIR       use an already-built runtime unit instead of building one
#   --local-proof-test-root  every machine directory under TATOLAB_TEST_MACHINE_ROOT=/tmp/tatolab-proof
#                            and no administrator prompt; for proving on this Mac, never shipped
#   --sign-identity ID       codesign identity (default "-", ad-hoc)
#   --notarize               notarize and staple the app and the .dmg (needs a Developer ID
#                            identity and APPLE_API_KEY_PATH, APPLE_API_KEY_ID, APPLE_API_ISSUER)
#   --app-version X.Y.Z      the bundle's version (default: package.json's); a release passes
#                            the streamlib release it bundles
#   --app-update-feed-url URL  the feed the app checks for updates (default: get.tatolab.com's);
#                            only with --local-proof-test-root, for proving an update locally
set -euo pipefail

usage() { awk '/^# Usage:/{p=1} p&&/^#/{sub(/^# ?/,""); print; next} p{exit}' "$0" >&2; exit 2; }
repository_root="$(cd "$(dirname "$0")/.." && pwd)"
scripts_directory="$repository_root/scripts"
streamlib_checkout="$repository_root/../streamlib"
prebuilt_runtime_unit=""
local_proof_test_root=false
signing_identity="-"
notarize=false
app_version=""
app_update_feed_url=""
while [ $# -gt 0 ]; do
  case "$1" in
    --streamlib) [ $# -ge 2 ] || usage; streamlib_checkout="$2"; shift ;;
    --runtime-unit) [ $# -ge 2 ] || usage; prebuilt_runtime_unit="$2"; shift ;;
    --local-proof-test-root) local_proof_test_root=true ;;
    --sign-identity) [ $# -ge 2 ] || usage; signing_identity="$2"; shift ;;
    --notarize) notarize=true ;;
    --app-version) [ $# -ge 2 ] || usage; app_version="${2#v}"; shift ;;
    --app-update-feed-url) [ $# -ge 2 ] || usage; app_update_feed_url="$2"; shift ;;
    -h|--help) usage ;;
    *) usage ;;
  esac
  shift
done

if $notarize; then
  case "$signing_identity" in
    "Developer ID Application"*) ;;
    *) echo "--notarize needs a 'Developer ID Application' identity, not '$signing_identity'" >&2; exit 1 ;;
  esac
  if $local_proof_test_root; then
    echo "--notarize and --local-proof-test-root together: a local-proof build is never distributed" >&2
    exit 1
  fi
fi

local_proof_arguments=()
$local_proof_test_root && local_proof_arguments=(--local-proof-test-root)
app_update_feed_arguments=()
[ -n "$app_update_feed_url" ] && app_update_feed_arguments=(--app-update-feed-url "$app_update_feed_url")

if [ -z "$app_version" ]; then
  app_version="$(plutil -extract version raw -o - "$repository_root/package.json")"
fi
[[ "$app_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "not an X.Y.Z app version: $app_version" >&2; exit 1; }
build_directory="$repository_root/build"
assembled_app="$build_directory/Tatolab.app"
output_dmg="$build_directory/Tatolab-$app_version-arm64.dmg"
output_update_zip="$build_directory/Tatolab-$app_version-arm64-mac.zip"
output_update_manifest="$build_directory/latest-mac.yml"
mkdir -p "$build_directory"

echo "==> runtime unit"
if [ -n "$prebuilt_runtime_unit" ]; then
  runtime_unit_directory="$(cd "$prebuilt_runtime_unit" && pwd)"
else
  runtime_unit_directory="$("$scripts_directory/build-tatolab-runtime-unit.sh" "$streamlib_checkout" ${local_proof_arguments[@]+"${local_proof_arguments[@]}"})"
fi
echo "    $runtime_unit_directory"

echo "==> Electron app"
cd "$repository_root"
npm ci
npm run build
npm run build:electron
npm run build:service-management-addon -- --arch=arm64
built_service_management_addon="$repository_root/native/service_management_agent_services/build/Release/service_management_agent_services.node"
[ "$(lipo -archs "$built_service_management_addon")" = arm64 ] || { echo "$built_service_management_addon is not arm64-only" >&2; exit 1; }
packaged_app="$(node scripts/package_tatolab_electron_app.mjs darwin "$app_version" "$build_directory/electron-packaging" ${local_proof_arguments[@]+"${local_proof_arguments[@]}"} ${app_update_feed_arguments[@]+"${app_update_feed_arguments[@]}"} | tail -1)"
rm -rf "$assembled_app"
ditto "$packaged_app" "$assembled_app"
mkdir -p "$assembled_app/Contents/Frameworks/tatolab-app-native"
install -m 0755 "$built_service_management_addon" "$assembled_app/Contents/Frameworks/tatolab-app-native/service_management_agent_services.node"
info_plist="$assembled_app/Contents/Info.plist"
plutil -replace LSMinimumSystemVersion -string 15.0 "$info_plist"
# Electron's own Info.plist lets the main process load any http:// URL; the app loads none.
plutil -remove NSAppTransportSecurity "$info_plist"
# Electron's own Info.plist asks for Bluetooth and system audio capture in words that do not name
# Tatolab; the app uses neither, so those strings go.
while IFS= read -r usage_description_key; do
  [ -n "$usage_description_key" ] || continue
  case "$(plutil -extract "$usage_description_key" raw -o - "$info_plist")" in
    *Tatolab*) ;;
    *) plutil -remove "$usage_description_key" "$info_plist"; echo "    removed Electron's $usage_description_key" ;;
  esac
done < <(plutil -convert json -o - "$info_plist" | node -e 'process.stdout.write(Object.keys(JSON.parse(require("node:fs").readFileSync(0, "utf8"))).filter((key) => key.endsWith("UsageDescription")).join("\n") + "\n")')

echo "==> assemble"
"$scripts_directory/assemble-tatolab-app-bundle.sh" "$assembled_app" "$runtime_unit_directory" ${local_proof_arguments[@]+"${local_proof_arguments[@]}"}

echo "==> sign ($signing_identity)"
"$scripts_directory/sign-tatolab-app-bundle.sh" "$assembled_app" "$signing_identity"
if $notarize; then
  echo "==> notarize the app"
  "$scripts_directory/notarize-and-staple.sh" "$assembled_app"
fi

echo "==> installer"
TATOLAB_SIGNING_IDENTITY="$signing_identity" "$scripts_directory/make-tatolab-dmg.sh" "$assembled_app" "$output_dmg"
if $notarize; then
  echo "==> notarize the installer"
  "$scripts_directory/notarize-and-staple.sh" "$output_dmg"
fi

echo "==> verify"
verify_arguments=()
$local_proof_test_root || verify_arguments=(--shipping)
"$scripts_directory/verify-tatolab-app-bundle.sh" "$output_dmg" ${verify_arguments[@]+"${verify_arguments[@]}"}

echo "==> update"
# Squirrel.Mac checks the update's signature against the running app's, so the .zip holds the
# signed (and, for a release, stapled) bundle exactly as the .dmg does.
rm -f "$output_update_zip"
ditto -c -k --sequesterRsrc --keepParent "$assembled_app" "$output_update_zip"
node "$scripts_directory/write_tatolab_app_update_manifest.mjs" "$output_update_manifest" "$app_version" "$output_update_zip"

echo "built $assembled_app"
echo "built $output_dmg"
echo "built $output_update_zip"
echo "built $output_update_manifest"
