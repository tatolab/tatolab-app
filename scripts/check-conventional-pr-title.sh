#!/usr/bin/env bash
# Copyright (c) 2025 Jonathan Fontanez
# SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary
#
# Exits non-zero unless the title given is a conventional-commit title (`type(scope): summary`).
# The PR title names the change on main — it is the commit a squash merge writes and the subject
# of a merge commit's PR — so the history stays readable by type.
#
# Usage: scripts/check-conventional-pr-title.sh "<title>"

set -euo pipefail

pull_request_title="${1:?usage: $0 \"<pull request title>\"}"
if printf '%s' "$pull_request_title" | grep -qE '^(feat|fix|perf|refactor|docs|chore|test|ci|build|revert)(\([a-z0-9._-]+\))?!?: .+'; then
  exit 0
fi
echo "not a conventional-commit title: $pull_request_title" >&2
echo "expected type(scope): summary, type one of feat fix perf refactor docs chore test ci build revert" >&2
exit 1
