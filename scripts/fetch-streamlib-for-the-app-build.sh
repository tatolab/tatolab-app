#!/usr/bin/env bash
# Copyright (c) 2025 Jonathan Fontanez
# SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary
#
# Resolves streamlib's main, or an explicit tag or commit, to one commit, fetches exactly that
# commit into <destination> and checks it out, discarding whatever else is there but cargo's
# target/. Prints the commit as its last line. The app is always built against the streamlib this
# fetches, never a checkout that happens to sit on the builder's disk. <destination> is this
# script's own: it refuses one that holds anything but a checkout it made, or cargo's target/.
#
# Usage: fetch-streamlib-for-the-app-build.sh <destination> [--streamlib-ref REF] [--resolve-only]
#                                            [--from-repository URL]
#   --streamlib-ref REF      a branch, tag or full commit of streamlib (default: main)
#   --resolve-only           print the commit REF resolves to and fetch nothing
#   --from-repository URL    fetch from URL instead of https://github.com/tatolab/streamlib.git; for
#                            the tests, which fetch from a planted repository
set -euo pipefail

usage() { awk '/^# Usage:/{p=1} p&&/^#/{sub(/^# ?/,""); print; next} p{exit}' "$0" >&2; exit 2; }
[ $# -ge 1 ] || usage
destination="$1"
shift
streamlib_ref=main
streamlib_repository_url="https://github.com/tatolab/streamlib.git"
resolve_only=false
while [ $# -gt 0 ]; do
  case "$1" in
    --streamlib-ref) [ $# -ge 2 ] || usage; streamlib_ref="$2"; shift ;;
    --resolve-only) resolve_only=true ;;
    --from-repository) [ $# -ge 2 ] || usage; streamlib_repository_url="$2"; shift ;;
    *) usage ;;
  esac
  shift
done

if [[ "$streamlib_ref" =~ ^[0-9a-f]{40}$ ]]; then
  streamlib_commit="$streamlib_ref"
else
  remote_refs="$(git ls-remote --heads --tags "$streamlib_repository_url")"
  streamlib_commit=""
  # An annotated tag's commit is its peeled "^{}" entry; a lightweight tag and a branch name theirs directly.
  for candidate_ref in "refs/tags/$streamlib_ref^{}" "refs/tags/$streamlib_ref" "refs/heads/$streamlib_ref"; do
    streamlib_commit="$(awk -v candidate_ref="$candidate_ref" '$2 == candidate_ref { print $1; exit }' <<<"$remote_refs")"
    [ -z "$streamlib_commit" ] || break
  done
  [ -n "$streamlib_commit" ] || { echo "streamlib at $streamlib_repository_url has no branch or tag '$streamlib_ref'" >&2; exit 1; }
fi
if $resolve_only; then
  echo "$streamlib_commit"
  exit 0
fi

fetched_checkout_marker_key="tatolab.streamlibFetchedForTheAppBuild"
if [ -d "$destination/.git" ]; then
  [ "$(git -C "$destination" config --local --get "$fetched_checkout_marker_key" || true)" = true ] || {
    echo "$destination is a git checkout this script did not make; refusing to replace it" >&2
    exit 1
  }
elif [ -e "$destination" ] && [ -n "$(ls -A "$destination" | grep -vx target || true)" ]; then
  echo "$destination holds something other than a streamlib this script fetched; refusing to replace it" >&2
  exit 1
else
  mkdir -p "$destination"
  git -C "$destination" init -q
  git -C "$destination" config --local "$fetched_checkout_marker_key" true
fi
git -C "$destination" fetch -q --depth 1 "$streamlib_repository_url" "$streamlib_commit" \
  || { echo "could not fetch streamlib $streamlib_commit ($streamlib_ref) from $streamlib_repository_url" >&2; exit 1; }
git -C "$destination" checkout -q --force --detach "$streamlib_commit"
git -C "$destination" clean -q -ffdx -e /target
[ "$(git -C "$destination" rev-parse HEAD)" = "$streamlib_commit" ] \
  || { echo "$destination is not at streamlib $streamlib_commit after the fetch" >&2; exit 1; }
echo "fetched streamlib $streamlib_ref at $streamlib_commit into $destination" >&2
echo "$streamlib_commit"
