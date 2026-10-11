#!/usr/bin/env bash
# Lays streamlib's runtime unit into a Tatolab.app that `tauri build` produced:
#   Contents/MacOS/tatolabd, Contents/MacOS/tatolab-cli  the runtime and the CLI (bin/tatolab: the
#                                                         filesystem is case-insensitive, so "tatolab"
#                                                         would replace the app's own "Tatolab")
#   Contents/Frameworks/tatolab-runtime/<path>            every Mach-O of lend/tatolab/runtime
#   Contents/Resources/lend/                              the lend, each Mach-O a relative symlink
#                                                         into Frameworks/tatolab-runtime
#   Contents/Library/LaunchAgents/com.tatolab.tatolabd.plist
# Code signing requires code under MacOS/ or Frameworks/; the lend keeps its shape through the links.
#
# Usage: assemble-tatolab-app-bundle.sh <Tatolab.app> <runtime unit dir> [--local-proof-test-root]
#   --local-proof-test-root  the unit must carry the machine-directories-under-a-test-root marker;
#                            the agent gets TATOLAB_TEST_MACHINE_ROOT=/tmp/tatolab-proof
set -euo pipefail

usage() { awk '/^# Usage:/{p=1} p&&/^#/{sub(/^# ?/,""); print; next} p{exit}' "$0" >&2; exit 2; }
[ $# -ge 2 ] || usage
app_bundle="$(cd "$1" && pwd)"
runtime_unit_directory="$(cd "$2" && pwd)"
shift 2
local_proof_test_root=false
while [ $# -gt 0 ]; do
  case "$1" in
    --local-proof-test-root) local_proof_test_root=true ;;
    *) usage ;;
  esac
  shift
done

repository_root="$(cd "$(dirname "$0")/.." && pwd)"
launch_agent_template="$repository_root/packaging/launch-agent/com.tatolab.tatolabd.plist"
local_proof_test_machine_root="/tmp/tatolab-proof"
marker_file_name="machine-directories-under-a-test-root"
lend_source="$runtime_unit_directory/lib/tatolab/lend"
lent_runtime_package_relative_to_the_lend="tatolab/runtime"

contents="$app_bundle/Contents"
[ -x "$contents/MacOS/Tatolab" ] || { echo "$app_bundle has no Contents/MacOS/Tatolab: not a tauri-built Tatolab.app" >&2; exit 1; }
for required in bin/tatolabd bin/tatolab "lib/tatolab/lend/$lent_runtime_package_relative_to_the_lend"; do
  [ -e "$runtime_unit_directory/$required" ] || { echo "runtime unit $runtime_unit_directory is missing $required" >&2; exit 1; }
done
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

rm -rf "$contents/Frameworks/tatolab-runtime" "$contents/Resources/lend" \
  "$contents/Library/LaunchAgents/com.tatolab.tatolabd.plist" "$contents/Resources/$marker_file_name" \
  "$contents/MacOS/tatolabd" "$contents/MacOS/tatolab-cli"
mkdir -p "$contents/Frameworks/tatolab-runtime" "$contents/Resources" "$contents/Library/LaunchAgents"

install -m 0755 "$runtime_unit_directory/bin/tatolabd" "$contents/MacOS/tatolabd"
install -m 0755 "$runtime_unit_directory/bin/tatolab" "$contents/MacOS/tatolab-cli"

ditto "$lend_source" "$contents/Resources/lend"
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

launch_agent_plist="$contents/Library/LaunchAgents/com.tatolab.tatolabd.plist"
cp "$launch_agent_template" "$launch_agent_plist"
if $local_proof_test_root; then
  plutil -insert EnvironmentVariables -json \
    "{\"TATOLAB_TEST_MACHINE_ROOT\":\"$local_proof_test_machine_root\"}" "$launch_agent_plist"
  cp "$runtime_unit_directory/$marker_file_name" "$contents/Resources/$marker_file_name"
fi
plutil -lint -s "$launch_agent_plist"

echo "assembled $app_bundle: tatolabd, tatolab-cli, $relocated_mach_o_count Mach-O in Frameworks/tatolab-runtime, lend in Resources/lend$($local_proof_test_root && echo ' (local proof, test root '"$local_proof_test_machine_root"')')"
