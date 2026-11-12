#!/usr/bin/env bash
# Checks a signed Tatolab.app, or the Tatolab.app inside a .dmg, against the bundle contract:
# a strict deep signature, every Mach-O and the image signed by Tatolab's Developer ID Application
# identity with the hardened runtime (never ad-hoc, never another team), no Mach-O outside the app's
# and the runtime helper's Contents/MacOS and Contents/Frameworks, every symlink resolving inside the
# bundle, the runtime helper Contents/Helpers/Tatolab Runtime.app and its Info.plist, no install.sh,
# the Info.plist usage strings, the helper's runtime version at or below the app's and the streamlib
# commit it was built from, the lend's CPython 3.10-3.14 bytecode, the first-party module wheels beside it, every
# Mach-O inside the carried wheels and Python signed like the bundle's own, the
# runtime's uv beside the helper's tatolabd and no Python of the app's own, the entitlements of the
# helper's tatolabd, uv, tatolab-cli and tatolab-video-poster-frame, the app and Electron's helpers, Electron's
# fuses, and the build features the app was built with and the tatolab-app commit they name.
# Reading the fuses and the build features needs this checkout's node_modules (npm ci).
# A stapled target must also pass Gatekeeper.
#
# Usage: verify-tatolab-app-bundle.sh <Tatolab.app|file.dmg> [--shipping]
#   --shipping  also refuse a local-proof (test machine root) build, and one that checks any
#               update feed but get.tatolab.com's
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

# Why the code `codesign -dvv` described in $1 is not signed by Tatolab's Developer ID, or nothing
# when it is.
not_signed_by_the_tatolab_developer_id() {
  local code_signature_description="$1" signing_authority signing_team_identifier
  if grep -q 'flags=.*adhoc' <<<"$code_signature_description"; then
    echo "it is signed ad-hoc"
    return
  fi
  signing_authority="$(sed -n '/^Authority=/{s/^Authority=//p;q;}' <<<"$code_signature_description")"
  signing_team_identifier="$(sed -n 's/^TeamIdentifier=//p' <<<"$code_signature_description")"
  case "$signing_authority" in
    "Developer ID Application: "*) ;;
    *) echo "it is signed by '${signing_authority:-no authority}', not a Developer ID Application identity"; return ;;
  esac
  [ "$signing_team_identifier" = "$tatolab_developer_id_team_identifier" ] \
    || echo "it is signed by team '${signing_team_identifier:-none}', not Tatolab's $tatolab_developer_id_team_identifier"
}

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
# The only entitlements each piece of signed code may carry; allow-jit is V8's, in the main
# process, Blink's renderer and the plain helper that hosts utility processes (packaging/entitlements/).
allowed_app_entitlements="com.apple.security.cs.allow-jit com.apple.security.device.audio-input com.apple.security.device.camera"
allowed_renderer_helper_entitlements="com.apple.security.cs.allow-jit"
allowed_utility_helper_entitlements="com.apple.security.cs.allow-jit"
# The carried Python loads extension modules a person installs from PyPI, which are not signed by
# Tatolab's team, and llvmlite and numba compile code into memory and run it.
allowed_carried_python_entitlements="com.apple.security.cs.allow-jit com.apple.security.cs.allow-unsigned-executable-memory com.apple.security.cs.disable-library-validation"
allowed_tatolabd_entitlements="com.apple.application-identifier com.apple.developer.team-identifier com.apple.security.device.audio-input com.apple.security.device.camera keychain-access-groups"
# A process could otherwise run the app as plain Node and inherit its camera and microphone grants.
required_electron_fuse_states=(
  "RunAsNode is Disabled" "EnableNodeOptionsEnvironmentVariable is Disabled" "EnableNodeCliInspectArguments is Disabled"
  "EnableEmbeddedAsarIntegrityValidation is Enabled" "OnlyLoadAppFromAsar is Enabled"
)
tato_app_root="$(cd "$(dirname "$0")/.." && pwd)"
# The team of the Developer ID every Tatolab.app is signed by; a TeamIdentifier is public in every
# signature it makes.
tatolab_developer_id_team_identifier=QV2N7EDV53

