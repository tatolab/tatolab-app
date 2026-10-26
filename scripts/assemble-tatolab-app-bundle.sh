#!/usr/bin/env bash
# Lays streamlib's runtime unit into a Tatolab.app that @electron/packager produced:
#   Contents/MacOS/tatolabd, Contents/MacOS/tatolab-cli  the runtime and the CLI (bin/tatolab: the
#                                                         filesystem is case-insensitive, so "tatolab"
#                                                         would replace the app's own "Tatolab")
#   Contents/MacOS/moq-relay                              the local relay, which tatolabd runs from
#                                                         beside itself as two children
#   Contents/Frameworks/tatolab-runtime/<path>            every Mach-O of lend/tatolab/runtime
#   Contents/Resources/lend/                              the lend, each Mach-O a relative symlink
#                                                         into Frameworks/tatolab-runtime, precompiled
#                                                         for CPython 3.10-3.14
#   Contents/Resources/watch/                             the preview page tatolabd serves on its
#                                                         loopback HTTP (lib/tatolab/watch)
#   Contents/Library/LaunchAgents/com.tatolab.tatolabd.plist
#   Contents/Resources/streamlib-commit                   the streamlib commit the runtime was built from
#   Contents/MacOS/uv                                     the uv the app makes a project's .venv with
#   Contents/Frameworks/tatolab-python/<cpython-…>/<path> every Mach-O of the built-in Python
#   Contents/Resources/python/<cpython-…>/                the built-in Python, each Mach-O a relative
#                                                         symlink into Frameworks/tatolab-python
# Code signing requires code under MacOS/ or Frameworks/; the lend and the built-in Python keep
# their shape through the links, which the app follows when it copies the Python out.
#
# Usage: assemble-tatolab-app-bundle.sh <Tatolab.app> <runtime unit dir> --streamlib-commit SHA
#                                      --python-toolchain DIR [--local-proof-test-root]
#   --streamlib-commit SHA   the streamlib commit the build resolved; the unit's streamlib-commit
#                            must name it
#   --python-toolchain DIR   uv and the built-in Python, as fetch-python-toolchain-for-the-app-build.sh
#                            lays them out
#   --local-proof-test-root  the unit must carry the machine-directories-under-a-test-root marker;
#                            the agent gets TATOLAB_TEST_MACHINE_ROOT=/tmp/tatolab-proof and the
#                            test ports its local relay and loopback HTTP bind (14443, 14445,
#                            14446), without which a test build runs neither
set -euo pipefail

usage() { awk '/^# Usage:/{p=1} p&&/^#/{sub(/^# ?/,""); print; next} p{exit}' "$0" >&2; exit 2; }
[ $# -ge 2 ] || usage
app_bundle="$(cd "$1" && pwd)"
runtime_unit_directory="$(cd "$2" && pwd)"
shift 2
local_proof_test_root=false
resolved_streamlib_commit=""
python_toolchain_directory=""
while [ $# -gt 0 ]; do
  case "$1" in
    --streamlib-commit) [ $# -ge 2 ] || usage; resolved_streamlib_commit="$2"; shift ;;
    --python-toolchain) [ $# -ge 2 ] || usage; python_toolchain_directory="$2"; shift ;;
    --local-proof-test-root) local_proof_test_root=true ;;
    *) usage ;;
  esac
  shift
done
[[ "$resolved_streamlib_commit" =~ ^[0-9a-f]{40}$ ]] || usage
[ -n "$python_toolchain_directory" ] || usage

