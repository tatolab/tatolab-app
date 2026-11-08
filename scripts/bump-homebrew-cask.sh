#!/usr/bin/env bash
# Writes Casks/tato-studio.rb in a homebrew-tap checkout for a released Tato Studio .dmg, and
# the tap's cask_renames.json entry that moves a `tatolab` cask install to it on `brew upgrade`.
#
# Usage: bump-homebrew-cask.sh <version> <Tato-Studio-<version>-arm64.dmg> <tap checkout>
#   version  without the leading v, e.g. 0.45.0; the dmg must already be on tatolab-app's v<version>
#            release, where the cask's url points
set -euo pipefail

usage() { awk '/^# Usage:/{p=1} p&&/^#/{sub(/^# ?/,""); print; next} p{exit}' "$0" >&2; exit 2; }
[ $# -eq 3 ] || usage
cask_version="${1#v}"
released_dmg="$2"
tap_checkout="$3"
repository_root="$(cd "$(dirname "$0")/.." && pwd)"
cask_template="$repository_root/packaging/homebrew/tato-studio.rb.template"

[[ "$cask_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z.-]+)?$ ]] || { echo "not a version: $1" >&2; exit 1; }
[ -f "$released_dmg" ] || { echo "no such dmg: $released_dmg" >&2; exit 1; }
[ "$(basename "$released_dmg")" = "Tato-Studio-$cask_version-arm64.dmg" ] \
  || { echo "expected Tato-Studio-$cask_version-arm64.dmg, got $(basename "$released_dmg")" >&2; exit 1; }
[ -d "$tap_checkout" ] || { echo "no such tap checkout: $tap_checkout" >&2; exit 1; }

released_dmg_sha256="$(shasum -a 256 "$released_dmg" | cut -d' ' -f1)"
mkdir -p "$tap_checkout/Casks"
sed -e "s/@VERSION@/$cask_version/" -e "s/@SHA256@/$released_dmg_sha256/" "$cask_template" \
  > "$tap_checkout/Casks/tato-studio.rb"
rm -f "$tap_checkout/Casks/tatolab.rb"
# Homebrew reads a tap's cask_renames.json to carry an install of the old token to the new one.
cask_renames="$tap_checkout/cask_renames.json"
[ -f "$cask_renames" ] || echo '{}' > "$cask_renames"
node -e 'const fs = require("node:fs"); const renames = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); renames.tatolab = "tato-studio"; fs.writeFileSync(process.argv[1], `${JSON.stringify(renames, null, 2)}\n`);' "$cask_renames"
echo "wrote $tap_checkout/Casks/tato-studio.rb: version $cask_version, sha256 $released_dmg_sha256, and tatolab -> tato-studio in $cask_renames"
