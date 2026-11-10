#!/usr/bin/env bash
# Lays streamlib's runtime unit into a Tatolab.app that @electron/packager produced, as the helper
# bundle Contents/Helpers/Tatolab Runtime.app, whose tatolabd the app runs as its child:
#   <helper>/Contents/Info.plist                          its own bundle id, com.tatolab.runtime, and
#                                                         the usage strings macOS credits it for
#   <helper>/Contents/MacOS/tatolabd, tatolab-cli          the runtime and the CLI (bin/tatolab: the
#                                                         filesystem is case-insensitive, so "tatolab"
#                                                         would fold onto the app's own "Tatolab")
#   <helper>/Contents/MacOS/uv                            the uv tatolabd runs from beside itself
#   <helper>/Contents/Frameworks/tatolab-runtime/<path>   every Mach-O of lend/tatolab/runtime
#   <helper>/Contents/Resources/lend/                     the lend, each Mach-O a relative symlink
#                                                         into Frameworks/tatolab-runtime, precompiled
#                                                         for CPython 3.10-3.14
#   <helper>/Contents/Resources/imports/                  the unit's first-party module wheels, beside
#                                                         the lend, where tatolabd finds them; each is
#                                                         pure Python, so Resources/ holds no code
#   <helper>/Contents/Resources/streamlib-commit          the streamlib commit the runtime was built from
# Code signing requires code under MacOS/ or Frameworks/; the lend keeps its shape through the links.
#
# Usage: assemble-tatolab-app-bundle.sh <Tatolab.app> <runtime unit dir> --streamlib-commit SHA
#                                      [--local-proof-test-root]
#   --streamlib-commit SHA   the streamlib commit the build resolved; the unit's streamlib-commit
#                            must name it
#   --local-proof-test-root  the unit must carry the machine-directories-under-a-test-root marker,
#                            which the helper carries too
set -euo pipefail

usage() { awk '/^# Usage:/{p=1} p&&/^#/{sub(/^# ?/,""); print; next} p{exit}' "$0" >&2; exit 2; }
[ $# -ge 2 ] || usage
app_bundle="$(cd "$1" && pwd)"
runtime_unit_directory="$(cd "$2" && pwd)"
shift 2
local_proof_test_root=false
resolved_streamlib_commit=""
while [ $# -gt 0 ]; do
  case "$1" in
    --streamlib-commit) [ $# -ge 2 ] || usage; resolved_streamlib_commit="$2"; shift ;;
    --local-proof-test-root) local_proof_test_root=true ;;
    *) usage ;;
  esac
  shift
done
[[ "$resolved_streamlib_commit" =~ ^[0-9a-f]{40}$ ]] || usage

tato_app_root="$(cd "$(dirname "$0")/.." && pwd)"
runtime_helper_info_plist_template="$tato_app_root/packaging/runtime-helper/Info.plist"
runtime_helper_bundle_name="Tatolab Runtime.app"
marker_file_name="machine-directories-under-a-test-root"
streamlib_commit_file_name="streamlib-commit"
lend_source="$runtime_unit_directory/lib/tatolab/lend"
first_party_modules_source="$runtime_unit_directory/lib/tatolab/imports"
lent_runtime_package_relative_to_the_lend="tatolab/runtime"
processor_interpreter_python_versions=(3.10 3.11 3.12 3.13 3.14)

contents="$app_bundle/Contents"
[ -x "$contents/MacOS/Tato Studio" ] || { echo "$app_bundle has no Contents/MacOS/Tato Studio: not a packaged Tato Studio.app" >&2; exit 1; }
for required in bin/tatolabd bin/tatolab bin/uv "lib/tatolab/lend/$lent_runtime_package_relative_to_the_lend" lib/tatolab/imports; do
  [ -e "$runtime_unit_directory/$required" ] || { echo "runtime unit $runtime_unit_directory is missing $required" >&2; exit 1; }
