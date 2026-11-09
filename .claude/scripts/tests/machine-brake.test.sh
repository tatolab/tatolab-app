#!/usr/bin/env bash
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
# A test-root unit carries streamlib's marker and drives only a runtime under a test root; a unit
# without it is a real runtime's, whose CLI drives the owner's runtime.
test_root_unit="$test_project/test-root-streamlib/target/tatolab-runtime"
real_runtime_unit="$test_project/real-streamlib/target/tatolab-runtime"
mkdir -p "$test_root_unit/bin" "$real_runtime_unit/bin"
touch "$test_root_unit/machine-directories-under-a-test-root"

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
expect warn:publish 'apps/tato-app/scripts/build-tatolab-app.sh --notarize'
expect warn:publish 'bash apps/tato-app/scripts/notarize-and-staple.sh apps/tato-app/build/Tatolab.app'
expect warn:publish 'infisical run -- scripts/build-tatolab-app.sh --notarize'
expect warn:publish 'infisical run --env=prod -- scripts/notarize-and-staple.sh build/x.dmg'
expect warn:publish 'gh release upload v0.46.0 build/x.dmg'
expect warn:publish 'gh workflow run macos-app.yml -f publish=true'
expect warn:publish 'gh api -X POST repos/tatolab/tatolab-app/dispatches -f event_type=streamlib-release'

# Gaps the first review found.
expect warn:machine_runtime 'tatolab --json stop cam'
expect warn:machine_runtime 'tatolab expose main/camera/video --level preview'
expect warn:launchctl_job "sh -c 'launchctl bootout gui/501/com.tatolab.tatolabd'"
expect warn:systemd_service 'bash -c "systemctl --user stop tatolabd"'
expect warn:launchctl_job 'eval "launchctl kickstart -k gui/501/com.tatolab.tatolabd"'
expect warn:launchctl_job 'echo gui/501/com.tatolab.tatolabd | xargs launchctl kickstart -k'
expect warn:launchctl_job 'launchctl stop com.tatolab.tatolabd'
expect warn:systemd_service 'systemctl --user set-environment RUST_LOG=debug'
expect warn:launchctl_job "bash <<'SCRIPT'
launchctl bootout gui/501/com.tatolab.tatolabd
SCRIPT"
expect warn:runtime_installer 'bash <(curl -fsSL https://get.tatolab.com/install.sh)'
expect warn:app_launch 'npm run dev'
expect warn:app_launch 'npm run dev --workspace tato-app'
expect warn:app_launch 'npm -w tato-app run dev'
expect warn:app_launch 'npm --workspace=tato-app run dev'
expect warn:app_launch 'npx electron-vite dev --watch'
expect warn:app_launch 'npx electron-vite'
expect warn:app_launch 'npx electron-vite preview'
expect warn:app_launch './node_modules/.bin/electron-vite dev'
expect warn:app_launch 'npx electron .'
expect warn:app_launch 'ELECTRON_RENDERER_URL=http://localhost:5173 electron .'
expect warn:app_launch './node_modules/.bin/electron .'
expect warn:app_launch "open -a 'Tatolab'"
expect warn:machine_paths 'echo x > /usr/local/bin/tatolab'
expect warn:machine_paths 'echo x | sudo tee /usr/local/bin/tatolab'
expect warn:machine_paths 'sudo cp target/release/tatolab /usr/local/bin/'
expect warn:machine_paths 'sudo install -m 755 target/release/tatolab /usr/local/bin/'
expect warn:machine_paths 'rm -rf /Applications/Tatolab.app'
expect warn:machine_paths "sed -i '' s/x/y/ ~/Library/LaunchAgents/com.tatolab.tatolabd.plist"
expect warn:machine_paths 'find ~/Library/Application\ Support/Tatolab -delete'
expect warn:machine_paths 'defaults delete com.tatolab.tatolab'
expect warn:publish 'gh -R tatolab/streamlib release upload v0.46.0 build/x.dmg'
expect warn:publish 'gh --repo tatolab/streamlib release upload v0.46.0 build/x.dmg'
expect warn:publish "gh workflow run macos-app.yml -f publish='true'"
expect warn:publish 'gh api -X POST repos/tatolab/streamlib/releases/1/assets -F file=@x.dmg'
expect warn:publish 'git -C /tmp/homebrew-tap push origin main'

# Silent: read-only verbs, test roots, hermetic work, and commands quoted as text.
expect silent 'launchctl print gui/501/com.tatolab.tatolabd'
expect silent 'systemctl --user status tatolabd.service'
expect silent 'tatolab streams'
expect silent 'tatolab logs --stream main'
expect warn:machine_runtime 'TATOLAB_TEST_MACHINE_ROOT=/tmp/tatolab-proof tatolab stop main'
expect silent "TATOLAB_TEST_MACHINE_ROOT=/tmp/tatolab-proof $test_root_unit/bin/tatolab run --dir . --name a"
expect silent "$test_root_unit/bin/tatolabd"
expect warn:machine_runtime "$real_runtime_unit/bin/tatolab run --dir . --name a"
expect warn:machine_runtime "$real_runtime_unit/bin/tatolabd"
expect warn:machine_runtime '../streamlib/target/tatolab-runtime/bin/tatolabd'
expect silent "$real_runtime_unit/bin/tatolab streams"
expect silent 'tatolab exchange --channel main/camera/video --out /tmp/x --count 3'
expect silent 'tatolabd --version'
expect silent 'npm run build -- --local-proof-test-root'
expect silent 'npx electron-vite build'
expect silent 'npm test'
expect silent 'npx vitest run src/main/main.test.ts'
expect silent 'node scripts/serve_the_mock_window_in_a_browser.mjs'
expect silent 'node apps/tato-app/scripts/serve_the_mock_window_in_a_browser.mjs'
expect silent 'npx turbo run typecheck lint test'
expect silent 'scripts/build-tatolab-app.sh --local-proof-test-root'
expect silent 'infisical run -- scripts/build-tatolab-app.sh --local-proof-test-root'
expect silent 'gh pr create --title "fix: x" --body "ran launchctl kickstart and gh release upload"'
expect silent 'git commit -m "launchctl bootout gui/501"'
expect silent 'grep -rn "systemctl --user stop" README.md'
expect silent 'gh workflow run macos-app.yml'
expect silent "gh pr create --title 'ci: x' --body 'drops the manual step; gh release upload now runs in CI'"
expect silent 'gh pr create --title "x" --body "Steps:
xcrun notarytool submit build/x.dmg"'
expect silent "grep -rn 'tatolab stop; launchctl bootout' src/main"
expect silent "echo 'a; tatolab stop main'"
expect silent 'gh api repos/tatolab/streamlib/releases/latest'
expect silent 'open docs/Tatolab'
expect silent 'open "/tmp/verify-app/Tatolab window.png"'
expect silent 'brew install jq tatolab-cli-docs'
expect silent 'cat /usr/local/bin/tatolab'
expect silent 'git push -u origin chore/claude-operating-model'
expect silent 'cargo run --manifest-path ../streamlib/xtask/Cargo.toml'
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
