#!/usr/bin/env bash
# Builds streamlib's runtime unit (bin/tatolabd, bin/tatolab, bin/uv, bin/tatolab-video-poster-frame,
# lib/tatolab/lend, its imports, carried wheels and carried Python) in a streamlib checkout, writes
# the checkout's commit into the unit's streamlib-commit, and prints the unit's directory. The checkout's own target directory is used.
#
# Usage: build-tatolab-runtime-unit.sh <streamlib checkout> [--developer-id-application-identity IDENTITY]
#                                      [--local-proof-test-root]
#   --developer-id-application-identity IDENTITY
#                            macOS: the "Developer ID Application: … (TEAMID)" identity from Infisical,
#                            in a keychain build-tatolab-app.sh imported it into. Every Mach-O inside
#                            the unit's carried wheels and Python archive is signed with it: the app's
#                            signing reaches no code inside an archive, and the notary opens them
#   --local-proof-test-root  both binaries keep every machine directory under
#                            TATOLAB_TEST_MACHINE_ROOT (never for a shipped build)
set -euo pipefail

usage() { awk '/^# Usage:/{p=1} p&&/^#/{sub(/^# ?/,""); print; next} p{exit}' "$0" >&2; exit 2; }
[ $# -ge 1 ] || usage
streamlib_checkout="$(cd "$1" && pwd)"
shift
xtask_arguments=(build-runtime --release)
signing_identity=""
while [ $# -gt 0 ]; do
  case "$1" in
    --developer-id-application-identity) [ $# -ge 2 ] || usage; signing_identity="$2"; shift ;;
    --local-proof-test-root) xtask_arguments+=(--machine-directories-under-a-test-root) ;;
    *) usage ;;
  esac
  shift
done
case "$signing_identity" in
  "Developer ID Application: "*) xtask_arguments+=(--macos-developer-id-application-identity "$signing_identity") ;;
  "") ;;
  *) echo "'$signing_identity' is not a 'Developer ID Application: …' identity: the unit's carried code is signed with the Developer ID and nothing else" >&2; exit 1 ;;
esac

[ -f "$streamlib_checkout/xtask/Cargo.toml" ] || { echo "not a streamlib checkout: $streamlib_checkout" >&2; exit 1; }
streamlib_commit="$(git -C "$streamlib_checkout" rev-parse HEAD)"
[ -z "$(git -C "$streamlib_checkout" status --porcelain --untracked-files=no)" ] \
  || { echo "streamlib checkout $streamlib_checkout has uncommitted changes: the unit would not be $streamlib_commit" >&2; exit 1; }
export CARGO_TARGET_DIR="$streamlib_checkout/target"
runtime_unit_directory="$streamlib_checkout/target/tatolab-runtime"
# xtask builds the unit in place, so the previous build's unit goes first: it would otherwise keep
# whatever that commit laid out and this one does not, and its commit would vouch for a half-replaced
# unit if this build failed part-way.
rm -rf "$runtime_unit_directory"
# With CEF_PATH set xtask stages the browser host, a CEF app bundle the app bundle cannot place yet.
(cd "$streamlib_checkout" && env -u CEF_PATH cargo xtask "${xtask_arguments[@]}") >&2

for required in bin/tatolabd bin/tatolab bin/uv bin/tatolab-video-poster-frame lib/tatolab/lend/tatolab/runtime lib/tatolab/imports \
  lib/tatolab/carried-wheels lib/tatolab/python-downloads/uv-python-downloads.json; do
  [ -e "$runtime_unit_directory/$required" ] || { echo "runtime unit is missing $required" >&2; exit 1; }
done
echo "$streamlib_commit" >"$runtime_unit_directory/streamlib-commit"
echo "$runtime_unit_directory"