done
# Anything streamlib adds to the unit would otherwise be left out of the bundle without a word.
for runtime_unit_entry in "$runtime_unit_directory"/bin/* "$runtime_unit_directory"/lib/tatolab/*; do
  case "${runtime_unit_entry#"$runtime_unit_directory/"}" in
    bin/tatolabd|bin/tatolab|bin/uv|lib/tatolab/lend|lib/tatolab/imports) ;;
    # The browser host is a CEF app bundle: code, which signing takes only under MacOS/ or Frameworks/.
    lib/tatolab/browser-host) echo "runtime unit $runtime_unit_directory ships lib/tatolab/browser-host, which this script does not place in the bundle: build the unit without CEF_PATH" >&2; exit 1 ;;
    *) echo "runtime unit $runtime_unit_directory ships ${runtime_unit_entry#"$runtime_unit_directory/"}, which this script does not place in the bundle" >&2; exit 1 ;;
  esac
done
# Resources/ is sealed as data, so a wheel carrying a native extension would ship unsigned code.
first_party_module_wheel_count=0
for first_party_modules_entry in "$first_party_modules_source"/*; do
  [ -e "$first_party_modules_entry" ] || continue
  case "$first_party_modules_entry" in
    *.whl) ;;
    *) echo "runtime unit $runtime_unit_directory ships ${first_party_modules_entry#"$runtime_unit_directory/"}, which is not a wheel" >&2; exit 1 ;;
  esac
  wheel_members="$(unzip -Z1 "$first_party_modules_entry" 2>/dev/null)" \
    || { echo "runtime unit $runtime_unit_directory ships ${first_party_modules_entry#"$runtime_unit_directory/"}, which unzip cannot read" >&2; exit 1; }
  native_wheel_member="$(grep -m1 -E '\.(so|dylib|bundle|pyd)$' <<<"$wheel_members" || true)"
  [ -z "$native_wheel_member" ] \
    || { echo "runtime unit $runtime_unit_directory ships ${first_party_modules_entry#"$runtime_unit_directory/"}, whose $native_wheel_member is native code Resources/imports cannot carry" >&2; exit 1; }
  first_party_module_wheel_count=$((first_party_module_wheel_count + 1))
done
[ "$first_party_module_wheel_count" -gt 0 ] || { echo "runtime unit $runtime_unit_directory carries no first-party module wheel in lib/tatolab/imports" >&2; exit 1; }
unit_streamlib_commit="$(cat "$runtime_unit_directory/$streamlib_commit_file_name" 2>/dev/null || true)"
[ -n "$unit_streamlib_commit" ] || {
  echo "runtime unit $runtime_unit_directory names no streamlib commit ($streamlib_commit_file_name): build it with build-tatolab-runtime-unit.sh" >&2
  exit 1
}
[ "$unit_streamlib_commit" = "$resolved_streamlib_commit" ] || {
  echo "runtime unit $runtime_unit_directory was built from streamlib $unit_streamlib_commit, not $resolved_streamlib_commit, the commit this build resolved" >&2
  exit 1
}
if $local_proof_test_root; then
  [ -f "$runtime_unit_directory/$marker_file_name" ] || {
    echo "--local-proof-test-root needs a unit built with --machine-directories-under-a-test-root (no $marker_file_name marker)" >&2
    exit 1
  }
else
  [ ! -e "$runtime_unit_directory/$marker_file_name" ] || {
    echo "refusing to ship a test-root runtime unit: $runtime_unit_directory/$marker_file_name exists" >&2
    echo "rebuild without --machine-directories-under-a-test-root, or pass --local-proof-test-root" >&2
    exit 1
  }
fi

is_mach_o() { [[ "$(file -b "$1")" == Mach-O* ]]; }

# The symlink target from Contents/<link_path_relative_to_contents> to Contents/<target_relative_to_contents>.
relative_path_from_contents_link() {
  local link_path_relative_to_contents="$1" target_relative_to_contents="$2"
  local link_directory="${link_path_relative_to_contents%/*}" climb=""
  local remaining="$link_directory"
  while [ -n "$remaining" ]; do
    climb="../$climb"
    case "$remaining" in
      */*) remaining="${remaining%/*}" ;;
      *) remaining="" ;;
    esac
  done
  printf '%s%s' "$climb" "$target_relative_to_contents"
}

