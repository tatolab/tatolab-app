---
paths:
  - "**/*.md"
---

# Docs

- **The code is the source of truth.** Never create a doc of what the code already shows — not a
  summary, a memo or a design spec. If it's derivable from the tree, read the tree; a finding lands
  in code or in a Linear issue.
- **Docs say what holds now; retired text is deleted, never struck.** When a change retires a
  claim, delete it and repair the sentence around it so it reads as if written that way — no
  `~~strikethrough~~`, no "Superseded …" note, no "(amended …)" narration.
- **Evidence never enters a commit.** `/verify-app` screenshots are handed to the owner directly,
  attached in the conversation where the work is reported, and the PR body describes each in words;
  no image is committed to any branch, not even for a commit that deletes it later. Every image says whether it is Live, Live (local proof), Linux, or Mock, and a
  runtime stand-in is named a stand-in.
