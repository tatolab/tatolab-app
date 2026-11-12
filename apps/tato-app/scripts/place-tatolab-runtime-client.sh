#!/usr/bin/env bash
# Places streamlib's generated TypeScript control client, @tatolab/runtime-client, at the
# workspace's node_modules/@tatolab/runtime-client, which the main process is type-checked and
# bundled against. By default it is streamlib's sdk/tatolab-runtime-client/ at the commit
# apps/tato-app/tatolab-runtime-client-pin.json names, fetched once and kept while the pin holds.
# With --from-runtime-unit, a packaged build puts the copy the runtime unit it bundles carries in
# its place, refused when that copy serves another contract version than the pinned one, or when
# the unit was built from a streamlib that does not contain the pinned commit: within one contract
# version a later streamlib adds operations, which an older runtime answers as unknown.
#
# Usage: place-tatolab-runtime-client.sh [--from-runtime-unit DIR] [--from-repository URL]
#   --from-runtime-unit DIR  place DIR/lib/tatolab/runtime-client/ instead of the pinned copy
#   --from-repository URL    fetch from URL instead of https://github.com/tatolab/streamlib.git; for
#                            the tests, which fetch from a planted repository
# Exits 3 when streamlib cannot be reached.
set -euo pipefail

usage() { awk '/^# Usage:/{p=1} p&&/^#/{sub(/^# ?/,""); print; next} p{exit}' "$0" >&2; exit 2; }
runtime_unit_directory=""
streamlib_repository_url="https://github.com/tatolab/streamlib.git"
while [ $# -gt 0 ]; do
  case "$1" in
    --from-runtime-unit) [ $# -ge 2 ] || usage; runtime_unit_directory="$2"; shift ;;
    --from-repository) [ $# -ge 2 ] || usage; streamlib_repository_url="$2"; shift ;;
    *) usage ;;
  esac
  shift
done

tato_app_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
workspace_root="$(cd "$tato_app_root/../.." && pwd)"
pin_file="$tato_app_root/tatolab-runtime-client-pin.json"
placed_package="$workspace_root/node_modules/@tatolab/runtime-client"
placed_from_marker="$placed_package/.placed-from"

pinned_streamlib_commit="$(node -e 'const pin = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); process.stdout.write(pin.streamlib_commit ?? "")' "$pin_file")"
[[ "$pinned_streamlib_commit" =~ ^[0-9a-f]{40}$ ]] || { echo "$pin_file names no full streamlib commit: $pinned_streamlib_commit" >&2; exit 1; }

contract_version_of() {
  node -e 'const contract = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); process.stdout.write(String(contract.info?.["x-contract-version"] ?? ""))' "$1/contract.json"
}

# Copies the package files package.json lists, and package.json, from $1 to the placed package.
place_package_files_from() {
  local source_package="$1" placed_from="$2" staged_package="$placed_package.staged"
  rm -rf "$staged_package"
  mkdir -p "$staged_package"
  cp "$source_package/package.json" "$staged_package/"
  while IFS= read -r package_file; do
    [ -f "$source_package/$package_file" ] || { echo "$source_package lists $package_file in package.json but does not hold it" >&2; exit 1; }
    cp "$source_package/$package_file" "$staged_package/"
  done < <(node -e 'for (const file of JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).files) console.log(file)' "$source_package/package.json")
  printf '%s\n' "$placed_from" > "$staged_package/.placed-from"
  rm -rf "$placed_package"
  mv "$staged_package" "$placed_package"
}

place_the_pinned_package() {
  [ "$(cat "$placed_from_marker" 2>/dev/null)" = "streamlib $pinned_streamlib_commit" ] && return 0
  local fetch_directory
  fetch_directory="$(mktemp -d)"
  trap 'rm -rf "$fetch_directory"' RETURN
  git -C "$fetch_directory" init -q
  git -C "$fetch_directory" fetch -q --depth 1 "$streamlib_repository_url" "$pinned_streamlib_commit" 2>/dev/null \
    || { echo "streamlib $pinned_streamlib_commit could not be fetched from $streamlib_repository_url" >&2; exit 3; }
  git -C "$fetch_directory" -c advice.detachedHead=false checkout -q FETCH_HEAD -- sdk/tatolab-runtime-client
  place_package_files_from "$fetch_directory/sdk/tatolab-runtime-client" "streamlib $pinned_streamlib_commit"
}

# Exits 0 when streamlib $2 contains $1, 1 when it does not, 3 when $2 cannot be fetched. Only
# commits are fetched (`tree:0`), so the whole history the check walks stays small.
streamlib_commit_contains_the_pin() {
  local pinned_commit="$1" unit_commit="$2" ancestry_directory
  ancestry_directory="$(mktemp -d)"
  trap 'rm -rf "$ancestry_directory"' RETURN
  git -C "$ancestry_directory" init -q
  git -C "$ancestry_directory" fetch -q --filter=tree:0 "$streamlib_repository_url" "$unit_commit" 2>/dev/null || return 3
  git -C "$ancestry_directory" merge-base --is-ancestor "$pinned_commit" "$unit_commit" 2>/dev/null || return 1
}

place_the_pinned_package
if [ -n "$runtime_unit_directory" ]; then
  unit_package="$runtime_unit_directory/lib/tatolab/runtime-client"
  [ -f "$unit_package/package.json" ] || { echo "runtime unit $runtime_unit_directory carries no lib/tatolab/runtime-client" >&2; exit 1; }
  pinned_contract_version="$(contract_version_of "$placed_package")"
  unit_contract_version="$(contract_version_of "$unit_package")"
  [ "$unit_contract_version" = "$pinned_contract_version" ] || {
    echo "runtime unit $runtime_unit_directory serves control contract version $unit_contract_version; Tato Studio is pinned to version $pinned_contract_version (streamlib $pinned_streamlib_commit in $pin_file)" >&2
    exit 1
  }
  unit_streamlib_commit="$(cat "$runtime_unit_directory/streamlib-commit" 2>/dev/null || true)"
  [[ "$unit_streamlib_commit" =~ ^[0-9a-f]{40}$ ]] \
    || { echo "runtime unit $runtime_unit_directory names no streamlib commit it was built from in streamlib-commit" >&2; exit 1; }
  ancestry_status=0
  streamlib_commit_contains_the_pin "$pinned_streamlib_commit" "$unit_streamlib_commit" || ancestry_status=$?
  case "$ancestry_status" in
    0) ;;
    3) echo "streamlib $unit_streamlib_commit, which runtime unit $runtime_unit_directory was built from, could not be fetched from $streamlib_repository_url" >&2; exit 3 ;;
    *) echo "runtime unit $runtime_unit_directory was built from streamlib $unit_streamlib_commit, which does not contain streamlib $pinned_streamlib_commit that Tato Studio is pinned to in $pin_file: the runtime is older than the one the app's code calls" >&2; exit 1 ;;
  esac
  place_package_files_from "$unit_package" "runtime unit $runtime_unit_directory"
fi
echo "$placed_package: $(cat "$placed_from_marker")"
