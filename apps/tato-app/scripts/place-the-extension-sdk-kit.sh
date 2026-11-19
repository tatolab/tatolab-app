#!/usr/bin/env bash
# Places the extension SDK kit this app's SDK build wrote (packages/tato-app-view-sdk/dist/kit/)
# beside the lend of the runtime the app carries, where that runtime finds it first, so a project's
# views and controls are checked against the declarations this Studio draws them with. The kit is
# data: a file of it that is a link, executable, or native code is refused, so nothing placed is
# ever signed as code. Without a destination, it only checks the kit.
#
# Usage: place-the-extension-sdk-kit.sh <kit dir> [<destination dir>]
#   <kit dir>          the kit the SDK's build wrote
#   <destination dir>  where it is placed, replacing what is there: the helper's
#                      Contents/Resources/extension-sdk on macOS, the carried unit's
#                      lib/tatolab/extension-sdk on Linux
set -euo pipefail

usage() { awk '/^# Usage:/{p=1} p&&/^#/{sub(/^# ?/,""); print; next} p{exit}' "$0" >&2; exit 2; }
[ $# -ge 1 ] && [ $# -le 2 ] || usage
kit_directory="$1"
destination_directory="${2:-}"
kit_package_name="@tatolab/tato-app-view-sdk"

[ -d "$kit_directory" ] || { echo "there is no extension SDK kit at $kit_directory: build the SDK with npm run build first" >&2; exit 1; }
kit_directory="$(cd "$kit_directory" && pwd)"
# The parts the runtime looks for before it takes a folder as a kit.
for kit_part in package.json check_folder/tsconfig.json tie_lines.json oxlint.json tsconfig.preset.json; do
  [ -f "$kit_directory/$kit_part" ] || { echo "the extension SDK kit at $kit_directory holds no $kit_part" >&2; exit 1; }
done
kit_package="$(node -e 'const manifest = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8")); process.stdout.write(`${manifest.name ?? ""} ${manifest.version ?? ""}`)' "$kit_directory/package.json")"
[[ "$kit_package" =~ ^"$kit_package_name "[0-9]+\.[0-9]+\.[0-9]+ ]] \
  || { echo "the extension SDK kit at $kit_directory names '$kit_package' in its package.json, not $kit_package_name at a version" >&2; exit 1; }
while IFS= read -r -d '' kit_entry; do
  kit_entry_in_the_kit="${kit_entry#"$kit_directory/"}"
  if [ -L "$kit_entry" ]; then
    echo "the extension SDK kit at $kit_directory holds the link $kit_entry_in_the_kit; the kit is placed as plain files" >&2
    exit 1
  fi
  [ -f "$kit_entry" ] || continue
  if [ -x "$kit_entry" ] || [[ "$(file -b "$kit_entry")" =~ ^(ELF|Mach-O) ]]; then
    echo "the extension SDK kit at $kit_directory holds $kit_entry_in_the_kit, which is code; the kit is data, never signed as code" >&2
    exit 1
  fi
done < <(find "$kit_directory" -mindepth 1 -print0)

[ -n "$destination_directory" ] || { echo "the extension SDK kit at $kit_directory is $kit_package"; exit 0; }
staged_destination="$destination_directory.staged"
rm -rf "$staged_destination"
mkdir -p "$(dirname "$destination_directory")"
cp -R "$kit_directory" "$staged_destination"
chmod -R u+rwX,go+rX,go-w "$staged_destination"
rm -rf "$destination_directory"
mv "$staged_destination" "$destination_directory"
echo "placed the extension SDK kit, $kit_package, at $destination_directory"
