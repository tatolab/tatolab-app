#!/usr/bin/env bash
# Copyright (c) 2025 Jonathan Fontanez
# SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary
#
# Starts the systemd container from this folder's Dockerfile with the repository at /app, installs the runtime unit
# build-tatolabd-from-source.sh built as install.sh lays one out, enables and starts streamlib's tatolabd.service
# under ada's systemd user manager, and opens the app (built in the container) on Xvfb with dunst and pcmanfm.
# Usage (from the repository root): proof/settings-linux-real/start-the-systemd-container.sh <streamlib checkout>
set -euo pipefail
repository_root="$(git rev-parse --show-toplevel)"
streamlib_checkout="$(cd "$1" && pwd)"
docker build -q -t tatolab-linux-real-systemd "$repository_root/proof/settings-linux-real" >/dev/null
docker rm -f tatolab-linux-real >/dev/null 2>&1 || true
docker run -d --name tatolab-linux-real --privileged --cgroupns=host -v /sys/fs/cgroup:/sys/fs/cgroup:rw \
  -v "$repository_root:/app" -v tatolab-app-linux-node-modules:/app/node_modules -v tatolab-linux-real-runtime:/built-runtime:ro \
  -v "$streamlib_checkout/installer:/streamlib-installer:ro" tatolab-linux-real-systemd >/dev/null
sleep 6
docker exec tatolab-linux-real bash -c 'DEBIAN_FRONTEND=noninteractive apt-get install -y -qq pcmanfm xdotool mesa-vulkan-drivers iproute2 imagemagick libnotify-bin >/dev/null 2>&1'
as_ada=(docker exec -u ada -e HOME=/home/ada -e DISPLAY=:99 -e XDG_RUNTIME_DIR=/run/user/1000 -e DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus)
"${as_ada[@]}" tatolab-linux-real bash -euo pipefail -c '
  curl -LsSf https://astral.sh/uv/install.sh | sh >/dev/null 2>&1
  release=$HOME/.local/share/tatolab/0.55.2; mkdir -p $release $HOME/.local/bin $HOME/.config/systemd/user
  cp -R /built-runtime/unit/. $release/
  ln -sfn $release $HOME/.local/share/tatolab/current
  ln -sfn $HOME/.local/share/tatolab/current/bin/tatolab $HOME/.local/bin/tatolab
  cp /streamlib-installer/tatolabd.service $HOME/.config/systemd/user/
  systemctl --user daemon-reload && systemctl --user enable --quiet tatolabd.service && systemctl --user restart tatolabd.service
  xdg-mime default pcmanfm.desktop inode/directory'
docker exec -w /app tatolab-linux-real bash -c 'npm run build >/dev/null 2>&1 && npm run build:electron >/dev/null 2>&1'
"${as_ada[@]}" -d tatolab-linux-real bash -c 'Xvfb :99 -screen 0 1440x900x24 >/tmp/xvfb.log 2>&1'
sleep 2
"${as_ada[@]}" -d tatolab-linux-real bash -c 'dunst >/tmp/dunst.log 2>&1'
"${as_ada[@]}" -d -w /app tatolab-linux-real bash -c 'npx electron . --no-sandbox --remote-debugging-port=9333 >/tmp/electron.log 2>&1'
sleep 12
"${as_ada[@]}" tatolab-linux-real bash -c 'echo "tatolabd.service: $(systemctl --user is-enabled tatolabd.service)/$(systemctl --user is-active tatolabd.service)"; ~/.local/bin/tatolab --version | sed -n 2p; grep -c "Tatolab status changed" /tmp/electron.log'
