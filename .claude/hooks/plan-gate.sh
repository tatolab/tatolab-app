#!/usr/bin/env bash
# Copyright (c) 2025 Jonathan Fontanez
# SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary
#
# plan-gate (PreToolUse / Edit|Write): source edits belong inside /implement against an issue.
#
#   src/ src-tauri/ scripts/ packaging/    requires .claude/state/active-ticket.json
#                                          (written by /implement once the plan is announced)
#
# NOT WIRED by default — streamlib keeps its twin unwired too, and CLAUDE.md carries the rule. To
# switch it on, add it to .claude/settings.json under PreToolUse with matcher "Edit|Write".
#
# Contract: exit 0 + permissionDecision "ask" routes the edit to the owner with the reason; plain
# exit 0 defers to the normal permission flow. It never denies: an edit the owner approves proceeds
# without a marker file, so a stale scope can never strand work that has to land.

command -v jq >/dev/null 2>&1 || exit 0
input="$(cat)"
edited_path="$(printf '%s' "$input" | jq -r '.tool_input.file_path // ""')"
[ -n "$edited_path" ] || exit 0

root="${CLAUDE_PROJECT_DIR:-$(pwd)}"
state_directory="$root/.claude/state"

relative_path="${edited_path#"$root"/}"
case "$relative_path" in
  .claude/worktrees/*) relative_path="${relative_path#.claude/worktrees/*/}" ;;
esac

case "$relative_path" in
  src/*|src-tauri/*|scripts/*|packaging/*)
    [ -f "$state_directory/active-ticket.json" ] && exit 0
    jq -n --arg reason 'Source edits belong inside /implement against a tatolab-app issue (.claude/state/active-ticket.json is missing). Approve to edit anyway — the change lands without issue traceability — or decline and run /implement.' \
      '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "ask", permissionDecisionReason: $reason}}'
    ;;
esac
exit 0
