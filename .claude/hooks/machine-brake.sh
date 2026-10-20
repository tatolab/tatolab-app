#!/usr/bin/env bash
# Copyright (c) 2025 Jonathan Fontanez
# SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary
#
# machine-brake (PreToolUse / Bash): notes a Bash command that reaches past the repository — into
# the owner's real Tatolab runtime, the machine's service manager, the machine's Tatolab paths, or
# out to Apple, GitHub releases or the Homebrew tap. Advisory by default: every rule's outcome is
# `warn` unless a config sets otherwise, and it never denies.
#
# Config — ~/.claude/machine-brake.json, .claude/machine-brake.json (checked in) and
# .claude/machine-brake.local.json (yours, untracked), read in that order. Later files win on
# `mode`, `rules` and `preferences`; `allow` and `ask` lists concatenate.
#
#   {
#     "mode": "warn",                                   warn | ask | off — default for every rule
#     "rules": { "publish": "ask" },                    one rule's outcome
#     "allow": [ "*systemctl --user status*" ],         globs on the whole command: stay silent
#     "ask":   [ "*brew uninstall*" ],                  globs on the whole command: prompt
#     "preferences": "text appended to the note the model reads"
#   }
#
# Precedence: an `ask` glob, then an `allow` glob, then the rule's own outcome, then `mode`.
# `.claude/scripts/machine-brake` edits and dry-runs this config.
#
# Output: warn = exit 0 + JSON with `systemMessage` (owner) and `additionalContext` (model);
# ask = exit 0 + `permissionDecision: "ask"`; off or no match = exit 0, no output. Never exit 2.
set -o pipefail

RULE_NAMES='launchctl_job systemd_service machine_runtime app_launch brew_cask machine_paths administrator_prompt runtime_installer publish'
HELPER='.claude/scripts/machine-brake'
root="${CLAUDE_PROJECT_DIR:-$(pwd)}"
command -v jq >/dev/null 2>&1 || exit 0

# ── config ───────────────────────────────────────────────────────────
config_files=("$HOME/.claude/machine-brake.json" "$root/.claude/machine-brake.json" "$root/.claude/machine-brake.local.json")
config_problems=""
fragments=('{}')
for config_file in "${config_files[@]}"; do
  [ -f "$config_file" ] || continue
  if fragment="$(jq -c '.' "$config_file" 2>/dev/null)"; then
    fragments+=("$fragment")
  else
    config_problems="${config_problems}${config_file} is not valid JSON, so it is ignored. "
  fi
done
config="$(printf '%s\n' "${fragments[@]}" | jq -s --arg names "$RULE_NAMES" '
  def outcome: type == "string" and (. as $v | ["warn", "ask", "off"] | index($v) != null);
  def object_or_empty: if type == "object" then . else {} end;
  def strings_or_empty: if type == "array" then map(strings) else [] end;
  ($names | split(" ")) as $known
  | reduce .[] as $raw (
      {mode: "warn", rules: {}, allow: [], ask: [], preferences: "", invalid: []};
      ($raw | object_or_empty) as $c
      | .mode = (if ($c.mode | outcome) then $c.mode else .mode end)
      | .invalid += (if $c.mode != null and ($c.mode | outcome | not) then ["mode=\($c.mode | tojson)"] else [] end)
      | ($c.rules | object_or_empty) as $rules
      | .rules += ($rules | with_entries(select((.key | IN($known[])) and (.value | outcome))))
      | .invalid += ($rules | to_entries
                     | map(select((.key | IN($known[]) | not) or (.value | outcome | not))
                           | "rules.\(.key)=\(.value | tojson)"))
      | .allow += ($c.allow | strings_or_empty)
      | .ask += ($c.ask | strings_or_empty)
      | .preferences = (if ($c.preferences | type) == "string" then $c.preferences else .preferences end))
')"
invalid_entries="$(jq -r '.invalid | join(", ")' <<<"$config")"
[ -z "$invalid_entries" ] \
  || config_problems="${config_problems}Ignored machine-brake config entries ${invalid_entries} (outcomes are warn, ask or off; rules are ${RULE_NAMES// /, }). "

if [ "${1:-}" = "--show-config" ]; then
  jq --arg problems "$config_problems" --args \
    '{config: del(.invalid), sources: $ARGS.positional, problems: $problems}' \
    "${config_files[@]}" <<<"$config"
  exit 0
