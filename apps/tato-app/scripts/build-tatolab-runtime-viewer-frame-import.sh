#!/usr/bin/env bash
# Builds Tato Studio's viewer addon (native/tatolab-runtime-viewer-frame-import) against the streamlib
# checkout the app is built from, so the frames it imports follow the wire layout of the runtime the
# app carries: the checkout's crates replace the pinned git ones. Copies the addon to
# out/native/tatolab_runtime_viewer_frame_import.node and prints that path.
#
# Usage: build-tatolab-runtime-viewer-frame-import.sh <streamlib checkout> [--release]
set -euo pipefail

usage() { awk '/^# Usage:/{p=1} p&&/^#/{sub(/^# ?/,""); print; next} p{exit}' "$0" >&2; exit 2; }
[ $# -ge 1 ] || usage
streamlib_checkout="$(cd "$1" && pwd)"
shift
cargo_profile_arguments=()
cargo_profile_directory=debug
while [ $# -gt 0 ]; do
  case "$1" in
    --release) cargo_profile_arguments=(--release); cargo_profile_directory=release ;;
    *) usage ;;
  esac
  shift
done

[ -f "$streamlib_checkout/runtime/streamlib-gpu-frame-import-client/Cargo.toml" ] \
  || { echo "not a streamlib checkout with the frame import client: $streamlib_checkout" >&2; exit 1; }
app_root="$(cd "$(dirname "$0")/.." && pwd)"
addon_crate="$app_root/native/tatolab-runtime-viewer-frame-import"
export CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-$addon_crate/target}"

patch_from_the_checkout=()
for streamlib_crate in streamlib-gpu-frame-import-client streamlib-ipc-types streamlib-consumer-rhi; do
  patch_from_the_checkout+=(--config "patch.\"https://github.com/tatolab/streamlib\".$streamlib_crate.path=\"$streamlib_checkout/runtime/$streamlib_crate\"")
done
# A patched build rewrites the crate's lockfile to the checkout's paths; the committed one, which
# pins the git sources, is put back however the build ends.
cp "$addon_crate/Cargo.lock" "$addon_crate/Cargo.lock.pinned-to-git"
# Cargo keeps a locked git entry over a path patch of another version, and only warns that the
# patch "was not used", so the checkout's crates are moved into the lockfile first and an unused
# patch fails the build: an addon built from the pinned crates misreads a newer runtime's frames.
patched_crate_arguments=()
for streamlib_crate in streamlib-gpu-frame-import-client streamlib-ipc-types streamlib-consumer-rhi; do
  patched_crate_arguments+=(-p "$streamlib_crate")
done
cargo_output="$(mktemp)"
trap 'mv -f "$addon_crate/Cargo.lock.pinned-to-git" "$addon_crate/Cargo.lock"; rm -f "$cargo_output"' EXIT
(cd "$addon_crate" && cargo update "${patch_from_the_checkout[@]}" "${patched_crate_arguments[@]}") 2>&1 | tee "$cargo_output" >&2
(cd "$addon_crate" && cargo build "${cargo_profile_arguments[@]}" "${patch_from_the_checkout[@]}") 2>&1 | tee -a "$cargo_output" >&2
! grep -q "was not used in the crate graph" "$cargo_output" \
  || { echo "the addon was not built from $streamlib_checkout's crates: cargo left a patch unused" >&2; exit 1; }

case "$(uname -s)" in
  Darwin) built_library="$CARGO_TARGET_DIR/$cargo_profile_directory/libtatolab_runtime_viewer_frame_import.dylib" ;;
  *) built_library="$CARGO_TARGET_DIR/$cargo_profile_directory/libtatolab_runtime_viewer_frame_import.so" ;;
esac
[ -f "$built_library" ] || { echo "the addon build left no $built_library" >&2; exit 1; }
mkdir -p "$app_root/out/native"
built_addon="$app_root/out/native/tatolab_runtime_viewer_frame_import.node"
cp "$built_library" "$built_addon"
echo "$built_addon"
