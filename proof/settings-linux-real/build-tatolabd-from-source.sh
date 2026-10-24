#!/usr/bin/env bash
# Copyright (c) 2025 Jonathan Fontanez
# SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary
#
# Builds a real Tatolab runtime unit for arm64 Linux from a streamlib checkout, in ubuntu:24.04 with the system
# packages streamlib's Linux CI installs and the toolchain its rust-toolchain.toml pins, laid out as
# `cargo xtask build-runtime` lays one out: bin/tatolabd, bin/tatolab, bin/moq-relay (the pinned crate, as
# stage_local_relay.rs installs it), lib/tatolab/lend (streamlib's wheel, built with the pinned maturin) and
# lib/tatolab/watch (the preview page's web files, platform-neutral, copied from a runtime unit built from the same
# checkout). It carries no bundled Vulkan driver: streamlib builds that Mesa on x86_64 manylinux only. It is the
# runtime's own code, not the x86_64 release tarball. The unit lands in the tatolab-linux-real-runtime volume.
# Usage: build-tatolabd-from-source.sh <streamlib checkout> <a runtime unit built from it, for its watch page>
set -euo pipefail
streamlib_checkout="$(cd "$1" && pwd)"
watch_page_directory="$(cd "$2/lib/tatolab/watch" && pwd)"
docker run --rm -v "$streamlib_checkout:/streamlib-source:ro" -v "$watch_page_directory:/watch-page:ro" \
  -v tatolab-linux-real-cargo-target:/target -v tatolab-linux-real-runtime:/runtime -e CARGO_TARGET_DIR=/target ubuntu:24.04 bash -euo pipefail -c '
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq >/dev/null
  apt-get install -y -qq curl ca-certificates build-essential git pkg-config protobuf-compiler libclang1-18 libclang-common-18-dev libvulkan-dev glslc cmake ninja-build python3 python3-venv unzip rsync >/dev/null
  curl -fsSL https://sh.rustup.rs | sh -s -- -y -q --default-toolchain none >/dev/null; . "$HOME/.cargo/env"
  curl -LsSf https://astral.sh/uv/install.sh | sh >/dev/null 2>&1; export PATH="$HOME/.local/bin:$PATH"
  rsync -a --exclude target /streamlib-source/ /streamlib/ && cd /streamlib && rustup toolchain install >/dev/null 2>&1
  cargo build --release --locked --bin tatolabd --bin tatolab
  cargo install moq-relay --version =0.17.7 --locked --no-default-features --features noq,websocket --root /target/local-relay
  (cd sdk/streamlib-python-wheel && uvx maturin@1.9.6 build --release --out /target/wheel)
  rm -rf /runtime/unit && mkdir -p /runtime/unit/bin /runtime/unit/lib/tatolab/lend
  cp /target/release/tatolabd /target/release/tatolab /target/local-relay/bin/moq-relay /runtime/unit/bin/
  unzip -q -o /target/wheel/streamlib-*.whl -d /runtime/unit/lib/tatolab/lend
  cp -R /watch-page /runtime/unit/lib/tatolab/watch
  /runtime/unit/bin/tatolabd --version; /runtime/unit/bin/tatolab --version | head -1; ls /runtime/unit/lib/tatolab/lend/tatolab/runtime | head -5
'
