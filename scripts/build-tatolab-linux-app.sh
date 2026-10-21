#!/usr/bin/env bash
# Copyright (c) 2025 Jonathan Fontanez
# SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary
#
# Builds Tatolab for Linux: the .deb and the AppImage of the Electron window and tray over the
# runtime's systemd user service. Neither carries a runtime; the installer
# (curl -fsSL https://get.tatolab.com/install.sh | sh) installs the runtime and its service.
# Outputs build/linux/Tatolab-<version>-amd64.deb, build/linux/Tatolab-<version>-x86_64.AppImage,
# and the update feed's manifest listing both, build/linux/latest-linux.yml.
#
# Usage: build-tatolab-linux-app.sh [--app-version X.Y.Z] [--local-proof-test-root]
#                                   [--app-update-feed-url URL]
#   --app-version X.Y.Z      the packages' version (default: package.json's); a release passes
#                            the streamlib release they go beside
#   --local-proof-test-root  read the runtime under TATOLAB_TEST_MACHINE_ROOT=/tmp/tatolab-proof;
#                            for proving on a development machine, never shipped
#   --app-update-feed-url URL  the feed the app checks for updates (default: get.tatolab.com's);
#                            only with --local-proof-test-root, for proving an update locally
set -euo pipefail

usage() { awk '/^# Usage:/{p=1} p&&/^#/{sub(/^# ?/,""); print; next} p{exit}' "$0" >&2; exit 2; }
repository_root="$(cd "$(dirname "$0")/.." && pwd)"
app_version=""
local_proof_test_root=false
app_update_feed_url=""
while [ $# -gt 0 ]; do
  case "$1" in
    --app-version) [ $# -ge 2 ] || usage; app_version="${2#v}"; shift ;;
    --local-proof-test-root) local_proof_test_root=true ;;
    --app-update-feed-url) [ $# -ge 2 ] || usage; app_update_feed_url="$2"; shift ;;
    -h|--help) usage ;;
    *) usage ;;
  esac
  shift
done

[ "$(uname -s)" = Linux ] || { echo "this builds the Linux app on Linux; on macOS, scripts/build-tatolab-app.sh builds Tatolab.app" >&2; exit 1; }
case "$(uname -m)" in
  x86_64|amd64) ;;
  *) echo "the Tatolab runtime has only an x86_64 Linux build, so the app is built for x86_64 only, not $(uname -m)" >&2; exit 1 ;;
esac

# appimagetool and the AppImage runtime it prepends, pinned by release and checksum.
appimagetool_url="https://github.com/AppImage/appimagetool/releases/download/1.9.0/appimagetool-x86_64.AppImage"
appimagetool_sha256="46fdd785094c7f6e545b61afcfb0f3d98d8eab243f644b4b17698c01d06083d1"
appimage_runtime_url="https://github.com/AppImage/type2-runtime/releases/download/20251108/runtime-x86_64"
appimage_runtime_sha256="2fca8b443c92510f1483a883f60061ad09b46b978b2631c807cd873a47ec260d"
# Named without versions or t64 suffixes, so one .deb installs on Ubuntu 22.04 and on 24.04, whose
# t64 libraries provide these names. The build checks it covers every library the app links;
# GTK, libnotify and libsecret Electron loads at run time, where dpkg-shlibdeps cannot see them.
electron_package_dependencies=(
  libgtk-3-0 libnotify4 libsecret-1-0 libnss3 libnspr4 libxss1 libxtst6 xdg-utils libatspi2.0-0
  libatk-bridge2.0-0 libatk1.0-0 libuuid1 libasound2 libcairo2 libcups2 libdbus-1-3 libdrm2 libexpat1
  libgbm1 libgcc-s1 libglib2.0-0 libpango-1.0-0 libudev1 libx11-6 libxcb1 libxcomposite1 libxdamage1
  libxext6 libxfixes3 libxkbcommon0 libxrandr2 libc6
)
installed_app_directory="usr/lib/tatolab"
short_description="The window and tray of this machine's Tatolab runtime"
long_description="Tatolab shows the streams this machine's Tatolab runtime holds as they start and stop, each stream's graph and logs, and the Run Tatolab switch, from a window and the tray. It drives the systemd user service tatolabd.service that the Tatolab installer sets up (curl -fsSL https://get.tatolab.com/install.sh | sh); it installs no runtime itself."

for required_tool in dpkg-deb dpkg-shlibdeps desktop-file-validate; do
  command -v "$required_tool" >/dev/null || { echo "$required_tool is missing: sudo apt install dpkg-dev desktop-file-utils" >&2; exit 1; }
done

local_proof_arguments=()
local_proof_name_part=""
if $local_proof_test_root; then
  local_proof_arguments=(--local-proof-test-root)
  local_proof_name_part="-local-proof"
fi
app_update_feed_arguments=()
[ -n "$app_update_feed_url" ] && app_update_feed_arguments=(--app-update-feed-url "$app_update_feed_url")

cd "$repository_root"
if [ -z "$app_version" ]; then
  app_version="$(node -p 'require("./package.json").version')"
