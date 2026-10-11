#!/usr/bin/env bash
# Renders the installer window's background at 1x and 2x from its SVG, in Instrument Sans from the
# app's own @fontsource dependency. The PNGs are committed; rerun this after editing the SVG.
set -euo pipefail
dmg_directory="$(cd "$(dirname "$0")" && pwd)"
repository_root="$(cd "$dmg_directory/../.." && pwd)"
fontsource_directory="$repository_root/node_modules/@fontsource/instrument-sans/files"
command -v rsvg-convert >/dev/null || { echo "rsvg-convert is required (brew install librsvg)" >&2; exit 1; }
[ -d "$fontsource_directory" ] || { echo "run npm ci first: $fontsource_directory is missing" >&2; exit 1; }

font_scratch_directory="$(mktemp -d)"
trap 'rm -rf "$font_scratch_directory"' EXIT
cp "$fontsource_directory"/instrument-sans-latin-{500,600}-normal.woff "$font_scratch_directory/"
system_fontconfig="$(brew --prefix 2>/dev/null || echo /opt/homebrew)/etc/fonts/fonts.conf"
cat > "$font_scratch_directory/fonts.conf" <<CONF
<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <dir>$font_scratch_directory</dir>
  <include ignore_missing="yes">$system_fontconfig</include>
  <cachedir>$font_scratch_directory/cache</cachedir>
</fontconfig>
CONF

export FONTCONFIG_FILE="$font_scratch_directory/fonts.conf"
source_svg="$dmg_directory/tatolab-dmg-background.svg"
rsvg-convert --width 660 --height 420 "$source_svg" -o "$dmg_directory/tatolab-dmg-background.png"
rsvg-convert --width 1320 --height 840 "$source_svg" -o "$dmg_directory/tatolab-dmg-background@2x.png"
echo "rendered $dmg_directory/tatolab-dmg-background{,@2x}.png"
