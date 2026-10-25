#!/usr/bin/env bash
# Copyright (c) 2025 Jonathan Fontanez
# SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary
#
# The Linux rung of /verify-app on a Mac: builds the committed tree at HEAD in an ubuntu:22.04
# container (npm run build), runs it unpackaged under Xvfb over the stand-in
# local API that replays src/main/test-fixtures/, and shoots the Streams list over the DevTools
# protocol into <output directory>. Linux's node_modules lives in a container volume, so the host's
# never changes.
# Usage: scripts/verify/run-the-window-in-an-ubuntu-container.sh <output directory>
set -euo pipefail
repository_root="$(git rev-parse --show-toplevel)"
output_directory="$(mkdir -p "${1:?usage: $0 <output directory>}" && cd "$1" && pwd)"
tree_archive_directory="$(mktemp -d)"
trap 'rm -rf "$tree_archive_directory"' EXIT
git -C "$repository_root" archive HEAD -o "$tree_archive_directory/tree.tar"
docker run --rm \
  -v "$tree_archive_directory:/tree-archive:ro" \
  -v "$output_directory:/verify-output" \
  -v tatolab-app-linux-node-modules:/work/node_modules \
  ubuntu:22.04 bash -euo pipefail -c '
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq >/dev/null
  apt-get install -y -qq curl ca-certificates xz-utils xvfb dbus-x11 libnss3 libatk-bridge2.0-0 libgtk-3-0 libgbm1 libasound2 libxss1 libdrm2 libxshmfence1 >/dev/null
  case "$(uname -m)" in aarch64) node_architecture=arm64 ;; *) node_architecture=x64 ;; esac
  curl -fsSL "https://nodejs.org/dist/v22.23.1/node-v22.23.1-linux-$node_architecture.tar.xz" | tar -xJ -C /opt
  export PATH="/opt/node-v22.23.1-linux-$node_architecture/bin:$PATH"
  cd /work && tar -xf /tree-archive/tree.tar
  npm ci --ignore-scripts >/dev/null 2>&1 && node node_modules/electron/install.js >/dev/null
  npm run build >/dev/null
  echo "main entry: $(node -p "require(\"./package.json\").main")"; ls out
  export XDG_RUNTIME_DIR=/tmp/xdg-runtime SYSTEMCTL_STAND_IN_STATE=/tmp/systemctl-stand-in
  mkdir -p -m 0700 $XDG_RUNTIME_DIR && mkdir -p $SYSTEMCTL_STAND_IN_STATE
  touch $SYSTEMCTL_STAND_IN_STATE/tatolabd.service $SYSTEMCTL_STAND_IN_STATE/enabled
  export PATH=/work/scripts/verify/linux-stand-ins:$PATH
  systemctl --user start tatolabd.service
  Xvfb :99 -screen 0 1440x900x24 >/dev/null 2>&1 & export DISPLAY=:99
  dbus-launch --exit-with-session npx electron . --no-sandbox --remote-debugging-port=9333 >/tmp/electron.log 2>&1 &
  sleep 12
  node /work/scripts/verify/shoot-the-streams-list-over-devtools.mjs /verify-output
  echo "systemctl stand-in received:"; cat $SYSTEMCTL_STAND_IN_STATE/commands
'