fi
[[ "$app_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "not an X.Y.Z app version: $app_version" >&2; exit 1; }
linux_build_directory="$repository_root/build/linux-packaging"
output_directory="$repository_root/build/linux"
output_deb="$output_directory/Tatolab-$app_version$local_proof_name_part-amd64.deb"
output_appimage="$output_directory/Tatolab-$app_version$local_proof_name_part-x86_64.AppImage"
output_update_manifest="$output_directory/latest-linux.yml"
rm -rf "$linux_build_directory"
mkdir -p "$linux_build_directory" "$output_directory"

echo "==> Electron app"
npm ci
npm run build
npm run build:electron
packaged_app_directory="$(node scripts/package_tatolab_electron_app.mjs linux "$app_version" "$linux_build_directory/packaged" ${local_proof_arguments[@]+"${local_proof_arguments[@]}"} ${app_update_feed_arguments[@]+"${app_update_feed_arguments[@]}"} | tail -1)"
[ -x "$packaged_app_directory/Tatolab" ] || { echo "packaging left no $packaged_app_directory/Tatolab" >&2; exit 1; }
[ -f "$packaged_app_directory/chrome-sandbox" ] || { echo "packaging left no $packaged_app_directory/chrome-sandbox" >&2; exit 1; }
# A process could otherwise run the app as plain Node.
electron_fuse_states="$(npx --no-install @electron/fuses read --app "$packaged_app_directory/Tatolab")"
for required_electron_fuse_state in "RunAsNode is Disabled" "EnableNodeOptionsEnvironmentVariable is Disabled" \
  "EnableNodeCliInspectArguments is Disabled" "OnlyLoadAppFromAsar is Enabled"; do
  grep -qF "$required_electron_fuse_state" <<<"$electron_fuse_states" \
    || { echo "the packaged app's Electron fuse is not '$required_electron_fuse_state'" >&2; exit 1; }
done
# The asar stores the main process's modules uncompressed, so the build's feature literal reads as text.
expected_build_features_literal="machineDirectoriesUnderATestRoot: $($local_proof_test_root && echo true || echo false)"
grep -aqF "$expected_build_features_literal" "$packaged_app_directory/resources/app.asar" \
  || { echo "the packaged app was not built with $expected_build_features_literal" >&2; exit 1; }
expected_app_update_feed_literal="appUpdateFeedUrl: \"${app_update_feed_url:-https://get.tatolab.com/app/}\""
grep -aqF "$expected_app_update_feed_literal" "$packaged_app_directory/resources/app.asar" \
  || { echo "the packaged app was not built with $expected_app_update_feed_literal" >&2; exit 1; }
# The asar's header is JSON naming every directory it holds.
grep -aqF '"electron-updater":{"files"' "$packaged_app_directory/resources/app.asar" \
  || { echo "the packaged app carries no electron-updater" >&2; exit 1; }
grep -qx 'updaterCacheDirName: tatolab-app-updater' "$packaged_app_directory/resources/app-update.yml" \
  || { echo "the packaged app has no resources/app-update.yml naming the updater's cache" >&2; exit 1; }

# Lays the app, its desktop entry and its icons under <root>/usr.
lay_out_the_app_under() {
  local install_root="$1"
  mkdir -p "$install_root/$installed_app_directory" "$install_root/usr/bin" "$install_root/usr/share/applications"
  cp -a "$packaged_app_directory/." "$install_root/$installed_app_directory/"
  # @electron/packager leaves its output directory 0700, which would lock every other user out.
  chmod -R u+rwX,go+rX,go-w "$install_root/$installed_app_directory"
  ln -s "../lib/tatolab/Tatolab" "$install_root/usr/bin/Tatolab"
  cat > "$install_root/usr/share/applications/Tatolab.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=Tatolab
Comment=$short_description
Exec=Tatolab
Icon=Tatolab
Terminal=false
Categories=Development;
StartupWMClass=Tatolab
DESKTOP
  desktop-file-validate "$install_root/usr/share/applications/Tatolab.desktop"
  local icon_size icon_file
  for icon_size in 32x32 128x128 256x256; do
    case "$icon_size" in
      256x256) icon_file="128x128@2x.png" ;;
      *) icon_file="$icon_size.png" ;;
    esac
    mkdir -p "$install_root/usr/share/icons/hicolor/$icon_size/apps"
    install -m 0644 "src-electron/icons/$icon_file" "$install_root/usr/share/icons/hicolor/$icon_size/apps/Tatolab.png"
  done
}

echo "==> .deb"
deb_root="$linux_build_directory/deb-root"
lay_out_the_app_under "$deb_root"
# Chromium's setuid sandbox helper: without it, where unprivileged user namespaces are off, every
# renderer refuses to start. dpkg-deb --root-owner-group makes it root's.
chmod 4755 "$deb_root/$installed_app_directory/chrome-sandbox"
shared_library_scan_directory="$linux_build_directory/shlibdeps"
mkdir -p "$shared_library_scan_directory/debian"
printf 'Source: tatolab\n\nPackage: tatolab\nArchitecture: amd64\n' > "$shared_library_scan_directory/debian/control"
linked_library_dependencies="$(cd "$shared_library_scan_directory" && dpkg-shlibdeps -O --ignore-missing-info \
  "$deb_root/$installed_app_directory/Tatolab" "$deb_root/$installed_app_directory/chrome-sandbox" \
  2>"$shared_library_scan_directory/dpkg-shlibdeps.log" | sed -n 's/^shlibs:Depends=//p')"
