#!/usr/bin/env bash
# Lays streamlib's runtime unit into a Tatolab.app that @electron/packager produced, as the helper
# bundle Contents/Helpers/Tatolab Runtime.app, which install.sh --from-unit installs:
#   <helper>/Contents/Info.plist                          its own bundle id, com.tatolab.runtime, and
#                                                         the usage strings macOS credits it for
#   <helper>/Contents/MacOS/tatolabd, tatolab-cli          the runtime and the CLI (bin/tatolab: the
#                                                         filesystem is case-insensitive, so "tatolab"
#                                                         would fold onto the app's own "Tatolab")
#   <helper>/Contents/MacOS/moq-relay, uv                 the local relay and the uv tatolabd runs
#                                                         from beside itself
#   <helper>/Contents/Frameworks/tatolab-runtime/<path>   every Mach-O of lend/tatolab/runtime
#   <helper>/Contents/Resources/lend/                     the lend, each Mach-O a relative symlink
#                                                         into Frameworks/tatolab-runtime, precompiled
#                                                         for CPython 3.10-3.14
#   <helper>/Contents/Resources/watch/                    the preview page tatolabd serves on its
#                                                         loopback HTTP (lib/tatolab/watch)
#   <helper>/Contents/Resources/streamlib-commit          the streamlib commit the runtime was built from
# and, for the app itself:
#   Contents/MacOS/uv                                     the uv the app makes a project's .venv with
#   Contents/Frameworks/tatolab-python/<flat name>        every Mach-O of the built-in Python, its path
#                                                         under Resources/python with / as __: codesign
#                                                         takes a folder in Frameworks/ whose name holds a
#                                                         dot (cpython-3.12…, lib/python3.12) for a bundle
#   Contents/Resources/python/<cpython-…>/                the built-in Python, each Mach-O a relative
#                                                         symlink into Frameworks/tatolab-python
#   Contents/Resources/install.sh                         streamlib's installer, which installs the helper
# Code signing requires code under MacOS/ or Frameworks/; the lend and the built-in Python keep
# their shape through the links, which the app follows when it copies the Python out.
#
# Usage: assemble-tatolab-app-bundle.sh <Tatolab.app> <runtime unit dir> --streamlib-commit SHA
#                                      --python-toolchain DIR --installer FILE [--local-proof-test-root]
#   --streamlib-commit SHA   the streamlib commit the build resolved; the unit's streamlib-commit
#                            must name it
#   --python-toolchain DIR   uv and the built-in Python, as fetch-python-toolchain-for-the-app-build.sh
#                            lays them out
#   --installer FILE         streamlib's installer/install.sh, from the checkout the unit was built in
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
python_toolchain_directory=""
streamlib_installer=""
while [ $# -gt 0 ]; do
  case "$1" in
    --streamlib-commit) [ $# -ge 2 ] || usage; resolved_streamlib_commit="$2"; shift ;;
    --python-toolchain) [ $# -ge 2 ] || usage; python_toolchain_directory="$2"; shift ;;
    --installer) [ $# -ge 2 ] || usage; streamlib_installer="$2"; shift ;;
    --local-proof-test-root) local_proof_test_root=true ;;
    *) usage ;;
  esac
  shift
done
[[ "$resolved_streamlib_commit" =~ ^[0-9a-f]{40}$ ]] || usage
[ -n "$python_toolchain_directory" ] || usage
[ -n "$streamlib_installer" ] || usage

repository_root="$(cd "$(dirname "$0")/.." && pwd)"
runtime_helper_info_plist_template="$repository_root/packaging/runtime-helper/Info.plist"
runtime_helper_bundle_name="Tatolab Runtime.app"
marker_file_name="machine-directories-under-a-test-root"
streamlib_commit_file_name="streamlib-commit"
lend_source="$runtime_unit_directory/lib/tatolab/lend"
watch_page_source="$runtime_unit_directory/lib/tatolab/watch"
lent_runtime_package_relative_to_the_lend="tatolab/runtime"
processor_interpreter_python_versions=(3.10 3.11 3.12 3.13 3.14)

contents="$app_bundle/Contents"
[ -x "$contents/MacOS/Tatolab" ] || { echo "$app_bundle has no Contents/MacOS/Tatolab: not a packaged Tatolab.app" >&2; exit 1; }
[ -f "$streamlib_installer" ] || { echo "no streamlib installer at $streamlib_installer" >&2; exit 1; }
for required in bin/tatolabd bin/tatolab bin/moq-relay bin/uv "lib/tatolab/lend/$lent_runtime_package_relative_to_the_lend" lib/tatolab/watch/index.html; do
  [ -e "$runtime_unit_directory/$required" ] || { echo "runtime unit $runtime_unit_directory is missing $required" >&2; exit 1; }
