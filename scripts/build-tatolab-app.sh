#!/usr/bin/env bash
# Copyright (c) 2025 Jonathan Fontanez
# SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary
#
# Builds Tatolab.app and its installer end to end: streamlib's runtime unit, the Electron app, the
# assembled bundle, signatures, the branded .dmg, optional notarization, and the bundle checks.
# Outputs build/Tatolab.app, build/Tatolab-<version>-arm64.dmg, and the update Squirrel.Mac takes:
# build/Tatolab-<version>-arm64-mac.zip and its feed manifest build/latest-mac.yml.
# The runtime is always streamlib's main, or --streamlib-ref, fetched by
# fetch-streamlib-for-the-app-build.sh into build/streamlib; nothing outside this repository is read.
# The app's version is the version of the tatolabd it bundles. When it finishes it checks
# streamlib's main again: a build of main fails if main moved on while it ran.
#
# Usage: build-tatolab-app.sh [--streamlib-ref REF] [--runtime-unit DIR] [--local-proof-test-root]
#                             [--sign-identity ID] [--notarize] [--app-update-feed-url URL]
#   --streamlib-ref REF      the streamlib tag or commit to bundle instead of main's head; a release
#                            passes the release tag it builds
#   --runtime-unit DIR       an already-built runtime unit, accepted only when its streamlib-commit
#                            names the commit the build resolved
#   --local-proof-test-root  every machine directory under TATOLAB_TEST_MACHINE_ROOT=/tmp/tatolab-proof
#                            and no administrator prompt; for proving on this Mac, never shipped
#   --sign-identity ID       codesign identity (default "-", ad-hoc)
#   --notarize               notarize and staple the app and the .dmg (needs a Developer ID
#                            identity and APPLE_API_KEY_PATH, APPLE_API_KEY_ID, APPLE_API_ISSUER)
#   --app-update-feed-url URL  the feed the app checks for updates (default: get.tatolab.com's);
#                            only with --local-proof-test-root, for proving an update locally
set -euo pipefail

usage() { awk '/^# Usage:/{p=1} p&&/^#/{sub(/^# ?/,""); print; next} p{exit}' "$0" >&2; exit 2; }
repository_root="$(cd "$(dirname "$0")/.." && pwd)"
scripts_directory="$repository_root/scripts"
streamlib_ref=main
prebuilt_runtime_unit=""
local_proof_test_root=false
signing_identity="-"
notarize=false
app_update_feed_url=""
while [ $# -gt 0 ]; do
  case "$1" in
    --streamlib-ref) [ $# -ge 2 ] || usage; streamlib_ref="$2"; shift ;;
    --runtime-unit) [ $# -ge 2 ] || usage; prebuilt_runtime_unit="$2"; shift ;;
    --local-proof-test-root) local_proof_test_root=true ;;
    --sign-identity) [ $# -ge 2 ] || usage; signing_identity="$2"; shift ;;
    --notarize) notarize=true ;;
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

build_directory="$repository_root/build"
mkdir -p "$build_directory"

echo "==> runtime unit (streamlib $streamlib_ref)"
fetched_streamlib="$build_directory/streamlib"
if [ -n "$prebuilt_runtime_unit" ]; then
  streamlib_commit="$("$scripts_directory/fetch-streamlib-for-the-app-build.sh" "$fetched_streamlib" --streamlib-ref "$streamlib_ref" --resolve-only)"
  runtime_unit_directory="$(cd "$prebuilt_runtime_unit" && pwd)"
else
  streamlib_commit="$("$scripts_directory/fetch-streamlib-for-the-app-build.sh" "$fetched_streamlib" --streamlib-ref "$streamlib_ref" | tail -1)"
  runtime_unit_directory="$("$scripts_directory/build-tatolab-runtime-unit.sh" "$fetched_streamlib" ${local_proof_arguments[@]+"${local_proof_arguments[@]}"})"
fi
unit_streamlib_commit="$(cat "$runtime_unit_directory/streamlib-commit" 2>/dev/null || true)"
[ "$unit_streamlib_commit" = "$streamlib_commit" ] || {
  echo "runtime unit $runtime_unit_directory was built from streamlib '${unit_streamlib_commit:-no recorded commit}', not $streamlib_commit ($streamlib_ref)" >&2
  exit 1
}
tatolabd_version_output="$("$runtime_unit_directory/bin/tatolabd" --version)"
app_version="${tatolabd_version_output##* }"
[[ "$app_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "the unit's tatolabd reports no X.Y.Z version: $tatolabd_version_output" >&2; exit 1; }
echo "    $runtime_unit_directory: streamlib $streamlib_commit, version $app_version"
assembled_app="$build_directory/Tatolab.app"
output_dmg="$build_directory/Tatolab-$app_version-arm64.dmg"
output_update_zip="$build_directory/Tatolab-$app_version-arm64-mac.zip"
output_update_manifest="$build_directory/latest-mac.yml"

echo "==> Electron app"
cd "$repository_root"
npm ci
npm run build -- ${local_proof_arguments[@]+"${local_proof_arguments[@]}"} ${app_update_feed_arguments[@]+"${app_update_feed_arguments[@]}"}
npm run build:service-management-addon -- --arch=arm64
built_service_management_addon="$repository_root/native/service_management_agent_services/build/Release/service_management_agent_services.node"
[ "$(lipo -archs "$built_service_management_addon")" = arm64 ] || { echo "$built_service_management_addon is not arm64-only" >&2; exit 1; }
packaged_app="$(node scripts/package_tatolab_electron_app.mjs darwin "$app_version" "$build_directory/electron-packaging" | tail -1)"
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
"$scripts_directory/assemble-tatolab-app-bundle.sh" "$assembled_app" "$runtime_unit_directory" --streamlib-commit "$streamlib_commit" ${local_proof_arguments[@]+"${local_proof_arguments[@]}"}

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

echo "==> streamlib main, now"
streamlib_main_check="$("$scripts_directory/fetch-streamlib-for-the-app-build.sh" "$fetched_streamlib" --streamlib-ref main --resolve-only --expect-commit "$streamlib_commit" 2>&1)" \
  && streamlib_main_check_status=0 || streamlib_main_check_status=$?
case "$streamlib_main_check_status" in
  0) echo "    streamlib main is still $streamlib_commit" ;;
  1)
    if [ "$streamlib_ref" = main ]; then
      echo "$streamlib_main_check: this build of main is already behind it; build again" >&2
      exit 1
    fi
    echo "    this build is streamlib $streamlib_ref, not main: $streamlib_main_check"
    ;;
  *) echo "    could not check streamlib main: $streamlib_main_check" ;;
esac

echo "built $assembled_app (streamlib $streamlib_commit, version $app_version)"
echo "built $output_dmg"
echo "built $output_update_zip"
echo "built $output_update_manifest"
