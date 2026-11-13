#!/usr/bin/env bash
# Builds Tato Studio for Linux: the .deb and the AppImage of the Electron window and tray. Each
# carries in its resources/ streamlib's runtime unit (tatolab-runtime/: bin/, lib/,
# streamlib-commit), whose tatolabd the app runs as its own child process; no uv or Python of its
# own: the runtime's uv sits beside its tatolabd.
# The runtime is always streamlib's main, or --streamlib-ref, fetched by
# fetch-streamlib-for-the-app-build.sh into build/linux-streamlib. The packages' version is the
# version of the tatolabd they carry, or --app-version.
# Outputs build/linux/Tato-Studio-<version>-amd64.deb, build/linux/Tato-Studio-<version>-x86_64.AppImage,
# and the update feed's manifest listing both, build/linux/latest-linux.yml.
#
# Usage: build-tatolab-linux-app.sh [--streamlib-ref REF] [--runtime-unit DIR] [--app-version X.Y.Z]
#                                   [--local-proof-test-root] [--app-update-feed-url URL] [--release]
#   --streamlib-ref REF      the streamlib tag or commit to carry instead of main's head; a release
#                            passes the release tag it builds
#   --runtime-unit DIR       an already-built runtime unit, accepted only when its streamlib-commit
#                            names the commit the build resolved; a release passes its own runtime
#                            tarball, unpacked, which streamlib builds at the glibc floor it promises
#   --app-version X.Y.Z      the packages' version, in place of the carried tatolabd's; the release
#                            workflow passes the version it plans, never older than the runtime's
#   --local-proof-test-root  read the runtime under TATOLAB_TEST_MACHINE_ROOT=/tmp/tatolab-proof;
#                            for proving on a development machine, never shipped
#   --app-update-feed-url URL  the feed the app checks for updates (default: get.tatolab.com's);
#                            only with --local-proof-test-root, for proving an update locally
#   --release                a build the release workflow makes: About reads `-release` after the
#                            commit; every other build reads `-dev`
set -euo pipefail

usage() { awk '/^# Usage:/{p=1} p&&/^#/{sub(/^# ?/,""); print; next} p{exit}' "$0" >&2; exit 2; }
tato_app_root="$(cd "$(dirname "$0")/.." && pwd)"
scripts_directory="$tato_app_root/scripts"
streamlib_ref=main
prebuilt_runtime_unit=""
requested_app_version=""
local_proof_test_root=false
app_update_feed_url=""
release_build=false
while [ $# -gt 0 ]; do
  case "$1" in
    --streamlib-ref) [ $# -ge 2 ] || usage; streamlib_ref="$2"; shift ;;
    --runtime-unit) [ $# -ge 2 ] || usage; prebuilt_runtime_unit="$2"; shift ;;
    --app-version) [ $# -ge 2 ] || usage; requested_app_version="${2#v}"; shift ;;
    --local-proof-test-root) local_proof_test_root=true ;;
    --app-update-feed-url) [ $# -ge 2 ] || usage; app_update_feed_url="$2"; shift ;;
    --release) release_build=true ;;
    -h|--help) usage ;;
    *) usage ;;
  esac
  shift
done

if $release_build && $local_proof_test_root; then
  echo "--release and --local-proof-test-root together: a local-proof build is a dev build" >&2
  exit 1
fi

[ "$(uname -s)" = Linux ] || { echo "this builds the Linux app on Linux; on macOS, scripts/build-tatolab-app.sh builds Tato Studio.app" >&2; exit 1; }
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
short_description="A graph-first creative studio over this machine's Tatolab runtime"
long_description="Tato Studio shows the streams this machine's Tatolab runtime holds as they start and stop, each stream's graph, code and logs, from a window and the tray. It carries the Tatolab runtime and runs it while the app is open, stopping it when you quit."

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
release_build_arguments=()
$release_build && release_build_arguments=(--release)

cd "$tato_app_root"
echo "==> runtime unit (streamlib $streamlib_ref)"
fetched_streamlib="$tato_app_root/build/linux-streamlib"
streamlib_commit="$("$scripts_directory/fetch-streamlib-for-the-app-build.sh" "$fetched_streamlib" --streamlib-ref "$streamlib_ref" | tail -1)"
if [ -n "$prebuilt_runtime_unit" ]; then
  runtime_unit_directory="$(cd "$prebuilt_runtime_unit" && pwd)"
else
  runtime_unit_directory="$("$scripts_directory/build-tatolab-runtime-unit.sh" "$fetched_streamlib" ${local_proof_arguments[@]+"${local_proof_arguments[@]}"})"
fi
unit_streamlib_commit="$(cat "$runtime_unit_directory/streamlib-commit" 2>/dev/null || true)"
[ "$unit_streamlib_commit" = "$streamlib_commit" ] || {
  echo "runtime unit $runtime_unit_directory was built from streamlib '${unit_streamlib_commit:-no recorded commit}', not $streamlib_commit ($streamlib_ref)" >&2
  exit 1
}
for required in bin/tatolabd bin/tatolab lib streamlib-commit; do
  [ -e "$runtime_unit_directory/$required" ] || { echo "runtime unit $runtime_unit_directory is missing $required" >&2; exit 1; }
