#!/usr/bin/env bash
# Copyright (c) 2025 Jonathan Fontanez
# SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary
#
# Builds the committed tree at HEAD in an ubuntu:22.04 container with the standard layout's scripts
# (npm run build, npm run build:electron), runs it unpackaged under Xvfb over the stand-in local API
# that replays src/main/test-fixtures/, and shoots the Streams list over the DevTools protocol.
# Linux's node_modules lives in a container volume, so the host's never changes.
# Usage (from the repository root): proof/standard-layout/run-in-an-ubuntu-container.sh [output directory]
set -euo pipefail
repository_root="$(git rev-parse --show-toplevel)"
output_directory="$(mkdir -p "${1:-$repository_root/proof/standard-layout}" && cd "${1:-$repository_root/proof/standard-layout}" && pwd)"
tree_archive_directory="$(mktemp -d)"
trap 'rm -rf "$tree_archive_directory"' EXIT
git -C "$repository_root" archive HEAD -o "$tree_archive_directory/tree.tar"
docker run --rm \
  -v "$tree_archive_directory:/tree-archive:ro" \
  -v "$output_directory:/proof-output" \
  -v "$repository_root/docs/design/node_modules:/playwright-driver/node_modules:ro" \
  -v tatolab-app-linux-node-modules:/work/node_modules \
  ubuntu:22.04 bash -euo pipefail -c '
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq >/dev/null
  apt-get install -y -qq curl ca-certificates xz-utils xvfb dbus-x11 libnss3 libatk-bridge2.0-0 libgtk-3-0 libgbm1 libasound2 libxss1 libdrm2 libxshmfence1 >/dev/null
  curl -fsSL https://nodejs.org/dist/v22.23.1/node-v22.23.1-linux-arm64.tar.xz | tar -xJ -C /opt
  export PATH=/opt/node-v22.23.1-linux-arm64/bin:$PATH
  cd /work && tar -xf /tree-archive/tree.tar
  test ! -e src-electron && echo "src-electron/ is not in the tree"
  npm ci --ignore-scripts >/dev/null 2>&1 && node node_modules/electron/install.js >/dev/null
  npm run build >/dev/null && npm run build:electron >/dev/null
  echo "main entry: $(node -p "require(\"./package.json\").main")"; ls out
  export XDG_RUNTIME_DIR=/tmp/xdg-runtime SYSTEMCTL_STAND_IN_STATE=/tmp/systemctl-stand-in
  mkdir -p -m 0700 $XDG_RUNTIME_DIR && mkdir -p $SYSTEMCTL_STAND_IN_STATE
  touch $SYSTEMCTL_STAND_IN_STATE/tatolabd.service $SYSTEMCTL_STAND_IN_STATE/enabled
  export PATH=/work/proof/electron-window/linux-stand-ins:$PATH
  systemctl --user start tatolabd.service
  Xvfb :99 -screen 0 1440x900x24 >/dev/null 2>&1 & export DISPLAY=:99
  dbus-launch --exit-with-session npx electron . --no-sandbox --remote-debugging-port=9333 >/tmp/electron.log 2>&1 &
  sleep 12
  node /work/proof/standard-layout/shoot-the-streams-list-over-devtools.mjs /proof-output
  echo "systemctl stand-in received:"; cat $SYSTEMCTL_STAND_IN_STATE/commands
'