helper_bundle="$contents/Helpers/$runtime_helper_bundle_name"
helper_contents="$helper_bundle/Contents"
rm -rf "$contents/Helpers" "$contents/Frameworks/tatolab-runtime" "$contents/Resources/lend" "$contents/Resources/watch" \
  "$contents/Library/LaunchAgents" "$contents/Resources/$marker_file_name" "$contents/Resources/$streamlib_commit_file_name" \
  "$contents/MacOS/tatolabd" "$contents/MacOS/tatolab-cli" "$contents/MacOS/moq-relay" "$contents/Resources/install.sh" \
  "$contents/MacOS/uv" "$contents/Frameworks/tatolab-python" "$contents/Resources/python"
mkdir -p "$helper_contents/MacOS" "$helper_contents/Frameworks/tatolab-runtime" "$helper_contents/Resources"

app_version="$(plutil -extract CFBundleShortVersionString raw -o - "$contents/Info.plist")"
cp "$runtime_helper_info_plist_template" "$helper_contents/Info.plist"
plutil -replace CFBundleShortVersionString -string "$app_version" "$helper_contents/Info.plist"
plutil -replace CFBundleVersion -string "$app_version" "$helper_contents/Info.plist"
plutil -lint -s "$helper_contents/Info.plist"

install -m 0755 "$runtime_unit_directory/bin/tatolabd" "$helper_contents/MacOS/tatolabd"
install -m 0755 "$runtime_unit_directory/bin/tatolab" "$helper_contents/MacOS/tatolab-cli"
install -m 0755 "$runtime_unit_directory/bin/uv" "$helper_contents/MacOS/uv"

ditto "$lend_source" "$helper_contents/Resources/lend"
ditto "$first_party_modules_source" "$helper_contents/Resources/imports"
cp "$runtime_unit_directory/$streamlib_commit_file_name" "$helper_contents/Resources/$streamlib_commit_file_name"
find "$helper_contents/Resources/lend" -name __pycache__ -type d -prune -exec rm -rf {} +

relocated_mach_o_count=0
while IFS= read -r -d '' lend_file; do
  is_mach_o "$lend_file" || continue
  path_in_the_lend="${lend_file#"$helper_contents/Resources/lend/"}"
  case "$path_in_the_lend" in
    "$lent_runtime_package_relative_to_the_lend"/*) ;;
    *) echo "Mach-O outside lend/$lent_runtime_package_relative_to_the_lend: $path_in_the_lend" >&2; exit 1 ;;
  esac
  path_in_the_runtime_package="${path_in_the_lend#"$lent_runtime_package_relative_to_the_lend/"}"
  framework_copy="$helper_contents/Frameworks/tatolab-runtime/$path_in_the_runtime_package"
  mkdir -p "$(dirname "$framework_copy")"
  mv "$lend_file" "$framework_copy"
  ln -s "$(relative_path_from_contents_link "Resources/lend/$path_in_the_lend" \
    "Frameworks/tatolab-runtime/$path_in_the_runtime_package")" "$lend_file"
  [ -f "$lend_file" ] || { echo "the link at $lend_file does not resolve" >&2; exit 1; }
  relocated_mach_o_count=$((relocated_mach_o_count + 1))
done < <(find "$helper_contents/Resources/lend" -type f -print0)
[ "$relocated_mach_o_count" -gt 0 ] || { echo "the lend carried no Mach-O: is $runtime_unit_directory a macOS unit?" >&2; exit 1; }

# Processor interpreters (the user's venv Python) import tatolab.runtime from this lend with every
# PYTHON* variable stripped, so a missing .pyc would be written into the signed bundle, breaking its
# seal. unchecked-hash bytecode is never revalidated against the source, so it is never rewritten.
for python_version in "${processor_interpreter_python_versions[@]}"; do
  uv run --no-project --python "$python_version" python -m compileall -q --invalidation-mode unchecked-hash \
    "$helper_contents/Resources/lend"
done

if $local_proof_test_root; then
  cp "$runtime_unit_directory/$marker_file_name" "$helper_contents/Resources/$marker_file_name"
fi

echo "assembled $app_bundle from streamlib $resolved_streamlib_commit: $runtime_helper_bundle_name with tatolabd, tatolab-cli, uv, $relocated_mach_o_count Mach-O in Frameworks/tatolab-runtime $first_party_module_wheel_count first-party module wheels in Resources/imports and lend in Resources/lend (bytecode for CPython ${processor_interpreter_python_versions[*]})$($local_proof_test_root && echo ' (local proof)')"
