#!/usr/bin/env bash
# Signs an assembled Tatolab.app inside-out with the Developer ID, the hardened runtime and a secure
# timestamp. The runtime's helper, Contents/Helpers/Tatolab Runtime.app, first: every Mach-O in its
# Frameworks (the runtime's dylibs), its tatolab-cli, moq-relay and uv, then the helper itself, whose
# main executable is tatolabd, with the device and keychain access group entitlements and the
# provisioning profile that authorizes the latter; install.sh copies it out whole, so its own
# signature is what macOS checks the installed runtime against. Then the app: every loose Mach-O
# in Contents/Frameworks (Electron's libraries), each framework, each Electron helper app, then the
# app.
#
# Usage: sign-tatolab-app-bundle.sh <Tatolab.app> <identity> <runtime-provisioning-profile>
#   identity  the "Developer ID Application: … (TEAMID)" identity from Infisical, in a keychain
#             build-tatolab-app.sh imported it into; the script refuses any other
#   runtime-provisioning-profile  the Developer ID provisioning profile for com.tatolab.runtime,
#             embedded in the helper; the script refuses one for any other application identifier
set -euo pipefail

usage() { awk '/^# Usage:/{p=1} p&&/^#/{sub(/^# ?/,""); print; next} p{exit}' "$0" >&2; exit 2; }
[ $# -eq 3 ] || usage
signing_identity="$2"
runtime_provisioning_profile="$3"
case "$signing_identity" in
  "Developer ID Application: "*) ;;
  *) echo "'$signing_identity' is not a 'Developer ID Application: …' identity: Tatolab.app is signed with the Developer ID and nothing else" >&2; exit 1 ;;
esac
app_bundle="$(cd "$1" && pwd)"
contents="$app_bundle/Contents"
repository_root="$(cd "$(dirname "$0")/.." && pwd)"
app_entitlements="$repository_root/packaging/entitlements/tatolab-app.entitlements"
renderer_helper_entitlements="$repository_root/packaging/entitlements/tatolab-renderer-helper.entitlements"
tatolabd_entitlements="$repository_root/packaging/entitlements/tatolabd.entitlements"
runtime_application_identifier="$(/usr/libexec/PlistBuddy -c 'Print :com.apple.application-identifier' "$tatolabd_entitlements")"

helper_bundle="$contents/Helpers/Tatolab Runtime.app"
helper_contents="$helper_bundle/Contents"
for required in "MacOS/Spudnik Studio" "Frameworks/Electron Framework.framework" \
  Resources/install.sh "Helpers/Tatolab Runtime.app/Contents/Info.plist" "Helpers/Tatolab Runtime.app/Contents/MacOS/tatolabd" \
  "Helpers/Tatolab Runtime.app/Contents/MacOS/tatolab-cli" "Helpers/Tatolab Runtime.app/Contents/MacOS/moq-relay" \
  "Helpers/Tatolab Runtime.app/Contents/MacOS/uv" "Helpers/Tatolab Runtime.app/Contents/Frameworks/tatolab-runtime"; do
  [ -e "$contents/$required" ] || { echo "$app_bundle is not assembled: Contents/$required is missing" >&2; exit 1; }
done

[ -f "$runtime_provisioning_profile" ] || { echo "no runtime provisioning profile at '$runtime_provisioning_profile'" >&2; exit 1; }
runtime_provisioning_profile_plist="$(mktemp)"
security cms -D -i "$runtime_provisioning_profile" > "$runtime_provisioning_profile_plist" 2>/dev/null || true
profile_application_identifier="$(/usr/libexec/PlistBuddy -c 'Print :Entitlements:com.apple.application-identifier' \
  "$runtime_provisioning_profile_plist" 2>/dev/null || true)"
rm -f "$runtime_provisioning_profile_plist"
[ "$profile_application_identifier" = "$runtime_application_identifier" ] || {
  echo "the runtime provisioning profile is for '${profile_application_identifier:-no application identifier}', not $runtime_application_identifier" >&2
  exit 1
}
cp "$runtime_provisioning_profile" "$helper_contents/embedded.provisionprofile"

codesign_common_arguments=(--force --options runtime --timestamp --sign "$signing_identity")

is_mach_o() { [[ "$(file -b "$1")" == Mach-O* ]]; }

helper_mach_o_count=0
while IFS= read -r -d '' helper_framework_file; do
  is_mach_o "$helper_framework_file" || continue
  codesign "${codesign_common_arguments[@]}" "$helper_framework_file"
  helper_mach_o_count=$((helper_mach_o_count + 1))
done < <(find "$helper_contents/Frameworks" -type f -print0)
codesign "${codesign_common_arguments[@]}" --identifier com.tatolab.tatolab-cli "$helper_contents/MacOS/tatolab-cli"
codesign "${codesign_common_arguments[@]}" --identifier com.tatolab.moq-relay "$helper_contents/MacOS/moq-relay"
codesign "${codesign_common_arguments[@]}" --identifier com.tatolab.runtime-uv "$helper_contents/MacOS/uv"
codesign "${codesign_common_arguments[@]}" --entitlements "$tatolabd_entitlements" "$helper_bundle"
codesign --verify --deep --strict "$helper_bundle"

loose_framework_mach_o_count=0
while IFS= read -r -d '' framework_file; do
  is_mach_o "$framework_file" || continue
  # A helper app's own executable is signed with its helper below.
  case "$framework_file" in
    *.app/Contents/MacOS/*) continue ;;
  esac
  codesign "${codesign_common_arguments[@]}" "$framework_file"
  loose_framework_mach_o_count=$((loose_framework_mach_o_count + 1))
done < <(find "$contents/Frameworks" -type f -print0)

while IFS= read -r -d '' framework_bundle; do
  codesign "${codesign_common_arguments[@]}" "$framework_bundle"
done < <(find "$contents/Frameworks" -maxdepth 1 -name '*.framework' -print0)

helper_app_count=0
while IFS= read -r -d '' helper_app; do
  case "$helper_app" in
    *"(Renderer).app") codesign "${codesign_common_arguments[@]}" --entitlements "$renderer_helper_entitlements" "$helper_app" ;;
    *) codesign "${codesign_common_arguments[@]}" "$helper_app" ;;
  esac
  helper_app_count=$((helper_app_count + 1))
done < <(find "$contents/Frameworks" -maxdepth 1 -name '*.app' -print0)

codesign "${codesign_common_arguments[@]}" --entitlements "$app_entitlements" "$app_bundle"

codesign --verify --deep --strict "$app_bundle"
echo "signed $app_bundle with the Developer ID: Tatolab Runtime.app ($helper_mach_o_count Mach-O in its Frameworks, tatolab-cli, moq-relay, uv, tatolabd, the $runtime_application_identifier provisioning profile), $loose_framework_mach_o_count loose Mach-O in Frameworks, the frameworks, $helper_app_count Electron helper apps, the app"
