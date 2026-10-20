#!/usr/bin/env bash
# Copyright (c) 2025 Jonathan Fontanez
# SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary
#
# The machine-brake hook notes what reaches the owner's machine or the outside, stays silent on
# everything else, and prompts only where a config says `ask`. Runs against a temporary project
# directory and HOME, so no real config is read or written.
#
# Usage: .claude/scripts/tests/machine-brake.test.sh

set -uo pipefail

hook="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../hooks" && pwd)/machine-brake.sh"
test_project="$(mktemp -d)"
test_home="$(mktemp -d)"
trap 'rm -rf "$test_project" "$test_home"' EXIT
mkdir -p "$test_project/.claude"

failures=0
outcome_of() {
  local output
  output="$(jq -n --arg c "$1" '{tool_input: {command: $c}, cwd: "/tmp"}' \
    | HOME="$test_home" CLAUDE_PROJECT_DIR="$test_project" bash "$hook")"
  if [ -z "$output" ]; then
    echo silent
  elif [ "$(jq -r '.hookSpecificOutput.permissionDecision // ""' <<<"$output")" = ask ]; then
    echo "ask"
  else
    echo "warn:$(jq -r '.systemMessage' <<<"$output" | grep -oE 'machine-brake: [a-z_]+ noted' | awk '{print $2}')"
  fi
}
expect() {
  local expected="$1" command_text="$2" actual
  actual="$(outcome_of "$command_text")"
  if [ "$actual" = "$expected" ]; then
    echo "ok   $expected <= $command_text"
  else
    echo "FAIL expected $expected, got $actual <= $command_text"
    failures=$((failures + 1))
  fi
}

# Notes, by rule.
expect warn:launchctl_job 'launchctl kickstart -k gui/501/com.tatolab.tatolabd'
expect warn:launchctl_job 'launchctl \
  bootout gui/501/com.tatolab.tatolabd'
expect warn:systemd_service 'systemctl --user disable --now tatolabd.service'
expect warn:machine_runtime 'tatolab stop pattern-two'
expect warn:machine_runtime '/usr/local/bin/tatolab rm main'
expect warn:machine_runtime 'nohup tatolabd > /tmp/x.log 2>&1'
expect warn:app_launch 'open build/Tatolab.app'
expect warn:app_launch 'npx tauri dev'
expect warn:app_launch './build/linux/Tatolab-0.45.0-x86_64.AppImage'
expect warn:app_launch 'sudo apt install ./Tatolab-0.45.0-amd64.deb'
expect warn:brew_cask 'brew uninstall --cask tatolab'
expect warn:machine_paths 'cd /tmp && sudo rm -f /usr/local/bin/tatolab'
expect warn:machine_paths 'rm -rf ~/Library/Application\ Support/com.tatolab.tatolab'
expect warn:machine_paths 'tccutil reset Camera com.tatolab.tatolab'
expect warn:administrator_prompt 'osascript -e "do shell script \"true\" with administrator privileges"'
expect warn:runtime_installer 'curl -fsSL https://get.tatolab.com/install.sh | sh -s -- --uninstall'
expect warn:publish 'xcrun notarytool submit build/x.dmg --wait'
expect warn:publish 'bash scripts/notarize-and-staple.sh build/Tatolab.app'
expect warn:publish 'scripts/build-tatolab-app.sh --notarize'
expect warn:publish 'gh release upload v0.46.0 build/x.dmg'
expect warn:publish 'gh workflow run macos-app.yml -f publish=true'

# Silent: read-only verbs, test roots, hermetic work, and commands quoted as text.
expect silent 'launchctl print gui/501/com.tatolab.tatolabd'
expect silent 'systemctl --user status tatolabd.service'
expect silent 'tatolab streams'
expect silent 'tatolab logs --stream main'
expect silent 'TATOLAB_TEST_MACHINE_ROOT=/tmp/tatolab-proof tatolab run --dir . --name a'
expect silent 'tatolabd --version'
expect silent 'cargo test --manifest-path src-tauri/Cargo.toml --locked'
expect silent 'npm run dev'
expect silent 'scripts/build-tatolab-app.sh --local-proof-test-root'
expect silent 'gh pr create --title "fix: x" --body "ran launchctl kickstart and gh release upload"'
expect silent 'git commit -m "launchctl bootout gui/501"'
expect silent 'grep -rn "systemctl --user stop" README.md'
expect silent 'gh workflow run macos-app.yml'
expect silent "cat > notes.md <<'NOTES'
launchctl bootout gui/501/com.tatolab.tatolabd
NOTES"

# Config: a rule set to ask prompts; an allow glob silences; an ask glob prompts on anything.
printf '%s\n' '{"rules": {"publish": "ask"}}' >"$test_project/.claude/machine-brake.json"
expect ask 'gh release upload v0.46.0 build/x.dmg'
expect warn:launchctl_job 'launchctl kickstart -k gui/501/com.tatolab.tatolabd'
printf '%s\n' '{"allow": ["*launchctl kickstart*"], "ask": ["*make-it-ask*"]}' >"$test_project/.claude/machine-brake.local.json"
expect silent 'launchctl kickstart -k gui/501/com.tatolab.tatolabd'
expect ask 'echo make-it-ask'
printf '%s\n' '{"mode": "off"}' >"$test_project/.claude/machine-brake.local.json"
expect silent 'tatolab stop pattern-two'
expect ask 'gh release upload v0.46.0 build/x.dmg'
printf 'not json' >"$test_project/.claude/machine-brake.local.json"
expect warn:launchctl_job 'launchctl kickstart -k gui/501/com.tatolab.tatolabd'
if jq -n --arg c 'launchctl kickstart -k gui/501/x' '{tool_input: {command: $c}}' \
  | HOME="$test_home" CLAUDE_PROJECT_DIR="$test_project" bash "$hook" | jq -r '.systemMessage' | grep -q 'is not valid JSON, so it is ignored'; then
  echo "ok   an invalid config file is named in the note"
else
  echo "FAIL an invalid config file is not named in the note"; failures=$((failures + 1))
fi

[ "$failures" -eq 0 ] || { echo "$failures case(s) failed"; exit 1; }
echo "all machine-brake cases passed"
