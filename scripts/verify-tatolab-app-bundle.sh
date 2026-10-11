#!/usr/bin/env bash
# Checks a signed Tatolab.app, or the Tatolab.app inside a .dmg, against the bundle contract:
# a strict deep signature, the hardened runtime on every Mach-O unless ad-hoc, no Mach-O outside
# Contents/MacOS and Contents/Frameworks, every symlink resolving inside the bundle, the launch
# agent plist, the Info.plist usage strings, the lend's CPython 3.10-3.14 bytecode, and the
# entitlements of tatolabd and the app.
# A stapled target must also pass Gatekeeper.
#
# Usage: verify-tatolab-app-bundle.sh <Tatolab.app|file.dmg> [--shipping]
#   --shipping  also refuse a local-proof (test machine root) build
# `check && pass … || fail …` is safe here: pass only prints, so it never falls through to fail.
# shellcheck disable=SC2015
set -euo pipefail

usage() { awk '/^# Usage:/{p=1} p&&/^#/{sub(/^# ?/,""); print; next} p{exit}' "$0" >&2; exit 2; }
[ $# -ge 1 ] || usage
verification_target="${1%/}"
shift
shipping=false
while [ $# -gt 0 ]; do
  case "$1" in
    --shipping) shipping=true ;;
    *) usage ;;
  esac
  shift
done
[ -e "$verification_target" ] || { echo "no such file: $verification_target" >&2; exit 1; }

failure_count=0
pass() { printf '  ok    %s\n' "$1"; }
fail() { printf '  FAIL  %s\n' "$1" >&2; failure_count=$((failure_count + 1)); }
is_mach_o() { [[ "$(file -b "$1")" == Mach-O* ]]; }

stapled_and_accepted_by_gatekeeper() {
  local stapled_target="$1" assessment_type="$2"
  if xcrun stapler validate -q "$stapled_target" >/dev/null 2>&1; then
    if [ "$assessment_type" = open ]; then
      spctl --assess --type open --context context:primary-signature -v "$stapled_target" 2>&1 \
        && pass "Gatekeeper accepts the stapled $(basename "$stapled_target")" \
        || fail "Gatekeeper refuses the stapled $(basename "$stapled_target")"
    else
      spctl --assess --type execute -v "$stapled_target" 2>&1 \
        && pass "Gatekeeper accepts the stapled $(basename "$stapled_target")" \
        || fail "Gatekeeper refuses the stapled $(basename "$stapled_target")"
    fi
  else
    pass "$(basename "$stapled_target") carries no notarization ticket: Gatekeeper not assessed"
  fi
}

required_usage_description_keys=(
  NSCameraUsageDescription NSMicrophoneUsageDescription NSLocalNetworkUsageDescription
  NSDocumentsFolderUsageDescription NSDesktopFolderUsageDescription NSDownloadsFolderUsageDescription
)
required_device_entitlements=(com.apple.security.device.camera com.apple.security.device.audio-input)
required_lend_bytecode_cache_tags=(cpython-310 cpython-311 cpython-312 cpython-313 cpython-314)