# The entitlement keys `signed_code` carries, sorted, on one line.
entitlement_keys_of() {
  codesign -d --entitlements - --xml "$1" 2>/dev/null | grep -o '<key>[^<]*</key>' | sed 's/<[^>]*>//g' | sort | tr '\n' ' ' | sed 's/ $//' || true
}
required_lend_bytecode_cache_tags=(cpython-310 cpython-311 cpython-312 cpython-313 cpython-314)

# The notary opens a .whl and a .tar.gz and refuses any Mach-O in them not signed by a Developer
# ID with a secure timestamp, and an executable without the hardened runtime, so each carried
# archive is unpacked and every Mach-O in it held to the bundle's own signature rules.
verify_the_carried_archives() {
  local helper_resources="$1" carried_archives_scratch carried_wheel carried_python_archive
  local carried_wheel_count=0 carried_python_archive_count=0 carried_mach_o_count=0 failing_carried_mach_o_count=0
  local carried_file carried_file_in_the_archive carried_signature_description carried_foreign_signature_reason
  carried_archives_scratch="$(mktemp -d)"
  for carried_wheel in "$helper_resources/carried-wheels"/*.whl; do
    [ -f "$carried_wheel" ] || continue
    carried_wheel_count=$((carried_wheel_count + 1))
    mkdir -p "$carried_archives_scratch/$(basename "$carried_wheel")"
    unzip -q "$carried_wheel" -d "$carried_archives_scratch/$(basename "$carried_wheel")" \
      || fail "Resources/carried-wheels/$(basename "$carried_wheel") does not unzip"
  done
  for carried_python_archive in "$helper_resources/python-downloads"/*/*.tar.gz; do
    [ -f "$carried_python_archive" ] || continue
    carried_python_archive_count=$((carried_python_archive_count + 1))
    mkdir -p "$carried_archives_scratch/$(basename "$carried_python_archive")"
    tar -xzf "$carried_python_archive" -C "$carried_archives_scratch/$(basename "$carried_python_archive")" \
      || fail "Resources/python-downloads/$(basename "$carried_python_archive") does not unpack"
    grep -qF "\"sha256\": \"$(shasum -a 256 "$carried_python_archive" | cut -d' ' -f1)\"" \
      "$helper_resources/python-downloads/uv-python-downloads.json" 2>/dev/null \
      && pass "Resources/python-downloads/uv-python-downloads.json names the sha256 of $(basename "$carried_python_archive")" \
      || fail "Resources/python-downloads/uv-python-downloads.json does not name the sha256 of $(basename "$carried_python_archive"): uv would refuse it and go online"
  done
  [ "$carried_wheel_count" -gt 0 ] && pass "the helper's Resources/carried-wheels carries $carried_wheel_count wheel(s)" \
    || fail "the helper's Resources/carried-wheels carries no wheel: a new project cannot sync offline"
  [ "$carried_python_archive_count" -eq 1 ] && pass "the helper's Resources/python-downloads carries one CPython archive" \
    || fail "the helper's Resources/python-downloads carries $carried_python_archive_count CPython archives, not one"
  while IFS= read -r -d '' carried_file; do
    is_mach_o "$carried_file" || continue
    carried_mach_o_count=$((carried_mach_o_count + 1))
    carried_file_in_the_archive="${carried_file#"$carried_archives_scratch/"}"
    carried_signature_description="$(codesign -dvv "$carried_file" 2>&1 || true)"
    carried_foreign_signature_reason="$(not_signed_by_the_tatolab_developer_id "$carried_signature_description")"
    if [ -n "$carried_foreign_signature_reason" ]; then
      fail "$carried_file_in_the_archive, carried in the helper's Resources, is not signed by Tatolab's Developer ID: $carried_foreign_signature_reason"
      failing_carried_mach_o_count=$((failing_carried_mach_o_count + 1))
    elif ! grep -q '^Timestamp=' <<<"$carried_signature_description"; then
      fail "$carried_file_in_the_archive, carried in the helper's Resources, has no secure timestamp"
      failing_carried_mach_o_count=$((failing_carried_mach_o_count + 1))
    elif ! grep -q 'flags=.*runtime' <<<"$carried_signature_description"; then
      fail "no hardened runtime signature on $carried_file_in_the_archive, carried in the helper's Resources"
      failing_carried_mach_o_count=$((failing_carried_mach_o_count + 1))
    fi
    case "$carried_file_in_the_archive" in
      *.tar.gz/python/bin/*)
        [ "$(entitlement_keys_of "$carried_file")" = "$allowed_carried_python_entitlements" ] \
          && pass "$carried_file_in_the_archive carries exactly: $allowed_carried_python_entitlements" \
          || fail "$carried_file_in_the_archive's entitlements are '$(entitlement_keys_of "$carried_file")', not '$allowed_carried_python_entitlements'" ;;
    esac
  done < <(find "$carried_archives_scratch" -type f -print0)
  rm -rf "$carried_archives_scratch"
  [ "$carried_mach_o_count" -gt 0 ] && [ "$failing_carried_mach_o_count" -eq 0 ] \
    && pass "all $carried_mach_o_count Mach-O inside the carried wheels and Python are signed by Tatolab's Developer ID with a timestamp and the hardened runtime"
}

verify_app_bundle() {
  local app_bundle contents canonical_app_bundle
  app_bundle="$(cd "$1" && pwd)"
  canonical_app_bundle="$(cd "$app_bundle" && pwd -P)"
  contents="$app_bundle/Contents"
  local helper_bundle="$contents/Helpers/Tatolab Runtime.app"
  local helper_contents="$helper_bundle/Contents"
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
  [ -x "$helper_contents/MacOS/uv" ] && pass "Tatolab Runtime.app's MacOS/uv, beside its tatolabd, is present" \
    || fail "Tatolab Runtime.app's MacOS/uv is missing: tatolabd makes no project's .venv without it"
  [ ! -e "$contents/Resources/install.sh" ] && pass "Resources/install.sh, which the app never runs, is absent" \
    || fail "Resources/install.sh is present: the app runs its runtime as its child and carries no installer"
  local helper_info_plist="$helper_contents/Info.plist"
  [ "$(plutil -extract CFBundleIdentifier raw -o - "$helper_info_plist" 2>/dev/null)" = com.tatolab.runtime ] \
    && pass "Tatolab Runtime.app's CFBundleIdentifier is com.tatolab.runtime" \
    || fail "Contents/Helpers/Tatolab Runtime.app is missing or its CFBundleIdentifier is not com.tatolab.runtime"
  [ "$(plutil -extract CFBundleExecutable raw -o - "$helper_info_plist" 2>/dev/null)" = tatolabd ] \
    && pass "Tatolab Runtime.app's executable is tatolabd" || fail "Tatolab Runtime.app's CFBundleExecutable is not tatolabd"
  local bundled_executable
  for bundled_executable in tatolabd tatolab-cli uv tatolab-video-poster-frame; do
    [ -x "$helper_contents/MacOS/$bundled_executable" ] && pass "Tatolab Runtime.app's Contents/MacOS/$bundled_executable is present" \
      || fail "Tatolab Runtime.app's Contents/MacOS/$bundled_executable is missing"
  done
  local app_short_version bundled_tatolabd_version
  app_short_version="$(plutil -extract CFBundleShortVersionString raw -o - "$info_plist" 2>/dev/null || true)"
  bundled_tatolabd_version="$("$helper_contents/MacOS/tatolabd" --version 2>/dev/null || true)"
  bundled_tatolabd_version="${bundled_tatolabd_version##* }"
  # The app's version is the bundled runtime's, or a later one when the app released again over the same runtime.
  if [ -n "$app_short_version" ] && [[ "$bundled_tatolabd_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] \
    && [ "$(printf '%s\n%s\n' "$bundled_tatolabd_version" "$app_short_version" | sort -V | tail -1)" = "$app_short_version" ]; then
    pass "the bundled tatolabd is $bundled_tatolabd_version, no newer than the app's version $app_short_version"
  else
    fail "the bundled tatolabd is '$bundled_tatolabd_version', not a version at or below the app's '$app_short_version'"
  fi
  [ "$(plutil -extract CFBundleShortVersionString raw -o - "$helper_info_plist" 2>/dev/null)" = "$app_short_version" ] \
    && pass "Tatolab Runtime.app's version is the app's" || fail "Tatolab Runtime.app's CFBundleShortVersionString is not the app's '$app_short_version'"
  local bundled_streamlib_commit
  bundled_streamlib_commit="$(cat "$helper_contents/Resources/streamlib-commit" 2>/dev/null || true)"
  [[ "$bundled_streamlib_commit" =~ ^[0-9a-f]{40}$ ]] \
    && pass "the runtime was built from streamlib $bundled_streamlib_commit" \
    || fail "Tatolab Runtime.app's Resources/streamlib-commit names no streamlib commit: which runtime this bundles is unknown"
  plutil -extract NSAppTransportSecurity xml1 -o - "$info_plist" >/dev/null 2>&1 \
    && fail "Info.plist carries Electron's NSAppTransportSecurity exception" || pass "Info.plist carries no App Transport Security exception"
  # Each privacy prompt names what asks: the app's own Info.plist names Tato Studio, the runtime
  # helper's names the Tatolab runtime.
  local usage_key usage_description usage_info_plist usage_names
  for usage_info_plist in "$info_plist" "$helper_info_plist"; do
    if [ "$usage_info_plist" = "$info_plist" ]; then usage_names="Tato Studio"; else usage_names="Tatolab"; fi
    while IFS= read -r usage_key; do
      [ -n "$usage_key" ] || continue
      case "$(plutil -extract "$usage_key" raw -o - "$usage_info_plist" 2>/dev/null)" in
        *"$usage_names"*) ;;
        *) fail "${usage_info_plist#"$contents/"}'s $usage_key does not name $usage_names" ;;
      esac
    done < <(plutil -convert xml1 -o - "$usage_info_plist" 2>/dev/null | sed -n 's|.*<key>\([A-Za-z]*UsageDescription\)</key>.*|\1|p')
    for usage_key in "${required_usage_description_keys[@]}"; do
      usage_description="$(plutil -extract "$usage_key" raw -o - "$usage_info_plist" 2>/dev/null || true)"
      case "$usage_description" in
        *"$usage_names"*) pass "${usage_info_plist#"$contents/"}'s $usage_key names $usage_names" ;;
        "") fail "${usage_info_plist#"$contents/"} has no $usage_key" ;;
        *) fail "${usage_info_plist#"$contents/"}'s $usage_key does not name $usage_names: $usage_description" ;;
      esac
    done
  done

  local mach_o_outside_code_directories=0 unhardened_mach_o_count=0 bundle_file path_in_contents
  local foreign_signature_count=0 foreign_signature_reason code_signature_description
  while IFS= read -r -d '' bundle_file; do
    is_mach_o "$bundle_file" || continue
    path_in_contents="${bundle_file#"$contents/"}"
    case "$path_in_contents" in
      MacOS/*|Frameworks/*|"Helpers/Tatolab Runtime.app/Contents/MacOS/"*|"Helpers/Tatolab Runtime.app/Contents/Frameworks/"*) ;;
      *) fail "Mach-O outside MacOS/ and Frameworks/: Contents/$path_in_contents"
         mach_o_outside_code_directories=$((mach_o_outside_code_directories + 1)) ;;
    esac
    code_signature_description="$(codesign -dvv "$bundle_file" 2>&1 || true)"
    foreign_signature_reason="$(not_signed_by_the_tatolab_developer_id "$code_signature_description")"
    if [ -n "$foreign_signature_reason" ]; then
      fail "Contents/$path_in_contents is not signed by Tatolab's Developer ID: $foreign_signature_reason"
      foreign_signature_count=$((foreign_signature_count + 1))
    fi
    if ! grep -q 'flags=.*runtime' <<<"$code_signature_description"; then
      fail "no hardened runtime signature on Contents/$path_in_contents"
      unhardened_mach_o_count=$((unhardened_mach_o_count + 1))
    fi
  done < <(find "$contents" -type f -print0)
  [ "$mach_o_outside_code_directories" -eq 0 ] && pass "every Mach-O sits in the app's or the runtime helper's Contents/MacOS or Contents/Frameworks"
  [ "$foreign_signature_count" -eq 0 ] && pass "every Mach-O is signed by Tatolab's Developer ID (team $tatolab_developer_id_team_identifier)"
  [ "$unhardened_mach_o_count" -eq 0 ] && pass "every Mach-O is signed with the hardened runtime"

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
      "$canonical_app_bundle/Contents/Helpers/Tatolab Runtime.app/Contents/Frameworks/tatolab-runtime/"*) lend_mach_o_links=$((lend_mach_o_links + 1)) ;;
      *) fail "lend link points outside the helper's Frameworks/tatolab-runtime: ${lend_link#"$helper_contents/"}" ;;
    esac
  done < <(find "$helper_contents/Resources/lend" -type l -print0 2>/dev/null)
  [ -f "$helper_contents/Resources/lend/tatolab/runtime/_processor_interpreter_bootstrap.py" ] \
    && pass "the helper's Resources/lend carries the runtime package" || fail "the helper's Resources/lend has no tatolab/runtime package"

  local core_first_party_module missing_core_first_party_modules=""
  for core_first_party_module in tatolab_compositor tatolab_ops tatolab_testpattern; do
    compgen -G "$helper_contents/Resources/imports/$core_first_party_module-*.whl" >/dev/null \
      || missing_core_first_party_modules="$missing_core_first_party_modules $core_first_party_module"
  done
  [ -z "$missing_core_first_party_modules" ] \
    && pass "the helper's Resources/imports carries a wheel of each core first-party module beside the lend" \
    || fail "the helper's Resources/imports has no wheel of:$missing_core_first_party_modules, so a project's .venv would lack them"
  compgen -G "$helper_contents/Resources/samples/*/tatolab-project.json" >/dev/null \
    && pass "the helper's Resources/samples carries the sample projects beside the lend" \
    || fail "the helper's Resources/samples carries no sample project, so no project can be created from one"
  verify_the_carried_archives "$helper_contents/Resources"
  [ ! -e "$contents/Resources/python" ] && [ ! -e "$contents/Frameworks/tatolab-python" ] && [ ! -e "$contents/MacOS/uv" ] \
    && pass "the bundle carries no Python or uv of the app's own" || fail "the bundle carries a Python or uv of the app's own (Resources/python, Frameworks/tatolab-python or MacOS/uv)"
  [ "$lend_mach_o_links" -gt 0 ] && pass "the helper's Resources/lend links $lend_mach_o_links Mach-O into its Frameworks/tatolab-runtime" \
    || fail "the helper's Resources/lend links no Mach-O into its Frameworks/tatolab-runtime"

  local lend_python_source lend_bytecode_cache_tag lend_bytecode_file missing_lend_bytecode_count=0 first_missing_lend_bytecode=""
  while IFS= read -r -d '' lend_python_source; do
    for lend_bytecode_cache_tag in "${required_lend_bytecode_cache_tags[@]}"; do
      lend_bytecode_file="$(dirname "$lend_python_source")/__pycache__/$(basename "$lend_python_source" .py).$lend_bytecode_cache_tag.pyc"
      if [ ! -f "$lend_bytecode_file" ]; then
        missing_lend_bytecode_count=$((missing_lend_bytecode_count + 1))
        [ -n "$first_missing_lend_bytecode" ] || first_missing_lend_bytecode="${lend_bytecode_file#"$helper_contents/"}"
      fi
    done
  done < <(find "$helper_contents/Resources/lend/tatolab/runtime" -name '*.py' -type f -print0 2>/dev/null)
  [ "$missing_lend_bytecode_count" -eq 0 ] \
    && pass "every .py under the helper's Resources/lend/tatolab/runtime has ${required_lend_bytecode_cache_tags[*]} bytecode" \
    || fail "$missing_lend_bytecode_count .pyc missing under the helper's Resources/lend/tatolab/runtime (first: $first_missing_lend_bytecode); a processor interpreter would write it into the signed bundle"

  # One read: stdout is the features, stderr the reasons this build may not ship.
  local packaged_build_features shipping_build_features_refusals_file shipping_build_features_refusals
  local packaged_build_features_are_shipping=false
  shipping_build_features_refusals_file="$(mktemp)"
  packaged_build_features="$(node "$tato_app_root/scripts/tatolab_app_build_features.mjs" read "$contents/Resources/app.asar" --shipping 2>"$shipping_build_features_refusals_file")" \
    && packaged_build_features_are_shipping=true
  shipping_build_features_refusals="$(cat "$shipping_build_features_refusals_file")"
  rm -f "$shipping_build_features_refusals_file"
  [ -n "$packaged_build_features" ] \
    && pass "app.asar carries the build features: $(tr '\n' ' ' <<<"$packaged_build_features")" \
    || fail "app.asar's build features are unreadable: $shipping_build_features_refusals"

  [ ! -e "$contents/Library/LaunchAgents" ] && pass "the app carries no launch agent: it runs the runtime as its own child" \
    || fail "Contents/Library/LaunchAgents is present: the app runs the runtime as its own child, never through launchd"
  if [ -e "$helper_contents/Resources/machine-directories-under-a-test-root" ] \
    || ! grep -qx "machineDirectoriesUnderATestRoot=false" <<<"$packaged_build_features"; then
    if $shipping; then
      fail "LOCAL PROOF build (test machine root): never ship it"
    else
      echo "  note  LOCAL PROOF build: every machine directory lives under TATOLAB_TEST_MACHINE_ROOT"
    fi
  else
    pass "real machine directories (no test machine root)"
  fi

  local signed_code entitlement signed_code_entitlements
  for signed_code in "$helper_bundle" "$app_bundle"; do
    signed_code_entitlements="$(codesign -d --entitlements - --xml "$signed_code" 2>/dev/null || true)"
    for entitlement in "${required_device_entitlements[@]}"; do
      grep -q "<key>$entitlement</key><true/>" <<<"$signed_code_entitlements" \
        && pass "$entitlement on $(basename "$signed_code")" || fail "no $entitlement on $(basename "$signed_code")"
    done
  done
  local signed_code_entitlement_keys
  signed_code_entitlement_keys="$(entitlement_keys_of "$app_bundle")"
  [ "$signed_code_entitlement_keys" = "$allowed_app_entitlements" ] \
    && pass "the app carries exactly: $allowed_app_entitlements" || fail "the app's entitlements are '$signed_code_entitlement_keys', not '$allowed_app_entitlements'"
  signed_code_entitlement_keys="$(entitlement_keys_of "$helper_bundle")"
  [ "$signed_code_entitlement_keys" = "$allowed_tatolabd_entitlements" ] \
    && pass "Tatolab Runtime.app's tatolabd carries exactly: $allowed_tatolabd_entitlements" || fail "Tatolab Runtime.app's tatolabd's entitlements are '$signed_code_entitlement_keys', not '$allowed_tatolabd_entitlements'"
  local runtime_keychain_access_group="$tatolab_developer_id_team_identifier.com.tatolab.runtime"
  grep -q "<key>keychain-access-groups</key><array><string>$runtime_keychain_access_group</string></array>" \
    <<<"$(codesign -d --entitlements - --xml "$helper_bundle" 2>/dev/null || true)" \
    && pass "Tatolab Runtime.app keeps relay secrets in the keychain access group $runtime_keychain_access_group" \
    || fail "Tatolab Runtime.app's keychain access group is not $runtime_keychain_access_group"
  local embedded_runtime_profile_plist embedded_runtime_profile_application_identifier
  embedded_runtime_profile_plist="$(mktemp)"
  security cms -D -i "$helper_contents/embedded.provisionprofile" > "$embedded_runtime_profile_plist" 2>/dev/null || true
  embedded_runtime_profile_application_identifier="$(/usr/libexec/PlistBuddy -c 'Print :Entitlements:com.apple.application-identifier' \
    "$embedded_runtime_profile_plist" 2>/dev/null || true)"
  rm -f "$embedded_runtime_profile_plist"
  [ "$embedded_runtime_profile_application_identifier" = "$runtime_keychain_access_group" ] \
    && pass "Tatolab Runtime.app embeds the provisioning profile for $runtime_keychain_access_group" \
    || fail "Tatolab Runtime.app embeds no provisioning profile for $runtime_keychain_access_group (found '${embedded_runtime_profile_application_identifier:-none}')"
  local unentitled_executable
  for unentitled_executable in "$helper_contents/MacOS/uv" "$helper_contents/MacOS/tatolab-cli" \
    "$helper_contents/MacOS/tatolab-video-poster-frame"; do
    signed_code_entitlement_keys="$(entitlement_keys_of "$unentitled_executable")"
    [ -z "$signed_code_entitlement_keys" ] && pass "${unentitled_executable#"$contents/"} carries no entitlements" \
      || fail "${unentitled_executable#"$contents/"}'s entitlements are '$signed_code_entitlement_keys', not none"
  done
  local helper_app helper_app_count=0 allowed_helper_entitlements
  while IFS= read -r -d '' helper_app; do
    helper_app_count=$((helper_app_count + 1))
    case "$helper_app" in
      *"(Renderer).app") allowed_helper_entitlements="$allowed_renderer_helper_entitlements" ;;
      *" Helper.app") allowed_helper_entitlements="$allowed_utility_helper_entitlements" ;;
      *) allowed_helper_entitlements="" ;;
    esac
    signed_code_entitlement_keys="$(entitlement_keys_of "$helper_app")"
    [ "$signed_code_entitlement_keys" = "$allowed_helper_entitlements" ] \
      && pass "$(basename "$helper_app") carries exactly: ${allowed_helper_entitlements:-no entitlements}" \
      || fail "$(basename "$helper_app")'s entitlements are '$signed_code_entitlement_keys', not '${allowed_helper_entitlements}'"
  done < <(find "$contents/Frameworks" -maxdepth 1 -name '*.app' -print0)
  [ "$helper_app_count" -gt 0 ] || fail "Contents/Frameworks holds no Electron helper app"

  local electron_fuse_states electron_fuse_state
  electron_fuse_states="$(cd "$tato_app_root" && npx --no-install @electron/fuses read --app "$app_bundle" 2>&1 || true)"
  for electron_fuse_state in "${required_electron_fuse_states[@]}"; do
    grep -qF "$electron_fuse_state" <<<"$electron_fuse_states" \
      && pass "Electron fuse: $electron_fuse_state" || fail "Electron fuse is not '$electron_fuse_state'"
  done
  # The asar's header is JSON naming every directory it holds.
  grep -aqF '"electron-updater":{"files"' "$contents/Resources/app.asar" \
    && pass "electron-updater is in app.asar" || fail "app.asar carries no electron-updater"
  grep -qx 'updaterCacheDirName: tatolab-app-updater' "$contents/Resources/app-update.yml" 2>/dev/null \
    && pass "Resources/app-update.yml names the updater's cache" || fail "no Resources/app-update.yml naming the updater's cache: electron-updater cannot download"
  local shipping_build_features_refusal
  if $packaged_build_features_are_shipping; then
    pass "the app was built with the shipping features: real machine directories, updates from get.tatolab.com/app/"
  elif [ -n "$packaged_build_features" ]; then
    if $shipping; then
      while IFS= read -r shipping_build_features_refusal; do
        fail "the app $shipping_build_features_refusal: never ship it"
      done <<<"$shipping_build_features_refusals"
    else
      echo "  note  LOCAL PROOF build: the app's build features are $(tr '\n' ' ' <<<"$packaged_build_features")"
    fi
  fi

  stapled_and_accepted_by_gatekeeper "$app_bundle" execute
}

