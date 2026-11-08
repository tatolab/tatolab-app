#!/usr/bin/env bash
# Builds Tatolab.app and its installer end to end: streamlib's runtime unit, the Electron app, the
# assembled bundle, signatures, the branded .dmg, optional notarization, and the bundle checks.
# Outputs build/Tato Studio.app, build/Tato-Studio-<version>-arm64.dmg, and the update Squirrel.Mac takes:
# build/Tato-Studio-<version>-arm64-mac.zip and its feed manifest build/latest-mac.yml.
# The runtime is always streamlib's main, or --streamlib-ref, fetched by
# fetch-streamlib-for-the-app-build.sh into build/streamlib; nothing outside this repository is read.
# The app's version is the version of the tatolabd it bundles. When it finishes it checks
# streamlib's main again: a build of main fails if main moved on while it ran.
# Every build is signed with the Developer ID from Infisical, imported into a temporary keychain
# that is deleted when the build ends; without it the build stops before doing anything.
#
# Usage: build-tatolab-app.sh [--streamlib-ref REF] [--runtime-unit DIR] [--local-proof-test-root]
#                             [--notarize] [--app-update-feed-url URL] [--release]
#   APPLE_CERTIFICATE           base64 of the Developer ID Application .p12 (Infisical)
#   APPLE_CERTIFICATE_PASSWORD  its password (Infisical)
#   APPLE_SIGNING_IDENTITY      "Developer ID Application: … (TEAMID)" (Infisical)
#   APPLE_RUNTIME_PROVISIONING_PROFILE  base64 of the Developer ID provisioning profile for
#                               com.tatolab.runtime, which authorizes the runtime's keychain access
#                               group (Infisical)
#                               locally: infisical run -- scripts/build-tatolab-app.sh …
#   --streamlib-ref REF      the streamlib tag or commit to bundle instead of main's head; a release
#                            passes the release tag it builds
#   --runtime-unit DIR       an already-built runtime unit, accepted only when its streamlib-commit
#                            names the commit the build resolved
#   --local-proof-test-root  every machine directory under TATOLAB_TEST_MACHINE_ROOT=/tmp/tatolab-proof
#                            and no administrator prompt; for proving on this Mac, never shipped
#   --notarize               notarize and staple the app and the .dmg, for a release (needs
#                            APPLE_API_KEY_PATH, APPLE_API_KEY_ID, APPLE_API_ISSUER)
#   --app-update-feed-url URL  the feed the app checks for updates (default: get.tatolab.com's);
#                            only with --local-proof-test-root, for proving an update locally
#   --release                a build the release workflow makes: About reads `-release` after the
#                            commit; every other build reads `-dev`
set -euo pipefail

usage() { awk '/^# Usage:/{p=1} p&&/^#/{sub(/^# ?/,""); print; next} p{exit}' "$0" >&2; exit 2; }
repository_root="$(cd "$(dirname "$0")/.." && pwd)"
scripts_directory="$repository_root/scripts"
streamlib_ref=main
prebuilt_runtime_unit=""
local_proof_test_root=false
notarize=false
app_update_feed_url=""
release_build=false
while [ $# -gt 0 ]; do
  case "$1" in
    --streamlib-ref) [ $# -ge 2 ] || usage; streamlib_ref="$2"; shift ;;
    --runtime-unit) [ $# -ge 2 ] || usage; prebuilt_runtime_unit="$2"; shift ;;
    --local-proof-test-root) local_proof_test_root=true ;;
    --notarize) notarize=true ;;
    --app-update-feed-url) [ $# -ge 2 ] || usage; app_update_feed_url="$2"; shift ;;
    --release) release_build=true ;;
    -h|--help) usage ;;
    *) usage ;;
  esac
  shift
done

if $notarize && $local_proof_test_root; then
  echo "--notarize and --local-proof-test-root together: a local-proof build is never distributed" >&2
  exit 1
fi
if $release_build && $local_proof_test_root; then
  echo "--release and --local-proof-test-root together: a local-proof build is a dev build" >&2
  exit 1
fi

missing_developer_id_variables=()
for developer_id_variable in APPLE_CERTIFICATE APPLE_CERTIFICATE_PASSWORD APPLE_SIGNING_IDENTITY APPLE_RUNTIME_PROVISIONING_PROFILE; do
  [ -n "${!developer_id_variable:-}" ] || missing_developer_id_variables+=("$developer_id_variable")
done
if [ ${#missing_developer_id_variables[@]} -gt 0 ]; then
  echo "no Developer ID to sign with: ${missing_developer_id_variables[*]} not set." >&2
  echo "Every Tato Studio.app is signed with the Developer ID from Infisical: run the build under" >&2
  echo "'infisical run -- scripts/build-tatolab-app.sh …' (with --env=<env> if the Apple secrets live in another environment)." >&2
  exit 1
fi
case "$APPLE_SIGNING_IDENTITY" in
  "Developer ID Application: "*) signing_identity="$APPLE_SIGNING_IDENTITY" ;;
  *) echo "APPLE_SIGNING_IDENTITY is not a 'Developer ID Application: …' identity: Tato Studio.app is signed with nothing else" >&2; exit 1 ;;
esac

echo "==> Developer ID"
developer_id_scratch_directory="$(mktemp -d)"
developer_id_keychain="$developer_id_scratch_directory/tatolab-developer-id.keychain-db"
keychain_search_list_before_the_build=()
while IFS= read -r listed_keychain; do
  listed_keychain="$(sed -e 's/^[[:space:]]*"//' -e 's/"[[:space:]]*$//' <<<"$listed_keychain")"
  [ -n "$listed_keychain" ] && keychain_search_list_before_the_build+=("$listed_keychain")