verify_app_bundle() {
  local app_bundle contents canonical_app_bundle
  app_bundle="$(cd "$1" && pwd)"
  canonical_app_bundle="$(cd "$app_bundle" && pwd -P)"
  contents="$app_bundle/Contents"
  echo "verifying $app_bundle"

  codesign --verify --deep --strict --verbose=2 "$app_bundle" 2>&1 | sed 's/^/        /' \
    && pass "codesign --verify --deep --strict" || fail "codesign --verify --deep --strict"

  local info_plist="$contents/Info.plist"
  [ "$(plutil -extract CFBundleIdentifier raw -o - "$info_plist" 2>/dev/null)" = com.tatolab.tatolab ] \
    && pass "CFBundleIdentifier is com.tatolab.tatolab" || fail "CFBundleIdentifier is not com.tatolab.tatolab"
  [ "$(plutil -extract LSUIElement raw -o - "$info_plist" 2>/dev/null)" = true ] \
    && pass "LSUIElement is true" || fail "LSUIElement is not true"
  local bundle_executable
  bundle_executable="$(plutil -extract CFBundleExecutable raw -o - "$info_plist" 2>/dev/null || true)"
  [ -n "$bundle_executable" ] && [ -x "$contents/MacOS/$bundle_executable" ] && is_mach_o "$contents/MacOS/$bundle_executable" \
    && pass "the app executable Contents/MacOS/$bundle_executable is present" || fail "the app executable '$bundle_executable' is missing"
  local bundled_executable
  for bundled_executable in tatolabd tatolab-cli; do
    [ -x "$contents/MacOS/$bundled_executable" ] && pass "Contents/MacOS/$bundled_executable is present" \
      || fail "Contents/MacOS/$bundled_executable is missing"
  done
  local usage_key usage_description
  for usage_key in "${required_usage_description_keys[@]}"; do
    usage_description="$(plutil -extract "$usage_key" raw -o - "$info_plist" 2>/dev/null || true)"
    case "$usage_description" in
      *Tatolab*) pass "$usage_key names Tatolab" ;;
      "") fail "Info.plist has no $usage_key" ;;
      *) fail "$usage_key does not name Tatolab: $usage_description" ;;
    esac
  done

  local mach_o_outside_code_directories=0 unsigned_or_unhardened=0 bundle_file path_in_contents code_signature_description
  local first_team_identifier="" bundle_file_team_identifier mixed_team_identifiers=0
  while IFS= read -r -d '' bundle_file; do
    is_mach_o "$bundle_file" || continue
    path_in_contents="${bundle_file#"$contents/"}"
    case "$path_in_contents" in
      MacOS/*|Frameworks/*) ;;
      *) fail "Mach-O outside MacOS/ and Frameworks/: Contents/$path_in_contents"
         mach_o_outside_code_directories=$((mach_o_outside_code_directories + 1)) ;;
    esac
    code_signature_description="$(codesign -dv "$bundle_file" 2>&1 || true)"
    bundle_file_team_identifier="$(sed -n 's/^TeamIdentifier=//p' <<<"$code_signature_description")"
    if [ -z "$first_team_identifier" ]; then
      first_team_identifier="$bundle_file_team_identifier"
    elif [ "$bundle_file_team_identifier" != "$first_team_identifier" ]; then
      fail "Contents/$path_in_contents is signed by team '$bundle_file_team_identifier', not '$first_team_identifier': library validation refuses mixed teams"
      mixed_team_identifiers=$((mixed_team_identifiers + 1))
    fi
    if grep -q 'flags=.*adhoc' <<<"$code_signature_description"; then
      if grep -q 'flags=.*runtime' <<<"$code_signature_description"; then
        fail "ad-hoc signature with the hardened runtime on Contents/$path_in_contents: library validation refuses it"
        unsigned_or_unhardened=$((unsigned_or_unhardened + 1))
      fi
    elif ! grep -q 'flags=.*runtime' <<<"$code_signature_description"; then
      fail "no hardened runtime signature on Contents/$path_in_contents"
      unsigned_or_unhardened=$((unsigned_or_unhardened + 1))
    fi
  done < <(find "$contents" -type f -print0)
  [ "$mach_o_outside_code_directories" -eq 0 ] && pass "every Mach-O sits in Contents/MacOS or Contents/Frameworks"
  [ "$unsigned_or_unhardened" -eq 0 ] && pass "every Mach-O is signed (hardened runtime unless ad-hoc)"
  [ "$mixed_team_identifiers" -eq 0 ] && pass "every Mach-O is signed by one team ($first_team_identifier)"

  local escaping_symlinks=0 bundle_symlink resolved_symlink
  while IFS= read -r -d '' bundle_symlink; do
    resolved_symlink="$(cd "$(dirname "$bundle_symlink")" && realpath "$(readlink "$bundle_symlink")" 2>/dev/null || true)"
    case "$resolved_symlink" in
      "$canonical_app_bundle"/*) [ -e "$resolved_symlink" ] || { fail "dangling symlink ${bundle_symlink#"$app_bundle/"}"; escaping_symlinks=$((escaping_symlinks + 1)); } ;;
      *) fail "symlink leaves the bundle: ${bundle_symlink#"$app_bundle/"} -> $(readlink "$bundle_symlink")"
         escaping_symlinks=$((escaping_symlinks + 1)) ;;
    esac
  done < <(find "$app_bundle" -type l -print0)
  [ "$escaping_symlinks" -eq 0 ] && pass "every symlink resolves inside the bundle"

  local lend_mach_o_links=0 lend_link
  while IFS= read -r -d '' lend_link; do
    case "$(cd "$(dirname "$lend_link")" && realpath "$(readlink "$lend_link")")" in
      "$canonical_app_bundle/Contents/Frameworks/tatolab-runtime/"*) lend_mach_o_links=$((lend_mach_o_links + 1)) ;;
      *) fail "lend link points outside Frameworks/tatolab-runtime: ${lend_link#"$contents/"}" ;;
    esac
  done < <(find "$contents/Resources/lend" -type l -print0 2>/dev/null)
  [ -f "$contents/Resources/lend/tatolab/runtime/_processor_interpreter_bootstrap.py" ] \
    && pass "Resources/lend carries the runtime package" || fail "Resources/lend has no tatolab/runtime package"
  [ "$lend_mach_o_links" -gt 0 ] && pass "Resources/lend links $lend_mach_o_links Mach-O into Frameworks/tatolab-runtime" \
    || fail "Resources/lend links no Mach-O into Frameworks/tatolab-runtime"

  local lend_python_source lend_bytecode_cache_tag lend_bytecode_file missing_lend_bytecode_count=0 first_missing_lend_bytecode=""
  while IFS= read -r -d '' lend_python_source; do
    for lend_bytecode_cache_tag in "${required_lend_bytecode_cache_tags[@]}"; do
      lend_bytecode_file="$(dirname "$lend_python_source")/__pycache__/$(basename "$lend_python_source" .py).$lend_bytecode_cache_tag.pyc"
      if [ ! -f "$lend_bytecode_file" ]; then
        missing_lend_bytecode_count=$((missing_lend_bytecode_count + 1))
        [ -n "$first_missing_lend_bytecode" ] || first_missing_lend_bytecode="${lend_bytecode_file#"$contents/"}"
      fi
    done
  done < <(find "$contents/Resources/lend/tatolab/runtime" -name '*.py' -type f -print0 2>/dev/null)
  [ "$missing_lend_bytecode_count" -eq 0 ] \
    && pass "every .py under Resources/lend/tatolab/runtime has ${required_lend_bytecode_cache_tags[*]} bytecode" \
    || fail "$missing_lend_bytecode_count .pyc missing under Resources/lend/tatolab/runtime (first: $first_missing_lend_bytecode); a processor interpreter would write it into the signed bundle"

  local launch_agent_plist="$contents/Library/LaunchAgents/com.tatolab.tatolabd.plist"
  if plutil -lint -s "$launch_agent_plist" 2>/dev/null; then
    pass "launch agent plist is valid"
    [ "$(plutil -extract Label raw -o - "$launch_agent_plist")" = com.tatolab.tatolabd ] \
      && pass "launch agent Label is com.tatolab.tatolabd" || fail "launch agent Label is not com.tatolab.tatolabd"
    local bundle_program
    bundle_program="$(plutil -extract BundleProgram raw -o - "$launch_agent_plist" 2>/dev/null || true)"
    [ "$bundle_program" = Contents/MacOS/tatolabd ] && [ -x "$app_bundle/$bundle_program" ] \
      && pass "launch agent BundleProgram is the bundled tatolabd" || fail "launch agent BundleProgram is '$bundle_program'"
    [ "$(plutil -extract AssociatedBundleIdentifiers.0 raw -o - "$launch_agent_plist" 2>/dev/null)" = com.tatolab.tatolab ] \
      && pass "launch agent is associated with com.tatolab.tatolab" || fail "launch agent is not associated with com.tatolab.tatolab"
    if plutil -extract EnvironmentVariables.TATOLAB_TEST_MACHINE_ROOT raw -o - "$launch_agent_plist" >/dev/null 2>&1 \
      || [ -e "$contents/Resources/machine-directories-under-a-test-root" ]; then
      if $shipping; then
        fail "LOCAL PROOF build (test machine root): never ship it"
      else
        echo "  note  LOCAL PROOF build: every machine directory lives under TATOLAB_TEST_MACHINE_ROOT"
      fi
    else
      pass "real machine directories (no test machine root)"
    fi
  else
    fail "launch agent plist missing or invalid: Contents/Library/LaunchAgents/com.tatolab.tatolabd.plist"
  fi

  local signed_code entitlement signed_code_entitlements
  for signed_code in "$contents/MacOS/tatolabd" "$app_bundle"; do
    signed_code_entitlements="$(codesign -d --entitlements - --xml "$signed_code" 2>/dev/null || true)"
    for entitlement in "${required_device_entitlements[@]}"; do
      grep -q "<key>$entitlement</key><true/>" <<<"$signed_code_entitlements" \
        && pass "$entitlement on $(basename "$signed_code")" || fail "no $entitlement on $(basename "$signed_code")"
    done
  done

  stapled_and_accepted_by_gatekeeper "$app_bundle" execute
}

case "$verification_target" in
  *.dmg)
    echo "verifying $verification_target"
    codesign --verify --strict "$verification_target" && pass "the image is signed" || fail "the image is not signed"
    stapled_and_accepted_by_gatekeeper "$verification_target" open
    dmg_mount_point="$(mktemp -d)"
    hdiutil attach -nobrowse -readonly -noautoopen -mountpoint "$dmg_mount_point" "$verification_target" >/dev/null
    trap 'hdiutil detach -quiet "$dmg_mount_point" || hdiutil detach -force -quiet "$dmg_mount_point"; rmdir "$dmg_mount_point" 2>/dev/null || true' EXIT
    [ "$(readlink "$dmg_mount_point/Applications")" = /Applications ] \
      && pass "the image links Applications" || fail "the image has no Applications link"
    [ -f "$dmg_mount_point/.background.tiff" ] && pass "the image carries the installer background" \
      || fail "the image has no installer background"
    [ -d "$dmg_mount_point/Tatolab.app" ] || { fail "the image holds no Tatolab.app"; exit 1; }
    verify_app_bundle "$dmg_mount_point/Tatolab.app"
    ;;
  *.app) verify_app_bundle "$verification_target" ;;
  *) echo "expected a .app or a .dmg: $verification_target" >&2; exit 1 ;;
esac

if [ "$failure_count" -gt 0 ]; then
  echo "$failure_count check(s) failed for $verification_target" >&2
  exit 1
fi
echo "all checks passed for $verification_target"
