#!/usr/bin/env bash
# Copyright (c) 2025 Jonathan Fontanez
# SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary
#
# Proof of a stream's page on Linux without a Linux machine: the committed tree at HEAD, built and run
# unpackaged in an ubuntu:22.04 container under Xvfb with openbox and stalonetray, with the
# systemctl and local API stand-ins from proof/electron-window/linux-stand-ins/ (no runtime runs).
# drive-the-stream-page.mjs drives it and writes its screenshots into <output directory>.
#
# Usage: proof/stream-overview-inspect/linux-container/run-the-stream-page-in-ubuntu-22.04.sh <output directory>

set -euo pipefail

output_directory="$(mkdir -p "$1" && cd "$1" && pwd)"
repository_root="$(git rev-parse --show-toplevel)"
tree_archive_directory="$(mktemp -d)"
trap 'rm -rf "$tree_archive_directory"' EXIT
git -C "$repository_root" archive HEAD -o "$tree_archive_directory/tree.tar"

docker run --rm \
  -v "$tree_archive_directory:/tree-archive:ro" \
  -v "$output_directory:/proof-output" \
  -v tatolab-linux-proof-node-modules:/work/node_modules \
  -v tatolab-linux-proof-playwright:/opt/playwright-driver \
  ubuntu:22.04 bash -euo pipefail -c '
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq
    apt-get install -y -qq curl ca-certificates xz-utils xvfb openbox stalonetray imagemagick fonts-dejavu-core \
      libnss3 libatk-bridge2.0-0 libgtk-3-0 libgbm1 libasound2 libxss1 libxtst6 libdrm2 libxkbcommon0 >/dev/null
    node_version=22.23.1
    curl -fsSL "https://nodejs.org/dist/v$node_version/node-v$node_version-linux-arm64.tar.xz" | tar -xJ -C /opt
    export PATH="/opt/node-v$node_version-linux-arm64/bin:$PATH"
    cd /work && tar -xf /tree-archive/tree.tar
    npm ci --no-audit --no-fund >/dev/null
    node node_modules/electron/install.js
    npm run build >/dev/null && npm run build:electron >/dev/null
    (cd /opt/playwright-driver && { [ -d node_modules/playwright ] || npm i --silent playwright@1.59 >/dev/null; })

    export XDG_RUNTIME_DIR=/run/user/0 SYSTEMCTL_STAND_IN_STATE=/tmp/systemctl-stand-in
    mkdir -p "$XDG_RUNTIME_DIR" "$SYSTEMCTL_STAND_IN_STATE"
    chmod 0700 "$XDG_RUNTIME_DIR"
    touch "$SYSTEMCTL_STAND_IN_STATE/tatolabd.service" "$SYSTEMCTL_STAND_IN_STATE/enabled"
    export PATH="/work/proof/electron-window/linux-stand-ins:$PATH"
    systemctl --user start tatolabd.service

    Xvfb :99 -screen 0 1280x800x24 >/dev/null 2>&1 &
    export DISPLAY=:99
    sleep 1
    openbox >/dev/null 2>&1 &
    stalonetray --geometry 1x1-0+0 --icon-size 22 >/dev/null 2>&1 &
    sleep 1
    NODE_PATH=/opt/playwright-driver/node_modules node /work/proof/stream-overview-inspect/linux-container/drive-the-stream-page.mjs /work /proof-output || {
      echo "--- systemctl stand-in: commands, then the local API stand-in log ---"
      cat "$SYSTEMCTL_STAND_IN_STATE/commands" "$SYSTEMCTL_STAND_IN_STATE/local-api-stand-in.log" 2>&1
      ls -la "$XDG_RUNTIME_DIR/streamlib" 2>&1
      exit 1
    }
  '
