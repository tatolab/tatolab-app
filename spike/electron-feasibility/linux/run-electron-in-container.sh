#!/usr/bin/env bash
# Copyright (c) 2025 Jonathan Fontanez
# SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary
#
# Spike for #12, inside the ubuntu:22.04 container: carries 127.0.0.1:4443 (UDP, QUIC) and
# 127.0.0.1:4446 / :4443 (TCP) to the host's runtime, starts Xvfb, opens the spike's Electron
# window on <page>, and after <seconds> captures the screen to <png>.
#
# Usage: run-electron-in-container.sh <page> <seconds> <png>
set -euo pipefail
page="$1"; settle_seconds="$2"; screenshot="$3"
host_address="$(getent ahostsv4 host.docker.internal | awk 'NR==1{print $1}')"
socat UDP4-RECVFROM:4443,bind=127.0.0.1,fork UDP4-SENDTO:"$host_address":4443 &
socat TCP4-LISTEN:4443,bind=127.0.0.1,fork,reuseaddr TCP4:"$host_address":4443 &
socat TCP4-LISTEN:4446,bind=127.0.0.1,fork,reuseaddr TCP4:"$host_address":4446 &
Xvfb :99 -screen 0 1280x800x24 &
export DISPLAY=:99
sleep 2
cd /spike
./node_modules/.bin/electron --no-sandbox . --window="$page" > "${screenshot%.png}.log" 2>&1 &
sleep "$settle_seconds"
import -window root "$screenshot"
uname -srm > "${screenshot%.png}.uname"