fi

# ── the command ──────────────────────────────────────────────────────
input="$(cat)"
cmd="$(printf '%s' "$input" | jq -r '.tool_input.command // ""' 2>/dev/null)"
[ -n "$cmd" ] || exit 0

# A heredoc body is data, not a command line: a README, a PR body, a script being written.
read -r -d '' STRIP_HEREDOC_BODIES <<'AWK' || true
in_body {
  line = $0
  sub(/^[[:space:]]+/, "", line); sub(/[[:space:]]+$/, "", line)
  if (line == tag) in_body = 0
  next
}
{ print }
match($0, /(^|[^<])<<-?[[:space:]]*["'\\]?[A-Za-z_][A-Za-z0-9_]*/) {
  tag = substr($0, RSTART, RLENGTH)
  sub(/^.?<<-?[[:space:]]*["'\\]?/, "", tag)
  in_body = 1
}
AWK
# Backslash continuations are joined in awk: BSD sed (macOS) has no GNU `N`-loop join.
stripped="$(printf '%s\n' "$cmd" | awk "$STRIP_HEREDOC_BODIES" \
  | awk '{ if (sub(/\\$/, "")) { pending = pending $0 " " } else { print pending $0; pending = "" } } END { if (pending != "") print pending }')"

# Segments: one simple command each. `curl … | sh` is judged on its whole line first, below.
segments="$(printf '%s\n' "$stripped" | awk '{ gsub(/;|&&|\|\||\|/, "\n"); print }')"

matched_rules=""
matched_example=""
note_rule() {
  case " $matched_rules " in *" $1 "*) ;; *) matched_rules="${matched_rules:+$matched_rules }$1" ;; esac
  [ -n "$matched_example" ] || matched_example="$2"
}

# The installer is piped into a shell, so its two halves sit in two segments.
while IFS= read -r command_line; do
  if printf '%s' "$command_line" | grep -Eq 'get\.tatolab\.com/install\.sh' \
     && printf '%s' "$command_line" | grep -Eq '\|[[:space:]]*(sudo[[:space:]]+)?(ba|z|da)?sh([[:space:]]|$)'; then
    note_rule runtime_installer "$command_line"
  fi
done <<<"$stripped"

ENV_ASSIGNMENT='^[A-Za-z_][A-Za-z0-9_]*=("[^"]*"|'"'"'[^'"'"']*'"'"'|[^[:space:]]*)[[:space:]]+'
MACHINE_PATH_PATTERN='/usr/local/bin/tatolab|/Library/Application\\? Support/Tatolab|Library/Application\\? Support/com\.tatolab\.tatolab|\.local/(state|share|bin)/tatolab|systemd/user/tatolabd|LaunchAgents/com\.tatolab'

while IFS= read -r segment; do
  segment="$(printf '%s' "$segment" | sed -E 's/^[[:space:]]*\(*[[:space:]]*//; s/[[:space:]]+$//')"
  [ -n "$segment" ] || continue
  original_segment="$segment"
  sets_a_test_root=0
  # Peel env assignments and exec wrappers to reach the command word.
  for _ in 1 2 3 4 5 6; do
    if printf '%s' "$segment" | grep -Eq "$ENV_ASSIGNMENT"; then
      printf '%s' "$segment" | grep -Eq '^TATOLAB_TEST_MACHINE_ROOT=' && sets_a_test_root=1
      segment="$(printf '%s' "$segment" | sed -E "s/$ENV_ASSIGNMENT//")"
      continue
    fi
    case "$segment" in
      sudo\ *|env\ *|nohup\ *|command\ *|exec\ *|time\ *) segment="${segment#* }" ;;
      timeout\ *) segment="$(printf '%s' "$segment" | sed -E 's/^timeout[[:space:]]+[^[:space:]]+[[:space:]]+//')" ;;
      bash\ *|sh\ *|zsh\ *)
        next_word="$(printf '%s' "${segment#* }" | awk '{print $1}')"
        case "$next_word" in -*) break ;; *) segment="${segment#* }" ;; esac
        ;;
      *) break ;;
    esac
  done
  command_word="$(printf '%s' "$segment" | awk '{print $1}')"
  command_name="${command_word##*/}"
  arguments=" ${segment#"$command_word"} "

  case "$command_name" in
    # Text tools carry a command as an argument, never as a launch.
    git|sed|grep|rg|awk|perl|echo|printf|cat|jq|diff|tee|head|tail|less|man|which|type|ls|find|wc) continue ;;
    gh)
      if printf '%s' "$arguments" | grep -Eq '^[[:space:]]+release[[:space:]]+(create|upload|edit|delete)\b' \
         || { printf '%s' "$arguments" | grep -Eq '^[[:space:]]+workflow[[:space:]]+run\b' \
              && printf '%s' "$arguments" | grep -Eq 'publish=true'; }; then
        note_rule publish "$original_segment"
      fi
      continue
      ;;
    launchctl)
      printf '%s' "$arguments" | grep -Eq '^[[:space:]]+(bootstrap|bootout|kickstart|load|unload|enable|disable|remove|kill|submit)\b' \
        && note_rule launchctl_job "$original_segment"
      ;;
    systemctl)
      printf '%s' "$arguments" | grep -Eq '[[:space:]](start|stop|restart|reload|try-restart|enable|disable|reenable|mask|unmask|kill|reset-failed|daemon-reload|edit|revert|link|preset)\b' \
        && note_rule systemd_service "$original_segment"
      ;;
    tatolab|tatolab-cli)
      [ "$sets_a_test_root" -eq 1 ] && continue
      printf '%s' "$arguments" | grep -Eq '^[[:space:]]+(run|dev|stop|rm|start|restart|kill)\b' \
        && note_rule machine_runtime "$original_segment"
      ;;
    tatolabd)
      [ "$sets_a_test_root" -eq 1 ] && continue
      printf '%s' "$arguments" | grep -Eq '[[:space:]](--help|-h|--version|-V)\b' || note_rule machine_runtime "$original_segment"
      ;;
    open)
      printf '%s' "$arguments" | grep -Eq 'Tatolab(\.app|[[:space:]]|$)|com\.tatolab' && note_rule app_launch "$original_segment"
      ;;
    Tatolab|Tatolab-*.AppImage|*.AppImage)
      note_rule app_launch "$original_segment"
      ;;
    npx|npm)
      printf '%s' "$arguments" | grep -Eq '(^|[[:space:]])tauri[[:space:]]+dev\b' && note_rule app_launch "$original_segment"
      ;;
    apt|apt-get|dpkg)
      printf '%s' "$arguments" | grep -Eiq '[[:space:]](install|remove|purge|-i|-r|-P)\b' \
        && printf '%s' "$arguments" | grep -Eq '[Tt]atolab' && note_rule app_launch "$original_segment"
      ;;
    brew)
      printf '%s' "$arguments" | grep -Eq '^[[:space:]]+(install|uninstall|reinstall|upgrade|remove|rm)\b' \
        && printf '%s' "$arguments" | grep -Eq 'tatolab' && note_rule brew_cask "$original_segment"
      ;;
    rm|ln|mv|cp|install|touch|mkdir|rmdir|chmod|chown|trash|ditto|rsync)
      printf '%s' "$original_segment" | grep -Eq "$MACHINE_PATH_PATTERN" && note_rule machine_paths "$original_segment"
      ;;
    tccutil|sfltool)
      note_rule machine_paths "$original_segment"
      ;;
    osascript)
      printf '%s' "$arguments" | grep -Eiq 'administrator privileges' && note_rule administrator_prompt "$original_segment"
      ;;
    xcrun)
      printf '%s' "$arguments" | grep -Eq '^[[:space:]]+(notarytool[[:space:]]+(submit|store-credentials)|stapler[[:space:]]+staple)\b' \
        && note_rule publish "$original_segment"
      ;;
    notarize-and-staple.sh|bump-homebrew-cask.sh)
      note_rule publish "$original_segment"
      ;;
    build-tatolab-app.sh)
      printf '%s' "$arguments" | grep -Eq '[[:space:]]--notarize\b' && note_rule publish "$original_segment"
      ;;
  esac