[ -n "$linked_library_dependencies" ] || { cat "$shared_library_scan_directory/dpkg-shlibdeps.log" >&2; echo "dpkg-shlibdeps found no library the app links" >&2; exit 1; }
linked_library_package=""
while IFS= read -r linked_library_package; do
  linked_library_package="${linked_library_package%% *}"
  linked_library_package="${linked_library_package%t64}"
  case " ${electron_package_dependencies[*]} " in
    *" $linked_library_package "*) ;;
    *) echo "the app links a library from $linked_library_package, which the .deb does not depend on" >&2; exit 1 ;;
  esac
done < <(tr ',' '\n' <<<"$linked_library_dependencies" | sed 's/^ *//')
deb_depends="$(printf '%s, ' "${electron_package_dependencies[@]}")"
deb_depends="${deb_depends%, }"
mkdir -p "$deb_root/DEBIAN"
cat > "$deb_root/DEBIAN/control" <<CONTROL
Package: tatolab
Version: $app_version
Architecture: amd64
Maintainer: Tatolab <https://tatolab.com/>
Section: devel
Priority: optional
Homepage: https://tatolab.com/
Depends: $deb_depends
Recommends: curl
Installed-Size: $(du -sk "$deb_root/usr" | cut -f1)
Description: $short_description
 $long_description
CONTROL
rm -f "$output_deb"
dpkg-deb --root-owner-group -Zxz --build "$deb_root" "$output_deb"

echo "==> verify the .deb"
deb_depends="$(dpkg-deb --field "$output_deb" Depends)"
deb_contents="$(dpkg-deb --contents "$output_deb")"
grep -qE '[[:space:]]\./usr/share/applications/Tatolab\.desktop$' <<<"$deb_contents" \
  || { echo "the .deb carries no usr/share/applications/Tatolab.desktop" >&2; exit 1; }
grep -qE '^-rwsr-xr-x root/root .*[[:space:]]\./usr/lib/tatolab/chrome-sandbox$' <<<"$deb_contents" \
  || { echo "the .deb's chrome-sandbox is not setuid root" >&2; exit 1; }
unreadable_deb_members="$(awk '$1 !~ /^l/ && $1 !~ /^[-d]r[-w][-xs]r-[-x]r-[-x]$/ {print $1, $6}' <<<"$deb_contents")"
[ -z "$unreadable_deb_members" ] || { echo "the .deb carries members other users cannot read: $unreadable_deb_members" >&2; exit 1; }
grep -qE '[[:space:]]\./usr/bin/Tatolab -> \.\./lib/tatolab/Tatolab$' <<<"$deb_contents" \
  || { echo "the .deb does not link usr/bin/Tatolab to the app" >&2; exit 1; }
echo "    Depends: $deb_depends"

echo "==> AppImage"
appimage_tools_directory="$linux_build_directory/appimage-tools"
mkdir -p "$appimage_tools_directory"
curl -fsSL -o "$appimage_tools_directory/appimagetool" "$appimagetool_url"
curl -fsSL -o "$appimage_tools_directory/runtime-x86_64" "$appimage_runtime_url"
printf '%s  %s\n%s  %s\n' "$appimagetool_sha256" "$appimage_tools_directory/appimagetool" \
  "$appimage_runtime_sha256" "$appimage_tools_directory/runtime-x86_64" | sha256sum --check --quiet
chmod 0755 "$appimage_tools_directory/appimagetool"
app_directory="$linux_build_directory/Tatolab.AppDir"
lay_out_the_app_under "$app_directory"
cp "$app_directory/usr/share/applications/Tatolab.desktop" "$app_directory/Tatolab.desktop"
cp "$app_directory/usr/share/icons/hicolor/256x256/apps/Tatolab.png" "$app_directory/Tatolab.png"
cat > "$app_directory/AppRun" <<'APPRUN'
#!/bin/sh
exec "$APPDIR/usr/lib/tatolab/Tatolab" "$@"
APPRUN
chmod 0755 "$app_directory/AppRun"
rm -f "$output_appimage"
# appimagetool is itself an AppImage; extract-and-run spares the build machine FUSE.
APPIMAGE_EXTRACT_AND_RUN=1 ARCH=x86_64 "$appimage_tools_directory/appimagetool" --no-appstream \
  --runtime-file "$appimage_tools_directory/runtime-x86_64" "$app_directory" "$output_appimage"
chmod 0755 "$output_appimage"

echo "==> update"
node scripts/write_tatolab_app_update_manifest.mjs "$output_update_manifest" "$app_version" "$output_appimage" "$output_deb"

echo "built $output_deb"
echo "built $output_appimage"
echo "built $output_update_manifest"
