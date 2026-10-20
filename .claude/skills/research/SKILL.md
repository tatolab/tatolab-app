---
name: research
description: Answer a question from primary sources and file a memo. Use when a decision needs facts the repo cannot provide — Service Management / launchd / systemd behaviour, Tauri, WKWebView or WebKitGTK quirks, code signing and notarization rules, packaging formats. Produces no issues and no code.
---

# Research

1. Spawn a background agent against **primary sources** — Apple's developer documentation and
   `man` pages, freedesktop/systemd docs, Tauri's docs and source, WebKit's source, the spec —
   never a secondary write-up of them. Follow every claim back to the source that owns it. A claim
   about this machine's behaviour is settled by running the read-only query (`launchctl print`,
   `systemctl --user show`, `codesign -dv`, `spctl -a`), not by reading.
2. The memo lands at `docs/research/<slug>.md` (create the directory with the first one): the date,
   the question, the answer, the evidence with URLs, and what remains unknown. A memo is dated
   evidence — never rewritten to match a later tree.
3. Report the answer's summary in chat.

This skill never files issues, never edits code. If the findings demand a decision, say so: one
about what the app needs from the runtime goes to streamlib as an issue; any other goes to the
owner as a stated question.