done <<<"$segments"

# ── the outcome ──────────────────────────────────────────────────────
glob_hit() {
  local pattern
  while IFS= read -r pattern; do
    [ -n "$pattern" ] || continue
    # shellcheck disable=SC2053
    if [[ "$cmd" == $pattern ]]; then
      printf '%s' "$pattern"
      return 0
    fi
  done < <(jq -r --arg list "$1" '.[$list][]' <<<"$config")
  return 1
}
rule_outcome() { jq -r --arg rule "$1" '.rules[$rule] // .mode' <<<"$config"; }
rule_outcome_source() {
  if [ -n "$(jq -r --arg rule "$1" '.rules[$rule] // ""' <<<"$config")" ]; then printf 'rules.%s' "$1"; else printf 'mode'; fi
}

outcome=""
ask_source=""
stop_asking=""
if ask_glob="$(glob_hit ask)"; then
  outcome=ask
  ask_source="the ask glob '${ask_glob}'"
  stop_asking="${HELPER} remove '${ask_glob}'"
  [ -n "$matched_rules" ] || note_rule ask_glob "$cmd"
elif glob_hit allow >/dev/null; then
  exit 0
elif [ -z "$matched_rules" ]; then
  exit 0
else
  outcome=off
  for rule in $matched_rules; do
    case "$(rule_outcome "$rule")" in
      ask)
        outcome=ask
        ask_source="$(rule_outcome_source "$rule")"
        stop_asking="${HELPER} rule ${rule} warn"
        ;;
      warn) [ "$outcome" = ask ] || outcome=warn ;;
    esac
  done
  [ "$outcome" != off ] || exit 0
