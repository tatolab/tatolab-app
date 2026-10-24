# Copyright (c) 2025 Jonathan Fontanez
# SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary
# ubuntu:24.04 with real systemd as PID 1, a user (ada, uid 1000) whose systemd user manager lingers, Xvfb, a
# notification server (dunst) on that user's session bus, Node for the app, and Electron's libraries.
FROM ubuntu:24.04
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update -qq && apt-get install -y -qq systemd systemd-sysv dbus dbus-user-session curl ca-certificates xz-utils xvfb dunst \
      libnss3 libatk-bridge2.0-0t64 libgtk-3-0t64 libgbm1 libasound2t64 libxss1 libdrm2 libxshmfence1 libnotify4 procps git >/dev/null \
 && curl -fsSL https://nodejs.org/dist/v22.23.1/node-v22.23.1-linux-arm64.tar.xz | tar -xJ -C /opt \
 && ln -s /opt/node-v22.23.1-linux-arm64/bin/node /usr/local/bin/node && ln -s /opt/node-v22.23.1-linux-arm64/bin/npm /usr/local/bin/npm \
 && ln -s /opt/node-v22.23.1-linux-arm64/bin/npx /usr/local/bin/npx \
 && (id -u ubuntu >/dev/null 2>&1 && userdel -r ubuntu || true) && useradd -m -u 1000 -s /bin/bash ada \
 && mkdir -p /var/lib/systemd/linger && touch /var/lib/systemd/linger/ada
STOPSIGNAL SIGRTMIN+3
CMD ["/sbin/init"]