done
tatolabd_version_output="$("$runtime_unit_directory/bin/tatolabd" --version)"
runtime_version="${tatolabd_version_output##* }"
[[ "$runtime_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "the unit's tatolabd reports no X.Y.Z version: $tatolabd_version_output" >&2; exit 1; }
app_version="${requested_app_version:-$runtime_version}"
[[ "$app_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "--app-version is not X.Y.Z: $app_version" >&2; exit 1; }
echo "    $runtime_unit_directory: streamlib $streamlib_commit, runtime $runtime_version, app version $app_version"
linux_build_directory="$tato_app_root/build/linux-packaging"
output_directory="$tato_app_root/build/linux"
output_deb="$output_directory/Tato-Studio-$app_version$local_proof_name_part-amd64.deb"
output_appimage="$output_directory/Tato-Studio-$app_version$local_proof_name_part-x86_64.AppImage"
output_update_manifest="$output_directory/latest-linux.yml"
rm -rf "$linux_build_directory"
mkdir -p "$linux_build_directory" "$output_directory"

echo "==> Electron app"
npm ci
"$scripts_directory/place-tatolab-runtime-client.sh" --from-runtime-unit "$runtime_unit_directory"
npm run build -- ${local_proof_arguments[@]+"${local_proof_arguments[@]}"} ${app_update_feed_arguments[@]+"${app_update_feed_arguments[@]}"} \
  ${release_build_arguments[@]+"${release_build_arguments[@]}"}
echo "==> viewer addon (streamlib $streamlib_commit)"
"$scripts_directory/build-tatolab-runtime-viewer-frame-import.sh" "$fetched_streamlib" --release
packaged_app_directory="$(node scripts/package_tatolab_electron_app.mjs linux "$app_version" "$linux_build_directory/packaged" | tail -1)"
[ -x "$packaged_app_directory/Tatolab" ] || { echo "packaging left no $packaged_app_directory/Tatolab" >&2; exit 1; }
[ -f "$packaged_app_directory/chrome-sandbox" ] || { echo "packaging left no $packaged_app_directory/chrome-sandbox" >&2; exit 1; }
# A process could otherwise run the app as plain Node.
electron_fuse_states="$(npx --no-install @electron/fuses read --app "$packaged_app_directory/Tatolab")"
for required_electron_fuse_state in "RunAsNode is Disabled" "EnableNodeOptionsEnvironmentVariable is Disabled" \
  "EnableNodeCliInspectArguments is Disabled" "OnlyLoadAppFromAsar is Enabled"; do
  grep -qF "$required_electron_fuse_state" <<<"$electron_fuse_states" \
    || { echo "the packaged app's Electron fuse is not '$required_electron_fuse_state'" >&2; exit 1; }
done
build_features_read_arguments=(--shipping)
$local_proof_test_root && build_features_read_arguments=()
packaged_build_features="$(node scripts/tatolab_app_build_features.mjs read "$packaged_app_directory/resources/app.asar" ${build_features_read_arguments[@]+"${build_features_read_arguments[@]}"})" \
  || { echo "the packaged app's build features carry no build id, are unreadable, or are not the shipping ones" >&2; exit 1; }
echo "    built at tatolab-app $(sed -n 's/^tatolabAppCommit=//p' <<<"$packaged_build_features"), $(sed -n 's/^buildKind=//p' <<<"$packaged_build_features")"
if $local_proof_test_root; then
  expected_app_update_feed_url="${app_update_feed_url:-$(node -p 'require("./src/main/tatolab_app_build_features.json").appUpdateFeedUrl')}"
  grep -qx "machineDirectoriesUnderATestRoot=true" <<<"$packaged_build_features" \
    || { echo "the packaged app was not built with machineDirectoriesUnderATestRoot: $packaged_build_features" >&2; exit 1; }
  grep -qxF "appUpdateFeedUrl=$expected_app_update_feed_url" <<<"$packaged_build_features" \
    || { echo "the packaged app does not check $expected_app_update_feed_url for updates: $packaged_build_features" >&2; exit 1; }
fi
# The asar's header is JSON naming every directory it holds.
grep -aqF '"electron-updater":{"files"' "$packaged_app_directory/resources/app.asar" \
  || { echo "the packaged app carries no electron-updater" >&2; exit 1; }
grep -qx 'updaterCacheDirName: tatolab-app-updater' "$packaged_app_directory/resources/app-update.yml" \
  || { echo "the packaged app has no resources/app-update.yml naming the updater's cache" >&2; exit 1; }

echo "==> the runtime unit"
carried_runtime_unit="$packaged_app_directory/resources/tatolab-runtime"
mkdir -p "$carried_runtime_unit"
cp -a "$runtime_unit_directory/bin" "$runtime_unit_directory/lib" "$runtime_unit_directory/streamlib-commit" "$carried_runtime_unit/"

# Lays the app, its desktop entry and its icons under <root>/usr.
lay_out_the_app_under() {
  local install_root="$1"
  mkdir -p "$install_root/$installed_app_directory" "$install_root/usr/bin" "$install_root/usr/share/applications"
  cp -a "$packaged_app_directory/." "$install_root/$installed_app_directory/"
  # @electron/packager leaves its output directory 0700, which would lock every other user out.
  chmod -R u+rwX,go+rX,go-w "$install_root/$installed_app_directory"
  # The package, its paths, the executable and the desktop entry keep the names earlier builds
  # installed, so apt upgrades the tatolab package in place and the person's autostart entry still
  # opens the app; only the names a person reads are Tato Studio's.
  ln -s "../lib/tatolab/Tatolab" "$install_root/usr/bin/Tatolab"
  cat > "$install_root/usr/share/applications/Tatolab.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=Tato Studio
Comment=$short_description
Exec=Tatolab
Icon=Tatolab
Terminal=false
Categories=Development;
StartupWMClass=Tato Studio
DESKTOP
  desktop-file-validate "$install_root/usr/share/applications/Tatolab.desktop"
  local icon_size icon_file
  for icon_size in 32x32 128x128 256x256; do
    case "$icon_size" in
      256x256) icon_file="128x128@2x.png" ;;
      *) icon_file="$icon_size.png" ;;
    esac
    mkdir -p "$install_root/usr/share/icons/hicolor/$icon_size/apps"
    install -m 0644 "packaging/icons/$icon_file" "$install_root/usr/share/icons/hicolor/$icon_size/apps/Tatolab.png"
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
Maintainer: Tatolab LLC <https://tatolab.com/>
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
! grep -qE '[[:space:]]\./usr/lib/tatolab/resources/(uv|python)(/|$)' <<<"$deb_contents" \
  || { echo "the .deb carries a uv or Python of the app's own under usr/lib/tatolab/resources" >&2; exit 1; }
for carried_runtime_member in bin/tatolabd bin/tatolab bin/uv bin/tatolab-video-poster-frame; do
  grep -qE "^-rwxr-xr-x .*[[:space:]]\./usr/lib/tatolab/resources/tatolab-runtime/$carried_runtime_member\$" <<<"$deb_contents" \
    || { echo "the .deb carries no runnable usr/lib/tatolab/resources/tatolab-runtime/$carried_runtime_member" >&2; exit 1; }
done
for carried_runtime_member in streamlib-commit; do
  grep -qF "./usr/lib/tatolab/resources/tatolab-runtime/$carried_runtime_member" <<<"$deb_contents" \
    || { echo "the .deb carries no usr/lib/tatolab/resources/tatolab-runtime/$carried_runtime_member" >&2; exit 1; }
done
for core_first_party_module in tatolab_compositor tatolab_testpattern; do
  grep -qE "[[:space:]]\./usr/lib/tatolab/resources/tatolab-runtime/lib/tatolab/imports/$core_first_party_module-[^/]+\.whl\$" <<<"$deb_contents" \
    || { echo "the .deb carries no $core_first_party_module wheel in usr/lib/tatolab/resources/tatolab-runtime/lib/tatolab/imports" >&2; exit 1; }
done
grep -qE "[[:space:]]\./usr/lib/tatolab/resources/tatolab-runtime/lib/tatolab/samples/[^/]+/tatolab-project\.json\$" <<<"$deb_contents" \
  || { echo "the .deb carries no sample project in usr/lib/tatolab/resources/tatolab-runtime/lib/tatolab/samples" >&2; exit 1; }
grep -qF "./usr/lib/tatolab/resources/tatolab-runtime/lib/tatolab/core-projects/tatolab-core-nodes/tatolab-project.json" <<<"$deb_contents" \
  || { echo "the .deb carries no Core Nodes project in usr/lib/tatolab/resources/tatolab-runtime/lib/tatolab/core-projects" >&2; exit 1; }
! grep -qF './usr/lib/tatolab/resources/install.sh' <<<"$deb_contents" \
  || { echo "the .deb carries streamlib's install.sh, which the app never runs" >&2; exit 1; }
echo "    Depends: $deb_depends"

echo "==> AppImage"
appimage_tools_directory="$linux_build_directory/appimage-tools"
mkdir -p "$appimage_tools_directory"
curl -fsSL -o "$appimage_tools_directory/appimagetool" "$appimagetool_url"
curl -fsSL -o "$appimage_tools_directory/runtime-x86_64" "$appimage_runtime_url"
printf '%s  %s\n%s  %s\n' "$appimagetool_sha256" "$appimage_tools_directory/appimagetool" \
  "$appimage_runtime_sha256" "$appimage_tools_directory/runtime-x86_64" | sha256sum --check --quiet
chmod 0755 "$appimage_tools_directory/appimagetool"
app_directory="$linux_build_directory/Tato-Studio.AppDir"
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

echo "built $output_deb (streamlib $streamlib_commit, version $app_version)"
echo "built $output_appimage"
echo "built $output_update_manifest"