repository_root="$(cd "$(dirname "$0")/.." && pwd)"
launch_agent_template="$repository_root/packaging/launch-agent/com.tatolab.tatolabd.plist"
local_proof_test_machine_root="/tmp/tatolab-proof"
# The app's local-proof build reads the preview page at LOCAL_PROOF_RUNTIME_LOOPBACK_HTTP_PORT
# (src/main/runtime_loopback_watch_page.ts); the relay ports sit beside the runtime's own
# 4443 and 4445 so a proof runtime never binds the machine's.
local_proof_test_local_relay_loopback_port=14443
local_proof_test_local_relay_every_interface_port=14445
local_proof_test_loopback_http_port=14446
marker_file_name="machine-directories-under-a-test-root"
streamlib_commit_file_name="streamlib-commit"
lend_source="$runtime_unit_directory/lib/tatolab/lend"
watch_page_source="$runtime_unit_directory/lib/tatolab/watch"
lent_runtime_package_relative_to_the_lend="tatolab/runtime"
processor_interpreter_python_versions=(3.10 3.11 3.12 3.13 3.14)

contents="$app_bundle/Contents"
[ -x "$contents/MacOS/Tatolab" ] || { echo "$app_bundle has no Contents/MacOS/Tatolab: not a packaged Tatolab.app" >&2; exit 1; }
for required in bin/tatolabd bin/tatolab bin/moq-relay "lib/tatolab/lend/$lent_runtime_package_relative_to_the_lend" lib/tatolab/watch/index.html; do
  [ -e "$runtime_unit_directory/$required" ] || { echo "runtime unit $runtime_unit_directory is missing $required" >&2; exit 1; }
