---
paths:
  - "**/*.md"
---

# Docs

- **The code is the source of truth.** Never create a doc of what the code already shows — not a
  summary, a memo or a design spec. If it's derivable from the tree, read the tree; a finding lands
  in code or in an issue.
- **Docs say what holds now; retired text is deleted, never struck.** When a change retires a
  claim, delete it and repair the sentence around it so it reads as if written that way — no
  `~~strikethrough~~`, no "Superseded …" note, no "(amended …)" narration.
- **Evidence lives in the pull request, never on `main`.** `/verify-app` screenshots are committed
  under `.pr-evidence/` on the PR branch so the PR body can link them, and a final commit deletes
  them before merge. Every image says whether it is Live, Live (local proof), Linux, or Mock, and a
  runtime stand-in is named a stand-in.