done < <(security list-keychains -d user)
remove_the_developer_id_keychain() {
  security list-keychains -d user -s ${keychain_search_list_before_the_build[@]+"${keychain_search_list_before_the_build[@]}"}
  security delete-keychain "$developer_id_keychain" 2>/dev/null || true
  rm -rf "$developer_id_scratch_directory"
}
trap remove_the_developer_id_keychain EXIT
trap 'exit 130' INT TERM HUP
developer_id_keychain_password="$(openssl rand -hex 16)"
security create-keychain -p "$developer_id_keychain_password" "$developer_id_keychain"
security set-keychain-settings -lut 21600 "$developer_id_keychain"
security unlock-keychain -p "$developer_id_keychain_password" "$developer_id_keychain"
(umask 077 && printf '%s' "$APPLE_CERTIFICATE" | base64 --decode > "$developer_id_scratch_directory/developer-id.p12")
security import "$developer_id_scratch_directory/developer-id.p12" -k "$developer_id_keychain" \
  -P "$APPLE_CERTIFICATE_PASSWORD" -T /usr/bin/codesign -T /usr/bin/security >/dev/null
rm -f "$developer_id_scratch_directory/developer-id.p12"
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$developer_id_keychain_password" "$developer_id_keychain" >/dev/null
security list-keychains -d user -s "$developer_id_keychain" ${keychain_search_list_before_the_build[@]+"${keychain_search_list_before_the_build[@]}"}
runtime_provisioning_profile="$developer_id_scratch_directory/tatolab-runtime.provisionprofile"
printf '%s' "$APPLE_RUNTIME_PROVISIONING_PROFILE" | base64 --decode > "$runtime_provisioning_profile"
security find-identity -v -p codesigning "$developer_id_keychain" | grep -qF "\"$signing_identity\"" || {
  echo "APPLE_CERTIFICATE holds no valid codesigning identity named by APPLE_SIGNING_IDENTITY" >&2
  exit 1
}
echo "    imported into a temporary keychain, deleted when the build ends"

local_proof_arguments=()
$local_proof_test_root && local_proof_arguments=(--local-proof-test-root)
app_update_feed_arguments=()
[ -n "$app_update_feed_url" ] && app_update_feed_arguments=(--app-update-feed-url "$app_update_feed_url")
release_build_arguments=()
$release_build && release_build_arguments=(--release)

build_directory="$repository_root/build"
mkdir -p "$build_directory"

echo "==> runtime unit (streamlib $streamlib_ref)"
fetched_streamlib="$build_directory/streamlib"
streamlib_commit="$("$scripts_directory/fetch-streamlib-for-the-app-build.sh" "$fetched_streamlib" --streamlib-ref "$streamlib_ref" | tail -1)"
if [ -n "$prebuilt_runtime_unit" ]; then
  runtime_unit_directory="$(cd "$prebuilt_runtime_unit" && pwd)"
else
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
assembled_app="$build_directory/Tato Studio.app"
output_dmg="$build_directory/Tato-Studio-$app_version-arm64.dmg"
output_update_zip="$build_directory/Tato-Studio-$app_version-arm64-mac.zip"
output_update_manifest="$build_directory/latest-mac.yml"

echo "==> Electron app"
cd "$repository_root"
npm ci
npm run build -- ${local_proof_arguments[@]+"${local_proof_arguments[@]}"} ${app_update_feed_arguments[@]+"${app_update_feed_arguments[@]}"} \
  ${release_build_arguments[@]+"${release_build_arguments[@]}"}
echo "==> viewer addon (streamlib $streamlib_commit)"
"$scripts_directory/build-tatolab-runtime-viewer-frame-import.sh" "$fetched_streamlib" --release
packaged_app="$(node scripts/package_tatolab_electron_app.mjs darwin "$app_version" "$build_directory/electron-packaging" | tail -1)"
rm -rf "$assembled_app"
ditto "$packaged_app" "$assembled_app"
info_plist="$assembled_app/Contents/Info.plist"
plutil -replace LSMinimumSystemVersion -string 26.0 "$info_plist"
# Electron's own Info.plist lets the main process load any http:// URL; the app loads none.
plutil -remove NSAppTransportSecurity "$info_plist"
# Electron's own Info.plist asks for Bluetooth and system audio capture in words that do not name
# Tato Studio; the app uses neither, so those strings go.
while IFS= read -r usage_description_key; do
  [ -n "$usage_description_key" ] || continue
  case "$(plutil -extract "$usage_description_key" raw -o - "$info_plist")" in
    *"Tato Studio"*) ;;
    *) plutil -remove "$usage_description_key" "$info_plist"; echo "    removed Electron's $usage_description_key" ;;
  esac
done < <(plutil -convert json -o - "$info_plist" | node -e 'process.stdout.write(Object.keys(JSON.parse(require("node:fs").readFileSync(0, "utf8"))).filter((key) => key.endsWith("UsageDescription")).join("\n") + "\n")')

echo "==> assemble"
"$scripts_directory/assemble-tatolab-app-bundle.sh" "$assembled_app" "$runtime_unit_directory" --streamlib-commit "$streamlib_commit" \
  ${local_proof_arguments[@]+"${local_proof_arguments[@]}"}

echo "==> sign (Developer ID)"
"$scripts_directory/sign-tatolab-app-bundle.sh" "$assembled_app" "$signing_identity" "$runtime_provisioning_profile"
if $notarize; then
  echo "==> notarize the app"
  "$scripts_directory/notarize-and-staple.sh" "$assembled_app"
fi

echo "==> installer"
"$scripts_directory/make-tatolab-dmg.sh" "$assembled_app" "$output_dmg"
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