case "$verification_target" in
  *.dmg)
    echo "verifying $verification_target"
    codesign --verify --strict "$verification_target" && pass "the image is signed" || fail "the image is not signed"
    dmg_foreign_signature_reason="$(not_signed_by_the_tatolab_developer_id "$(codesign -dvv "$verification_target" 2>&1 || true)")"
    [ -z "$dmg_foreign_signature_reason" ] && pass "the image is signed by Tatolab's Developer ID" \
      || fail "the image is not signed by Tatolab's Developer ID: $dmg_foreign_signature_reason"
    stapled_and_accepted_by_gatekeeper "$verification_target" open
    dmg_mount_point="$(mktemp -d)"
    hdiutil attach -nobrowse -readonly -noautoopen -mountpoint "$dmg_mount_point" "$verification_target" >/dev/null
    trap 'hdiutil detach -quiet "$dmg_mount_point" || hdiutil detach -force -quiet "$dmg_mount_point"; rmdir "$dmg_mount_point" 2>/dev/null || true' EXIT
    [ "$(readlink "$dmg_mount_point/Applications")" = /Applications ] \
      && pass "the image links Applications" || fail "the image has no Applications link"
    [ -f "$dmg_mount_point/.background.tiff" ] && pass "the image carries the installer background" \
      || fail "the image has no installer background"
    [ -d "$dmg_mount_point/Tato Studio.app" ] || { fail "the image holds no Tato Studio.app"; exit 1; }
    verify_app_bundle "$dmg_mount_point/Tato Studio.app"
    ;;
  *.app) verify_app_bundle "$verification_target" ;;
  *) echo "expected a .app or a .dmg: $verification_target" >&2; exit 1 ;;
esac

if [ "$failure_count" -gt 0 ]; then
  echo "$failure_count check(s) failed for $verification_target" >&2
  exit 1
fi
echo "all checks passed for $verification_target"
