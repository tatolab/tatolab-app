#!/usr/bin/env bash
# Copyright (c) 2025 Jonathan Fontanez
# SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary
#
# Runs the unpackaged app in an ubuntu:22.04 container under Xvfb, over the local API stand-in run as
# tatolabd.service by the systemctl stand-in, and shoots Settings through the DevTools protocol.
# Linux's node_modules lives in a container volume, so the host's never changes.
# Usage (from the repository root): proof/settings-linux/run-in-an-ubuntu-container.sh
set -euo pipefail
repository_root="$(git rev-parse --show-toplevel)"
docker run --rm -v "$repository_root:/app" -v tatolab-app-linux-node-modules:/app/node_modules -w /app ubuntu:22.04 bash -euo pipefail -c '
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq >/dev/null
  apt-get install -y -qq curl ca-certificates xz-utils xvfb dbus-x11 libnss3 libatk-bridge2.0-0 libgtk-3-0 libgbm1 libasound2 libxss1 libdrm2 libxshmfence1 >/dev/null
  curl -fsSL https://nodejs.org/dist/v22.23.1/node-v22.23.1-linux-arm64.tar.xz | tar -xJ -C /opt
  export PATH=/opt/node-v22.23.1-linux-arm64/bin:$PATH
  npm ci --ignore-scripts >/dev/null 2>&1 && node node_modules/electron/install.js >/dev/null
  npm run build >/dev/null && npm run build:electron >/dev/null
  stand_in=/tmp/stand-in && mkdir -p $stand_in/bin $stand_in/state /root/.local/bin
  cp proof/electron-linux-systemd/systemctl-stand-in $stand_in/bin/systemctl && touch $stand_in/state/tatolabd.service $stand_in/state/enabled
  cp proof/settings-linux/tatolab-cli-stand-in /root/.local/bin/tatolab
  export XDG_RUNTIME_DIR=/tmp/xdg-runtime && mkdir -p -m 0700 $XDG_RUNTIME_DIR
  export SYSTEMCTL_STAND_IN_STATE=$stand_in/state PATH=$stand_in/bin:$PATH
  export SYSTEMCTL_STAND_IN_RUNTIME="node /app/proof/settings-linux/local-api-stand-in.mjs $XDG_RUNTIME_DIR/streamlib/local-api.sock /root/.local/state/tatolab/logs"
  systemctl --user start tatolabd.service
  Xvfb :99 -screen 0 1440x900x24 >/dev/null 2>&1 & export DISPLAY=:99
  dbus-launch --exit-with-session npx electron . --no-sandbox --remote-debugging-port=9333 >/tmp/electron.log 2>&1 &
  sleep 12
  node proof/settings-linux/shoot-settings-over-devtools.mjs proof/settings
  tail -n 20 /tmp/electron.log
  echo "systemctl stand-in received:"; cat $stand_in/state/commands
'