done
# Anything streamlib adds to the unit would otherwise be left out of the bundle without a word.
for runtime_unit_entry in "$runtime_unit_directory"/bin/* "$runtime_unit_directory"/lib/tatolab/*; do
  case "${runtime_unit_entry#"$runtime_unit_directory/"}" in
    bin/tatolabd|bin/tatolab|bin/moq-relay|lib/tatolab/lend|lib/tatolab/watch) ;;
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

rm -rf "$contents/Frameworks/tatolab-runtime" "$contents/Resources/lend" "$contents/Resources/watch" \
  "$contents/Library/LaunchAgents/com.tatolab.tatolabd.plist" "$contents/Resources/$marker_file_name" \
  "$contents/Resources/$streamlib_commit_file_name" \
  "$contents/MacOS/tatolabd" "$contents/MacOS/tatolab-cli" "$contents/MacOS/moq-relay" \
  "$contents/MacOS/uv" "$contents/Frameworks/tatolab-python" "$contents/Resources/python"
mkdir -p "$contents/Frameworks/tatolab-runtime" "$contents/Frameworks/tatolab-python" "$contents/Resources/python" \
  "$contents/Resources" "$contents/Library/LaunchAgents"

install -m 0755 "$runtime_unit_directory/bin/tatolabd" "$contents/MacOS/tatolabd"
install -m 0755 "$runtime_unit_directory/bin/tatolab" "$contents/MacOS/tatolab-cli"
install -m 0755 "$runtime_unit_directory/bin/moq-relay" "$contents/MacOS/moq-relay"

ditto "$lend_source" "$contents/Resources/lend"
ditto "$watch_page_source" "$contents/Resources/watch"
cp "$runtime_unit_directory/$streamlib_commit_file_name" "$contents/Resources/$streamlib_commit_file_name"
find "$contents/Resources/lend" -name __pycache__ -type d -prune -exec rm -rf {} +

relocated_mach_o_count=0
while IFS= read -r -d '' lend_file; do
  is_mach_o "$lend_file" || continue
  path_in_the_lend="${lend_file#"$contents/Resources/lend/"}"
  case "$path_in_the_lend" in
    "$lent_runtime_package_relative_to_the_lend"/*) ;;
    *) echo "Mach-O outside lend/$lent_runtime_package_relative_to_the_lend: $path_in_the_lend" >&2; exit 1 ;;
  esac
  path_in_the_runtime_package="${path_in_the_lend#"$lent_runtime_package_relative_to_the_lend/"}"
  framework_copy="$contents/Frameworks/tatolab-runtime/$path_in_the_runtime_package"
  mkdir -p "$(dirname "$framework_copy")"
  mv "$lend_file" "$framework_copy"
  ln -s "$(relative_path_from_contents_link "Resources/lend/$path_in_the_lend" \
    "Frameworks/tatolab-runtime/$path_in_the_runtime_package")" "$lend_file"
  [ -f "$lend_file" ] || { echo "the link at $lend_file does not resolve" >&2; exit 1; }
  relocated_mach_o_count=$((relocated_mach_o_count + 1))
done < <(find "$contents/Resources/lend" -type f -print0)
[ "$relocated_mach_o_count" -gt 0 ] || { echo "the lend carried no Mach-O: is $runtime_unit_directory a macOS unit?" >&2; exit 1; }

# Processor interpreters (the user's venv Python) import tatolab.runtime from this lend with every
# PYTHON* variable stripped, so a missing .pyc would be written into the signed bundle, breaking its
# seal. unchecked-hash bytecode is never revalidated against the source, so it is never rewritten.
for python_version in "${processor_interpreter_python_versions[@]}"; do
  uv run --no-project --python "$python_version" python -m compileall -q --invalidation-mode unchecked-hash \
    "$contents/Resources/lend"
done

install -m 0755 "$python_toolchain_directory/uv" "$contents/MacOS/uv"
ditto "$built_in_python_source" "$contents/Resources/python/$built_in_python_folder_name"
relocated_python_mach_o_count=0
while IFS= read -r -d '' built_in_python_file; do
  is_mach_o "$built_in_python_file" || continue
  path_in_the_python="${built_in_python_file#"$contents/Resources/python/"}"
  framework_copy="$contents/Frameworks/tatolab-python/$path_in_the_python"
  mkdir -p "$(dirname "$framework_copy")"
  mv "$built_in_python_file" "$framework_copy"
  ln -s "$(relative_path_from_contents_link "Resources/python/$path_in_the_python" \
    "Frameworks/tatolab-python/$path_in_the_python")" "$built_in_python_file"
  [ -f "$built_in_python_file" ] || { echo "the link at $built_in_python_file does not resolve" >&2; exit 1; }
  relocated_python_mach_o_count=$((relocated_python_mach_o_count + 1))
done < <(find "$contents/Resources/python/$built_in_python_folder_name" -type f -print0)
[ "$relocated_python_mach_o_count" -gt 0 ] || { echo "the built-in Python carried no Mach-O: is $built_in_python_source a macOS build?" >&2; exit 1; }

launch_agent_plist="$contents/Library/LaunchAgents/com.tatolab.tatolabd.plist"
cp "$launch_agent_template" "$launch_agent_plist"
if $local_proof_test_root; then
  plutil -insert EnvironmentVariables -json \
    "{\"TATOLAB_TEST_MACHINE_ROOT\":\"$local_proof_test_machine_root\",\"TATOLAB_TEST_LOCAL_RELAY_LOOPBACK_PORT\":\"$local_proof_test_local_relay_loopback_port\",\"TATOLAB_TEST_LOCAL_RELAY_EVERY_INTERFACE_PORT\":\"$local_proof_test_local_relay_every_interface_port\",\"TATOLAB_TEST_LOOPBACK_HTTP_PORT\":\"$local_proof_test_loopback_http_port\"}" "$launch_agent_plist"
  cp "$runtime_unit_directory/$marker_file_name" "$contents/Resources/$marker_file_name"
fi
plutil -lint -s "$launch_agent_plist"

echo "assembled $app_bundle from streamlib $resolved_streamlib_commit: tatolabd, tatolab-cli, moq-relay, $relocated_mach_o_count Mach-O in Frameworks/tatolab-runtime, lend in Resources/lend (bytecode for CPython ${processor_interpreter_python_versions[*]}), preview page in Resources/watch, uv, $built_in_python_folder_name with $relocated_python_mach_o_count Mach-O in Frameworks/tatolab-python$($local_proof_test_root && echo ' (local proof, test root '"$local_proof_test_machine_root"')')"