fi

# ── the messages ─────────────────────────────────────────────────────
describe_rule() {
  case "$1" in
    launchctl_job) printf 'changing a launchd job, which can stop, start or unregister the runtime agent' ;;
    systemd_service) printf 'changing a systemd unit, which can stop, start or disable tatolabd.service' ;;
    machine_runtime) printf "driving the machine's runtime (tatolab run/stop/rm, or a second tatolabd) instead of a test-root one" ;;
    app_launch) printf 'launching or installing the real app, which registers or switches the runtime agent' ;;
    brew_cask) printf "installing or removing the Tatolab cask on this machine" ;;
    machine_paths) printf "writing or removing the machine's Tatolab paths, state or permissions" ;;
    administrator_prompt) printf 'showing a real administrator prompt' ;;
    runtime_installer) printf 'running the runtime installer against this machine' ;;
    publish) printf 'sending something outside: notarization, a release upload, or the Homebrew tap' ;;
    ask_glob) printf 'a command matching an ask glob in the machine-brake config' ;;
  esac
}
rules_text=""
first_rule=""
for rule in $matched_rules; do
  [ -n "$first_rule" ] || first_rule="$rule"
  rules_text="${rules_text:+$rules_text, }${rule} ($(describe_rule "$rule"))"
done
suggested_glob="*$(printf '%s' "$matched_example" | cut -c1-60 | sed -E 's/^[[:space:]]+//; s/([][*?\\])/\\\1/g; s/'"'"'/?/g')*"
preferences="$(jq -r '.preferences' <<<"$config")"

if [ "$outcome" = ask ]; then
  reason="${config_problems}machine-brake: ${rules_text}. Set to ask by ${ask_source}. Approve to run it; decline and the session uses a local-proof test root, the mock window, or hands the command to you. To stop asking: ${stop_asking}"
  jq -n --arg reason "$reason" \
    '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "ask", permissionDecisionReason: $reason}}'
  exit 0
fi

system_message="${config_problems}machine-brake: ${first_rule} noted, not a prompt. Silence it: ${HELPER} rule ${first_rule} off  or  ${HELPER} allow '${suggested_glob}'"
context="machine-brake note, advisory only, nothing was blocked: this command matched ${rules_text}. It acts on the owner's real machine or sends something outside the repository. That is fine when the owner asked for it. Otherwise prefer the hermetic path — tests with the fake local API server, the mock window (npm run dev), or a local-proof build under TATOLAB_TEST_MACHINE_ROOT — and say what you ran. Read-only verbs (launchctl print, systemctl --user status, tatolab streams/graph/logs) never trigger this note. Owner preferences: ${preferences:-none recorded}. The owner can silence this with \`${HELPER} rule ${first_rule} off\` or \`${HELPER} allow '${suggested_glob}'\`; offer that if they say the command is fine, and never add an exception yourself."
jq -n --arg message "$system_message" --arg context "$context" \
  '{systemMessage: $message, hookSpecificOutput: {hookEventName: "PreToolUse", additionalContext: $context}}'
exit 0
