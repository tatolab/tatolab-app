#!/usr/bin/env bash
# Copyright (c) 2025 Jonathan Fontanez
# SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary
#
# Renders the installer window's background at 1x and 2x from its SVG, in Instrument Sans from the
# @fontsource/instrument-sans package, fetched with npm pack. The PNGs are committed; rerun this after
# editing the SVG.
set -euo pipefail
dmg_directory="$(cd "$(dirname "$0")" && pwd)"
instrument_sans_package="@fontsource/instrument-sans@5.3.0"
command -v rsvg-convert >/dev/null || { echo "rsvg-convert is required (brew install librsvg)" >&2; exit 1; }

font_scratch_directory="$(mktemp -d)"
trap 'rm -rf "$font_scratch_directory"' EXIT
instrument_sans_tarball="$(cd "$font_scratch_directory" && npm pack --silent "$instrument_sans_package")"
tar -xzf "$font_scratch_directory/$instrument_sans_tarball" -C "$font_scratch_directory"
cp "$font_scratch_directory"/package/files/instrument-sans-latin-{500,600}-normal.woff "$font_scratch_directory/"
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
