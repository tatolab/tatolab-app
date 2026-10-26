#!/usr/bin/env bash
# Fetches the uv and the built-in Python that Tatolab.app makes a stream project's .venv with,
# each pinned by release and checksum, into <destination>:
#   <destination>/uv                         uv's binary
#   <destination>/python/cpython-<v>+<tag>/  python-build-standalone's install_only_stripped tree
# The folder name is python-build-standalone's own name for the build; the app reads the Python's
# version from it. Prints <destination> as its last line.
#
# Usage: fetch-python-toolchain-for-the-app-build.sh <destination> <macos-arm64|linux-x86_64>
#                                                    [--from-directory DIR]
#   --from-directory DIR  take the archives from DIR instead of GitHub; for the tests, which plant
#                         archives and pin their checksums in UV_ARCHIVE_SHA256 and
#                         BUILT_IN_PYTHON_ARCHIVE_SHA256, read only with this flag
set -euo pipefail

usage() { awk '/^# Usage:/{p=1} p&&/^#/{sub(/^# ?/,""); print; next} p{exit}' "$0" >&2; exit 2; }
[ $# -ge 2 ] || usage
destination="$1"
target_platform="$2"
shift 2
archives_directory=""
while [ $# -gt 0 ]; do
  case "$1" in
    --from-directory) [ $# -ge 2 ] || usage; archives_directory="$2"; shift ;;
    *) usage ;;
  esac
  shift
done

uv_release="0.13.1"
built_in_python_release="20261013"
built_in_python_folder_name="cpython-3.12.15+$built_in_python_release"
case "$target_platform" in
  macos-arm64)
    uv_archive_name="uv-aarch64-apple-darwin.tar.gz"
    uv_archive_sha256="cfe454573412ff7380d15fc7dae5997ab53ffce72fce0a78e91ddbc84001acd2"
    built_in_python_archive_name="$built_in_python_folder_name-aarch64-apple-darwin-install_only_stripped.tar.gz"
    built_in_python_archive_sha256="9866e11cf2ae9caa1e671383786f248859a52dd8bfb702fb4c0dc2c65f1d36de"
    ;;
  linux-x86_64)
    uv_archive_name="uv-x86_64-unknown-linux-gnu.tar.gz"
    uv_archive_sha256="eadd9d27c134ab5ac1ffd4473b97a741407f3ea238288f03121fc4deddf90220"
    built_in_python_archive_name="$built_in_python_folder_name-x86_64-unknown-linux-gnu-install_only_stripped.tar.gz"
    built_in_python_archive_sha256="178d3d83b6e8e99285a65d3fce9c16b87952cc5efdb4d1a0e3ff3be18ff0fc9c"
    ;;
  *) usage ;;
esac
if [ -n "$archives_directory" ]; then
  uv_archive_sha256="${UV_ARCHIVE_SHA256:-$uv_archive_sha256}"
  built_in_python_archive_sha256="${BUILT_IN_PYTHON_ARCHIVE_SHA256:-$built_in_python_archive_sha256}"
fi
uv_archive_url="https://github.com/astral-sh/uv/releases/download/$uv_release/$uv_archive_name"
built_in_python_archive_url="https://github.com/astral-sh/python-build-standalone/releases/download/$built_in_python_release/$built_in_python_archive_name"

sha256_of() {
  if command -v sha256sum >/dev/null; then sha256sum "$1" | cut -d' ' -f1; else shasum -a 256 "$1" | cut -d' ' -f1; fi
}

rm -rf "$destination"
mkdir -p "$destination"
destination="$(cd "$destination" && pwd)"
downloads="$destination/.downloads"
mkdir -p "$downloads"

# Each archive lands in its own new folder, checked against its pinned checksum before it is opened.
fetch_and_check() {
  local archive_name="$1" archive_url="$2" archive_sha256="$3"
  if [ -n "$archives_directory" ]; then
    cp "$archives_directory/$archive_name" "$downloads/$archive_name"
  else
    curl -fsSL --retry 3 -o "$downloads/$archive_name" "$archive_url"
  fi
  local fetched_sha256
  fetched_sha256="$(sha256_of "$downloads/$archive_name")"
  [ "$fetched_sha256" = "$archive_sha256" ] || {
    echo "$archive_name has sha256 $fetched_sha256, not the pinned $archive_sha256: refusing it" >&2
    exit 1
  }
}

fetch_and_check "$uv_archive_name" "$uv_archive_url" "$uv_archive_sha256"
fetch_and_check "$built_in_python_archive_name" "$built_in_python_archive_url" "$built_in_python_archive_sha256"

uv_unpacked="$downloads/uv-unpacked"
mkdir "$uv_unpacked"
tar -xzf "$downloads/$uv_archive_name" -C "$uv_unpacked"
uv_binary="$(find "$uv_unpacked" -type f -name uv | head -1)"
[ -n "$uv_binary" ] || { echo "$uv_archive_name holds no uv" >&2; exit 1; }
install -m 0755 "$uv_binary" "$destination/uv"

built_in_python_unpacked="$downloads/python-unpacked"
mkdir "$built_in_python_unpacked"
tar -xzf "$downloads/$built_in_python_archive_name" -C "$built_in_python_unpacked"
[ -x "$built_in_python_unpacked/python/bin/python3" ] || { echo "$built_in_python_archive_name holds no python/bin/python3" >&2; exit 1; }
mkdir -p "$destination/python"
mv "$built_in_python_unpacked/python" "$destination/python/$built_in_python_folder_name"

rm -rf "$downloads"
echo "fetched uv $uv_release and $built_in_python_folder_name for $target_platform" >&2
echo "$destination"
