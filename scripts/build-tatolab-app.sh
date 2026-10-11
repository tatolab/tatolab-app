#!/usr/bin/env bash
# Builds Tatolab.app and its installer end to end: streamlib's runtime unit, the Tauri app, the
# assembled bundle, signatures, the branded .dmg, optional notarization, and the bundle checks.
# Outputs build/Tatolab.app and build/Tatolab-<version>-arm64.dmg.
#
# Usage: build-tatolab-app.sh [--streamlib PATH] [--runtime-unit DIR] [--local-proof-test-root]
#                             [--sign-identity ID] [--notarize] [--app-version X.Y.Z]
#   --streamlib PATH         streamlib checkout to build the runtime unit in (default: ../streamlib)
#   --runtime-unit DIR       use an already-built runtime unit instead of building one
#   --local-proof-test-root  every machine directory under TATOLAB_TEST_MACHINE_ROOT=/tmp/tatolab-proof
#                            and no administrator prompt; for proving on this Mac, never shipped
#   --sign-identity ID       codesign identity (default "-", ad-hoc)
#   --notarize               notarize and staple the app and the .dmg (needs a Developer ID
#                            identity and APPLE_API_KEY_PATH, APPLE_API_KEY_ID, APPLE_API_ISSUER)
#   --app-version X.Y.Z      the bundle's version (default: tauri.conf.json's); a release passes
#                            the streamlib release it bundles
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
while [ $# -gt 0 ]; do
  case "$1" in
    --streamlib) [ $# -ge 2 ] || usage; streamlib_checkout="$2"; shift ;;
    --runtime-unit) [ $# -ge 2 ] || usage; prebuilt_runtime_unit="$2"; shift ;;
    --local-proof-test-root) local_proof_test_root=true ;;
    --sign-identity) [ $# -ge 2 ] || usage; signing_identity="$2"; shift ;;
    --notarize) notarize=true ;;
    --app-version) [ $# -ge 2 ] || usage; app_version="${2#v}"; shift ;;
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
tauri_feature_arguments=()
if $local_proof_test_root; then
  local_proof_arguments=(--local-proof-test-root)
  tauri_feature_arguments=(--features machine-directories-under-a-test-root)
fi

if [ -z "$app_version" ]; then
  app_version="$(plutil -extract version raw -o - "$repository_root/src-tauri/tauri.conf.json")"
fi
[[ "$app_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "not an X.Y.Z app version: $app_version" >&2; exit 1; }
build_directory="$repository_root/build"
assembled_app="$build_directory/Tatolab.app"
output_dmg="$build_directory/Tatolab-$app_version-arm64.dmg"
mkdir -p "$build_directory"

echo "==> runtime unit"
if [ -n "$prebuilt_runtime_unit" ]; then
  runtime_unit_directory="$(cd "$prebuilt_runtime_unit" && pwd)"
else
  runtime_unit_directory="$("$scripts_directory/build-tatolab-runtime-unit.sh" "$streamlib_checkout" ${local_proof_arguments[@]+"${local_proof_arguments[@]}"})"
fi
echo "    $runtime_unit_directory"

echo "==> Tauri app"
cd "$repository_root"
npm ci
export CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-$repository_root/src-tauri/target}"
# Signing and notarization happen after assembly; keep tauri from doing either on its own.
env -u APPLE_SIGNING_IDENTITY -u APPLE_CERTIFICATE -u APPLE_CERTIFICATE_PASSWORD \
  -u APPLE_API_KEY -u APPLE_API_ISSUER -u APPLE_API_KEY_PATH -u APPLE_ID -u APPLE_PASSWORD -u APPLE_TEAM_ID \
  npx tauri build --bundles app --config "{\"version\":\"$app_version\"}" ${tauri_feature_arguments[@]+"${tauri_feature_arguments[@]}"}
rm -rf "$assembled_app"
ditto "$CARGO_TARGET_DIR/release/bundle/macos/Tatolab.app" "$assembled_app"

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

echo "built $assembled_app"
echo "built $output_dmg"
