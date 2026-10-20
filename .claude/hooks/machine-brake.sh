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
session_cwd="$(printf '%s' "$input" | jq -r '.cwd // ""' 2>/dev/null)"
[ -n "$cmd" ] || exit 0

# A heredoc body is data — a README, a PR body, a file being written — unless the heredoc feeds a
# shell (`bash <<EOF`, `ssh host <<EOF`), whose body is commands.
read -r -d '' STRIP_HEREDOC_BODIES <<'AWK' || true
in_body {
  line = $0
  sub(/^[[:space:]]+/, "", line); sub(/[[:space:]]+$/, "", line)
  if (line == tag) { in_body = 0; next }
  if (keep_body) print
  next
}
{ print }
match($0, /(^|[^<])<<-?[[:space:]]*["'\\]?[A-Za-z_][A-Za-z0-9_]*/) {
  tag = substr($0, RSTART, RLENGTH)
  sub(/^.?<<-?[[:space:]]*["'\\]?/, "", tag)
  keep_body = ($0 ~ /(^|[;&|(][[:space:]]*|^[[:space:]]*)((ba|z|da)?sh|ssh)([[:space:]][^<]*)?<</)
  in_body = 1
}
AWK

# Backslash continuations are joined in awk: BSD sed (macOS) has no GNU `N`-loop join.
read -r -d '' JOIN_CONTINUATIONS <<'AWK' || true
{ if (sub(/\\$/, "")) { pending = pending $0 " " } else { print pending $0; pending = "" } }
END { if (pending != "") print pending }
AWK

# Simple commands, one per \036-terminated record: the whole command line is read at once and split
# on ; & | and newlines only outside quotes, so a quoted PR body or grep pattern — even one that
# spans lines — stays one argument of one command.
read -r -d '' SPLIT_OUTSIDE_QUOTES <<'AWK' || true
BEGIN { RS = "\001"; ORS = "\036" }
{
  segment = ""; quote = ""
  for (i = 1; i <= length($0); i++) {
    c = substr($0, i, 1)
    if (quote == "") {
      if (c == "\\") { segment = segment c substr($0, i + 1, 1); i++; continue }
      if (c == "'" || c == "\"") quote = c
      else if (c == ";" || c == "&" || c == "|" || c == "\n") { print segment; segment = ""; continue }
    } else if (c == quote) quote = ""
    else if (quote == "\"" && c == "\\") { segment = segment c substr($0, i + 1, 1); i++; continue }
    segment = segment c
  }
  print segment
}
AWK

# The segment with every quoted span blanked, to find shell operators (`>`) that are really
# operators.
read -r -d '' BLANK_QUOTED_SPANS <<'AWK' || true
{
  out = ""; quote = ""
  for (i = 1; i <= length($0); i++) {
    c = substr($0, i, 1)
    if (quote == "") { if (c == "'" || c == "\"") quote = c; out = out c }
    else if (c == quote) { quote = ""; out = out c }
    else out = out "_"
  }
  print out
}
AWK

matched_rules=""
matched_example=""
note_rule() {
  case " $matched_rules " in *" $1 "*) ;; *) matched_rules="${matched_rules:+$matched_rules }$1" ;; esac
  [ -n "$matched_example" ] || matched_example="$2"
}

ENV_ASSIGNMENT='^[A-Za-z_][A-Za-z0-9_]*=("[^"]*"|'"'"'[^'"'"']*'"'"'|[^[:space:]]*)[[:space:]]+'
MACHINE_PATH_PATTERN='/usr/local/bin/?([[:space:]"'"'"']|$)|/usr/local/bin/tatolab|/Applications/Tatolab\.app|/Library/Application\\? Support/Tatolab|Library/Application\\? Support/com\.tatolab\.tatolab|\.local/(state|share|bin)/tatolab|systemd/user/tatolabd|LaunchAgents/com\.tatolab'

# The single-quoted or double-quoted argument at the start of $1, without its quotes.
unquote_leading_argument() {
  case "$1" in
    \'*) printf '%s' "${1#\'}" | sed -E "s/'.*$//" ;;
    \"*) printf '%s' "${1#\"}" | sed -E 's/"[[:space:]]*$//' ;;
    *) printf '%s' "$1" ;;
  esac
}

classify_command_line() {
  local command_line="$1" nesting_depth="$2" segment original_segment command_word command_name
  local arguments blanked_segment next_word inner_command_line changed_into_src_tauri=0
  [ "$nesting_depth" -le 3 ] || return 0

  # The installer is piped or substituted into a shell, so its halves are judged on the line.
  if printf '%s' "$command_line" | grep -Eq 'get\.tatolab\.com/install\.sh' \
     && printf '%s' "$command_line" | grep -Eq '\|[[:space:]]*(sudo[[:space:]]+)?(ba|z|da)?sh([[:space:]]|$)|(ba|z|da)?sh[[:space:]]+<\('; then
    note_rule runtime_installer "$command_line"
  fi

  while IFS= read -r -d $'\036' segment; do
    segment="${segment//$'\n'/ }"
    segment="$(printf '%s' "$segment" | sed -E 's/^[[:space:]]*[({]*[[:space:]]*//; s/[[:space:]]*[)}]*[[:space:]]*$//')"
    [ -n "$segment" ] || continue
    original_segment="$segment"

    # Peel env assignments and exec wrappers to reach the command word.
    for _ in 1 2 3 4 5 6 7 8; do
      if printf '%s' "$segment" | grep -Eq "$ENV_ASSIGNMENT"; then
        segment="$(printf '%s' "$segment" | sed -E "s/$ENV_ASSIGNMENT//")"
        continue
      fi
      case "$segment" in
        sudo\ *|env\ *|nohup\ *|command\ *|exec\ *|time\ *|nice\ *) segment="${segment#* }" ;;
        timeout\ *) segment="$(printf '%s' "$segment" | sed -E 's/^timeout[[:space:]]+[^[:space:]]+[[:space:]]+//')" ;;
        xargs\ *) segment="$(printf '%s' "$segment" | sed -E 's/^xargs([[:space:]]+-[^[:space:]]+)*[[:space:]]+//')" ;;
        *) break ;;
      esac
      segment="$(printf '%s' "$segment" | sed -E 's/^[[:space:]]+//')"
    done

    command_word="$(printf '%s' "$segment" | awk '{print $1}')"
    command_name="${command_word##*/}"
    arguments=" ${segment#"$command_word"} "
    blanked_segment="$(printf '%s\n' "$segment" | awk "$BLANK_QUOTED_SPANS")"

    # A shell's -c string, an eval string, and a script path are command lines of their own.
    case "$command_name" in
      bash|sh|zsh|dash|eval)
        if [ "$command_name" = eval ]; then
          inner_command_line="$(unquote_leading_argument "$(printf '%s' "$arguments" | sed -E 's/^[[:space:]]+//')")"
          classify_command_line "$inner_command_line" $((nesting_depth + 1))
          continue
        fi
        if printf '%s' "$arguments" | grep -Eq '^[[:space:]]+(-[a-z]*c)[[:space:]]'; then
          inner_command_line="$(unquote_leading_argument "$(printf '%s' "$arguments" | sed -E 's/^[[:space:]]+-[a-z]*c[[:space:]]+//')")"
          classify_command_line "$inner_command_line" $((nesting_depth + 1))
          continue
        fi
        next_word="$(printf '%s' "$arguments" | awk '{print $1}')"
        case "$next_word" in
          ""|-*) continue ;;
          *) segment="${segment#* }"; command_word="$next_word"; command_name="${next_word##*/}"; arguments=" ${segment#"$command_word"} " ;;
        esac
        ;;
      cd)
        case "$arguments" in *src-tauri*) changed_into_src_tauri=1 ;; esac
        continue
        ;;
    esac

    # Writing a machine path: a write verb, an output redirect, tee, sed -i or find -delete onto
    # one — whatever the command word.
    if printf '%s' "$original_segment" | grep -Eq "$MACHINE_PATH_PATTERN"; then
      case "$command_name" in
        rm|ln|mv|cp|install|touch|mkdir|rmdir|chmod|chown|trash|ditto|rsync|tee|unlink|truncate)
          note_rule machine_paths "$original_segment" ;;
        *)
          if printf '%s' "$blanked_segment" | grep -Eq '>' \
             || { [ "$command_name" = sed ] && printf '%s' "$arguments" | grep -Eq '[[:space:]]-i'; } \
             || { [ "$command_name" = find ] && printf '%s' "$arguments" | grep -Eq '[[:space:]](-delete|-exec[[:space:]]+rm)'; }; then
            note_rule machine_paths "$original_segment"
          fi
          ;;
      esac
    fi

    case "$command_name" in
      # Text tools carry a command as an argument, never as a launch.
      sed|grep|rg|awk|perl|echo|printf|cat|jq|diff|tee|head|tail|less|man|which|type|ls|find|wc) continue ;;
      git)
        printf '%s' "$arguments" | grep -Eq '[[:space:]]push([[:space:]]|$)' \
          && printf '%s' "$original_segment $session_cwd" | grep -Eq 'homebrew-tap' \
          && note_rule publish "$original_segment"
        continue
        ;;
      gh)
        local gh_arguments
        gh_arguments="$(printf '%s' "$arguments" | sed -E 's/^[[:space:]]*((-R|--repo|--hostname)([[:space:]]+|=)[^[:space:]]+[[:space:]]+)*//')"
        if printf '%s' " $gh_arguments" | grep -Eq '^[[:space:]]+release[[:space:]]+(create|upload|edit|delete)([[:space:]]|$)' \
           || { printf '%s' " $gh_arguments" | grep -Eq '^[[:space:]]+workflow[[:space:]]+run([[:space:]]|$)' \
                && printf '%s' "$gh_arguments" | grep -Eq "publish=[\"']?true"; } \
           || { printf '%s' " $gh_arguments" | grep -Eq '^[[:space:]]+api([[:space:]]|$)' \
                && { printf '%s' "$gh_arguments" | grep -Eq '/dispatches([[:space:]/?"'"'"']|$)' \
                     || { printf '%s' "$gh_arguments" | grep -Eq '/releases' \
                          && printf '%s' "$gh_arguments" | grep -Eq '(-X|--method)[[:space:]=]*(POST|PATCH|PUT|DELETE)|[[:space:]]-[fF][[:space:]]|--(raw-)?field|--input'; }; }; }; then
          note_rule publish "$original_segment"
        fi
        continue
        ;;
      launchctl)
        printf '%s' "$arguments" | grep -Eq '^[[:space:]]+(bootstrap|bootout|kickstart|load|unload|enable|disable|remove|kill|submit|start|stop|setenv|unsetenv)([[:space:]]|$)' \
          && note_rule launchctl_job "$original_segment"
        ;;
      systemctl)
        printf '%s' "$arguments" | grep -Eq '[[:space:]](start|stop|restart|reload|try-restart|enable|disable|reenable|mask|unmask|kill|reset-failed|daemon-reload|edit|revert|link|preset|isolate|set-environment|unset-environment)([[:space:]]|$)' \
          && note_rule systemd_service "$original_segment"
        ;;
      tatolab|tatolab-cli)
        case "$command_word" in */target/tatolab-runtime/bin/tatolab|*/target/tatolab-runtime/bin/tatolabd) continue ;; esac
        printf '%s' "$arguments" | awk '{ for (i = 1; i <= NF; i++) if ($i !~ /^-/) { print $i; exit } }' \
          | grep -Eqx 'run|dev|stop|start|rm|expose|enable-virtual-camera' \
          && note_rule machine_runtime "$original_segment"
        ;;
      tatolabd)
        case "$command_word" in */target/tatolab-runtime/bin/tatolab|*/target/tatolab-runtime/bin/tatolabd) continue ;; esac
        printf '%s' "$arguments" | grep -Eq '[[:space:]](--help|-h|--version|-V)([[:space:]]|$)' || note_rule machine_runtime "$original_segment"
        ;;
      open)
        printf '%s' "$arguments" | grep -Eq "Tatolab\\.app|[[:space:]]-a[[:space:]]+[\"']?Tatolab([\"'[:space:]]|\$)|[[:space:]]-b[[:space:]]+[\"']?com\\.tatolab" \
          && note_rule app_launch "$original_segment"
        ;;
      Tatolab|Tatolab-*.AppImage|*.AppImage)
        note_rule app_launch "$original_segment"
        ;;
      npx|npm)
        printf '%s' "$arguments" | grep -Eq '(^|[[:space:]])tauri[[:space:]]+(--[[:space:]]+)?dev([[:space:]]|$)' && note_rule app_launch "$original_segment"
        ;;
      cargo)
        if printf '%s' "$arguments" | grep -Eq '^[[:space:]]+tauri[[:space:]]+dev([[:space:]]|$)'; then
          note_rule app_launch "$original_segment"
        elif printf '%s' "$arguments" | grep -Eq '^[[:space:]]+run([[:space:]]|$)' \
             && { [ "$changed_into_src_tauri" -eq 1 ] \
                  || printf '%s' "$arguments" | grep -Eq 'src-tauri' \
                  || printf '%s' "$session_cwd" | grep -Eq '/src-tauri(/|$)'; }; then
          note_rule app_launch "$original_segment"
        fi
        ;;
      apt|apt-get|dpkg)
        printf '%s' "$arguments" | grep -Eiq '[[:space:]](install|remove|purge|-i|-r|-P)([[:space:]]|$)' \
          && printf '%s' "$arguments" | grep -Eq '[Tt]atolab' && note_rule app_launch "$original_segment"
        ;;
      brew)
        printf '%s' "$arguments" | grep -Eq '^[[:space:]]+(install|uninstall|reinstall|upgrade|remove|rm)([[:space:]]|$)' \
          && printf '%s' "$arguments" | grep -Eq '([[:space:]]|/)tatolab([[:space:]]|$)' && note_rule brew_cask "$original_segment"
        ;;
      defaults)
        printf '%s' "$arguments" | grep -Eq '^[[:space:]]+(write|delete|rename|import)[[:space:]]+com\.tatolab' \
          && note_rule machine_paths "$original_segment"
        ;;
      tccutil|sfltool)
        note_rule machine_paths "$original_segment"
        ;;
      osascript)
        printf '%s' "$arguments" | grep -Eiq 'administrator privileges' && note_rule administrator_prompt "$original_segment"
        ;;
      xcrun)
        printf '%s' "$arguments" | grep -Eq '^[[:space:]]+(notarytool[[:space:]]+(submit|store-credentials)|stapler[[:space:]]+staple)([[:space:]]|$)' \
          && note_rule publish "$original_segment"
        ;;
      notarize-and-staple.sh|bump-homebrew-cask.sh)
        note_rule publish "$original_segment"
        ;;
      build-tatolab-app.sh)
        printf '%s' "$arguments" | grep -Eq '[[:space:]]--notarize([[:space:]]|$)' && note_rule publish "$original_segment"
        ;;
    esac
  done < <(printf '%s\n' "$command_line" | awk "$SPLIT_OUTSIDE_QUOTES")
}