done
# Anything streamlib adds to the unit would otherwise be left out of the bundle without a word.
for runtime_unit_entry in "$runtime_unit_directory"/bin/* "$runtime_unit_directory"/lib/tatolab/*; do
  case "${runtime_unit_entry#"$runtime_unit_directory/"}" in
    bin/tatolabd|bin/tatolab|bin/moq-relay|bin/uv|lib/tatolab/lend|lib/tatolab/watch) ;;
    *) echo "runtime unit $runtime_unit_directory ships ${runtime_unit_entry#"$runtime_unit_directory/"}, which this script does not place in the bundle" >&2; exit 1 ;;
  esac
done
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

[ -x "$python_toolchain_directory/uv" ] || { echo "python toolchain $python_toolchain_directory has no uv" >&2; exit 1; }
built_in_python_folders=()
while IFS= read -r -d '' built_in_python_folder; do
  built_in_python_folders+=("$built_in_python_folder")
done < <(find "$python_toolchain_directory/python" -mindepth 1 -maxdepth 1 -type d -name 'cpython-*' -print0 2>/dev/null)
[ "${#built_in_python_folders[@]}" -eq 1 ] || {
  echo "python toolchain $python_toolchain_directory holds ${#built_in_python_folders[@]} built-in Pythons under python/, not one" >&2
  exit 1
}
built_in_python_source="${built_in_python_folders[0]}"
built_in_python_folder_name="$(basename "$built_in_python_source")"
[ -x "$built_in_python_source/bin/python3" ] || { echo "the built-in Python $built_in_python_source has no bin/python3" >&2; exit 1; }

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
mkdir -p "$helper_contents/MacOS" "$helper_contents/Frameworks/tatolab-runtime" "$helper_contents/Resources" \
  "$contents/Frameworks/tatolab-python" "$contents/Resources/python"

app_version="$(plutil -extract CFBundleShortVersionString raw -o - "$contents/Info.plist")"
cp "$runtime_helper_info_plist_template" "$helper_contents/Info.plist"
plutil -replace CFBundleShortVersionString -string "$app_version" "$helper_contents/Info.plist"
plutil -replace CFBundleVersion -string "$app_version" "$helper_contents/Info.plist"
plutil -lint -s "$helper_contents/Info.plist"

install -m 0755 "$runtime_unit_directory/bin/tatolabd" "$helper_contents/MacOS/tatolabd"
install -m 0755 "$runtime_unit_directory/bin/tatolab" "$helper_contents/MacOS/tatolab-cli"
install -m 0755 "$runtime_unit_directory/bin/moq-relay" "$helper_contents/MacOS/moq-relay"
install -m 0755 "$runtime_unit_directory/bin/uv" "$helper_contents/MacOS/uv"

ditto "$lend_source" "$helper_contents/Resources/lend"
ditto "$watch_page_source" "$helper_contents/Resources/watch"
cp "$runtime_unit_directory/$streamlib_commit_file_name" "$helper_contents/Resources/$streamlib_commit_file_name"
find "$helper_contents/Resources/lend" -name __pycache__ -type d -prune -exec rm -rf {} +
install -m 0755 "$streamlib_installer" "$contents/Resources/install.sh"

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

install -m 0755 "$python_toolchain_directory/uv" "$contents/MacOS/uv"
ditto "$built_in_python_source" "$contents/Resources/python/$built_in_python_folder_name"
relocated_python_mach_o_count=0
while IFS= read -r -d '' built_in_python_file; do
  is_mach_o "$built_in_python_file" || continue
  path_in_the_python="${built_in_python_file#"$contents/Resources/python/"}"
  flat_name_in_frameworks="${path_in_the_python//\//__}"
  framework_copy="$contents/Frameworks/tatolab-python/$flat_name_in_frameworks"
  mv "$built_in_python_file" "$framework_copy"
  ln -s "$(relative_path_from_contents_link "Resources/python/$path_in_the_python" \
    "Frameworks/tatolab-python/$flat_name_in_frameworks")" "$built_in_python_file"
  [ -f "$built_in_python_file" ] || { echo "the link at $built_in_python_file does not resolve" >&2; exit 1; }
  relocated_python_mach_o_count=$((relocated_python_mach_o_count + 1))
done < <(find "$contents/Resources/python/$built_in_python_folder_name" -type f -print0)
[ "$relocated_python_mach_o_count" -gt 0 ] || { echo "the built-in Python carried no Mach-O: is $built_in_python_source a macOS build?" >&2; exit 1; }

if $local_proof_test_root; then
  cp "$runtime_unit_directory/$marker_file_name" "$helper_contents/Resources/$marker_file_name"
fi

echo "assembled $app_bundle from streamlib $resolved_streamlib_commit: $runtime_helper_bundle_name with tatolabd, tatolab-cli, moq-relay, uv, $relocated_mach_o_count Mach-O in Frameworks/tatolab-runtime, lend in Resources/lend (bytecode for CPython ${processor_interpreter_python_versions[*]}) and the preview page; the app's uv, $built_in_python_folder_name with $relocated_python_mach_o_count Mach-O in Frameworks/tatolab-python, and install.sh$($local_proof_test_root && echo ' (local proof)')"
