#!/usr/bin/env bash
# Signs an assembled Tatolab.app inside-out with the Developer ID, the hardened runtime and a secure
# timestamp. The runtime's helper, Contents/Helpers/Tatolab Runtime.app, first: every Mach-O in its
# Frameworks (the runtime's dylibs), its tatolab-cli, moq-relay and uv, then the helper itself, whose
# main executable is tatolabd, with the device entitlements; install.sh copies it out whole, so its
# own signature is what macOS checks the installed runtime against. Then the app: every loose Mach-O
# in Contents/Frameworks (the built-in Python, the app's Service Management addon, Electron's
# libraries), each framework, each Electron helper app, Contents/MacOS/uv, then the app. The built-in
# Python's interpreter keeps its signature when the app copies it out of the bundle, so a project's
# .venv runs code signed by the Developer ID.
#
# Usage: sign-tatolab-app-bundle.sh <Tatolab.app> <identity>
#   identity  the "Developer ID Application: … (TEAMID)" identity from Infisical, in a keychain
#             build-tatolab-app.sh imported it into; the script refuses any other
set -euo pipefail

usage() { awk '/^# Usage:/{p=1} p&&/^#/{sub(/^# ?/,""); print; next} p{exit}' "$0" >&2; exit 2; }
[ $# -eq 2 ] || usage
signing_identity="$2"
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
built_in_python_entitlements="$repository_root/packaging/entitlements/tatolab-python.entitlements"

helper_bundle="$contents/Helpers/Tatolab Runtime.app"
helper_contents="$helper_bundle/Contents"
for required in MacOS/Tatolab MacOS/uv Frameworks/tatolab-python Frameworks/tatolab-app-native "Frameworks/Electron Framework.framework" \
  Resources/install.sh "Helpers/Tatolab Runtime.app/Contents/Info.plist" "Helpers/Tatolab Runtime.app/Contents/MacOS/tatolabd" \
  "Helpers/Tatolab Runtime.app/Contents/MacOS/tatolab-cli" "Helpers/Tatolab Runtime.app/Contents/MacOS/moq-relay" \
  "Helpers/Tatolab Runtime.app/Contents/MacOS/uv" "Helpers/Tatolab Runtime.app/Contents/Frameworks/tatolab-runtime"; do
  [ -e "$contents/$required" ] || { echo "$app_bundle is not assembled: Contents/$required is missing" >&2; exit 1; }
done

codesign_common_arguments=(--force --options runtime --timestamp --sign "$signing_identity")

is_mach_o() { [[ "$(file -b "$1")" == Mach-O* ]]; }
is_a_mach_o_executable() { [[ "$(file -b "$1")" == Mach-O*executable* ]]; }

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
  if [[ "$framework_file" == "$contents/Frameworks/tatolab-python/"* ]] && is_a_mach_o_executable "$framework_file"; then
    codesign "${codesign_common_arguments[@]}" --entitlements "$built_in_python_entitlements" "$framework_file"
  else
    codesign "${codesign_common_arguments[@]}" "$framework_file"
  fi
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

codesign "${codesign_common_arguments[@]}" --identifier com.tatolab.uv "$contents/MacOS/uv"
codesign "${codesign_common_arguments[@]}" --entitlements "$app_entitlements" "$app_bundle"

codesign --verify --deep --strict "$app_bundle"
echo "signed $app_bundle with the Developer ID: Tatolab Runtime.app ($helper_mach_o_count Mach-O in its Frameworks, tatolab-cli, moq-relay, uv, tatolabd), $loose_framework_mach_o_count loose Mach-O in Frameworks, the frameworks, $helper_app_count Electron helper apps, uv, the app"