classify_command_line "$(printf '%s\n' "$cmd" | awk "$STRIP_HEREDOC_BODIES" | awk "$JOIN_CONTINUATIONS")" 0

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
    machine_runtime) printf "driving the machine's runtime (tatolab run/stop/rm/expose, or a second tatolabd) instead of the test-root unit's CLI" ;;
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
context="machine-brake note, advisory only, nothing was blocked: this command matched ${rules_text}. It acts on the owner's real machine or sends something outside the repository. That is fine when the owner asked for it. Otherwise prefer the hermetic path — tests with the fake local API server, the mock window (npm run dev), or a local-proof build under TATOLAB_TEST_MACHINE_ROOT — and say what you ran. Read-only verbs (launchctl print, systemctl --user status, tatolab streams/graph/logs/tap/exchange) and the test-root unit's own CLI (target/tatolab-runtime/bin/tatolab) never trigger this note. Owner preferences: ${preferences:-none recorded}. The owner can silence this with \`${HELPER} rule ${first_rule} off\` or \`${HELPER} allow '${suggested_glob}'\`; offer that if they say the command is fine, and never add an exception yourself."
jq -n --arg message "$system_message" --arg context "$context" \
  '{systemMessage: $message, hookSpecificOutput: {hookEventName: "PreToolUse", additionalContext: $context}}'
exit 0
