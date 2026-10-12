#!/usr/bin/env bash
# Builds Tatolab for Linux: the .deb and the AppImage of the window and tray over the runtime's
# systemd user service. Neither carries a runtime; the installer
# (curl -fsSL https://get.tatolab.com/install.sh | sh) installs the runtime and its service.
# Outputs build/linux/Tatolab-<version>-amd64.deb and build/linux/Tatolab-<version>-x86_64.AppImage.
#
# Usage: build-tatolab-linux-app.sh [--app-version X.Y.Z] [--local-proof-test-root]
#   --app-version X.Y.Z      the packages' version (default: tauri.conf.json's); a release passes
#                            the streamlib release they go beside
#   --local-proof-test-root  read the runtime under TATOLAB_TEST_MACHINE_ROOT=/tmp/tatolab-proof;
#                            for proving on a development machine, never shipped
set -euo pipefail

usage() { awk '/^# Usage:/{p=1} p&&/^#/{sub(/^# ?/,""); print; next} p{exit}' "$0" >&2; exit 2; }
repository_root="$(cd "$(dirname "$0")/.." && pwd)"
app_version=""
local_proof_test_root=false
while [ $# -gt 0 ]; do
  case "$1" in
    --app-version) [ $# -ge 2 ] || usage; app_version="${2#v}"; shift ;;
    --local-proof-test-root) local_proof_test_root=true ;;
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

tauri_feature_arguments=()
local_proof_name_part=""
if $local_proof_test_root; then
  tauri_feature_arguments=(--features machine-directories-under-a-test-root)
  local_proof_name_part="-local-proof"
fi

echo "==> Tauri app"
cd "$repository_root"
npm ci
if [ -z "$app_version" ]; then
  app_version="$(node -p 'require("./src-tauri/tauri.conf.json").version')"
fi
[[ "$app_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "not an X.Y.Z app version: $app_version" >&2; exit 1; }
export CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-$repository_root/src-tauri/target}"
npx tauri build --bundles deb,appimage --config "{\"version\":\"$app_version\"}" ${tauri_feature_arguments[@]+"${tauri_feature_arguments[@]}"}

bundle_directory="$CARGO_TARGET_DIR/release/bundle"
built_deb="$bundle_directory/deb/Tatolab_${app_version}_amd64.deb"
built_appimage="$bundle_directory/appimage/Tatolab_${app_version}_amd64.AppImage"
for built_package in "$built_deb" "$built_appimage"; do
  [ -f "$built_package" ] || { echo "tauri build left no $built_package" >&2; exit 1; }
done

echo "==> verify the .deb"
deb_depends="$(dpkg-deb --field "$built_deb" Depends)"
for required_dependency in libwebkit2gtk-4.1-0 libgtk-3-0; do
  case ", $deb_depends," in
    *", $required_dependency,"*) ;;
    *) echo "the .deb does not depend on $required_dependency (Depends: $deb_depends)" >&2; exit 1 ;;
  esac
done
case ", $deb_depends," in
  *", libayatana-appindicator3-1,"*|*", libappindicator3-1,"*) ;;
  *) echo "the .deb depends on no appindicator library for the tray (Depends: $deb_depends)" >&2; exit 1 ;;
esac
# Tauri's .deb lists its members without the "./" prefix dpkg-deb -b writes.
deb_contents="$(dpkg-deb --contents "$built_deb")"
grep -qE '[[:space:]](\./)?usr/share/applications/Tatolab\.desktop$' <<<"$deb_contents" \
  || { echo "the .deb carries no usr/share/applications/Tatolab.desktop" >&2; exit 1; }
echo "    Depends: $deb_depends"

output_directory="$repository_root/build/linux"
output_deb="$output_directory/Tatolab-$app_version$local_proof_name_part-amd64.deb"
output_appimage="$output_directory/Tatolab-$app_version$local_proof_name_part-x86_64.AppImage"
mkdir -p "$output_directory"
cp "$built_deb" "$output_deb"
cp "$built_appimage" "$output_appimage"
chmod 0755 "$output_appimage"

echo "built $output_deb"
echo "built $output_appimage"
