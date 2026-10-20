# Copyright (c) 2025 Jonathan Fontanez
# SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary
#
# Spike for #12: Electron's Chromium on ubuntu:22.04 (arm64 on the Mac) under Xvfb, with socat to
# carry the container's 127.0.0.1:4443 (QUIC) and :4446 (HTTP) to the host's runtime.
FROM ubuntu:22.04
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl xz-utils xvfb imagemagick socat dbus-x11 fonts-dejavu-core \
      libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libgtk-3-0 libgbm1 libasound2 \
      libxcomposite1 libxdamage1 libxrandr2 libxkbcommon0 libpango-1.0-0 libxshmfence1 libx11-xcb1 \
    && rm -rf /var/lib/apt/lists/*
RUN curl -fsSL https://nodejs.org/dist/v22.23.1/node-v22.23.1-linux-arm64.tar.xz | tar -xJ -C /opt \
    && ln -s /opt/node-v22.23.1-linux-arm64/bin/* /usr/local/bin/
WORKDIR /spike
