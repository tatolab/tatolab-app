---
name: research
description: Answer a question from primary sources, in chat. Use when a decision needs facts the repo cannot provide — Service Management / launchd / systemd behaviour, Electron and Chromium quirks, electron-updater and Squirrel.Mac, code signing and notarization rules, packaging formats. Writes no file; its findings land in code or issues.
---

# Research

1. Spawn a background agent against **primary sources** — Apple's developer documentation and
   `man` pages, freedesktop/systemd docs, Electron's docs and source, electron-updater's source, the spec —
   never a secondary write-up of them. Follow every claim back to the source that owns it. A claim
   about this machine's behaviour is settled by running the read-only query (`launchctl print`,
   `systemctl --user show`, `codesign -dv`, `spctl -a`), not by reading.
2. Report the answer in chat: the findings, the evidence with URLs, and what remains unknown. No
   file is written — the code is the source of truth, so findings land in code or in issues.
3. Findings the owner acts on go into code inside `/implement`, or, when tangential, into an issue.
   One about what the app needs from the runtime goes to streamlib as an issue; a decision goes to
   the owner as a stated question.
