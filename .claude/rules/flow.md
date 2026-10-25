---
paths:
  - ".claude/**"
  - ".github/**"
  - "CLAUDE.md"
---

# Flow (operating model)

- **Operating-model changes are their own PR, with rationale.** Anything under `.claude/` (rules,
  agents, skills, hooks, settings), `CLAUDE.md`, or the issue forms changes in a dedicated PR that
  explains why — never mixed into feature work. A session never edits the agents, rules, or
  skills it is itself using.
- **Path guards ask; they never deny.** `permissions.deny` and a hook's `"deny"` decision are both
  banned — use `ask` and let the owner resolve it at the prompt. A hard wall outlives its reason
  and teaches the session to route around it.
- **Guard only what a wrong edit makes expensive to undo** — here: the licence files, and what code
  signing and notarization read (the entitlements, `Info.plist`, the launch agent plist). Never
  guard prose. Judgement the session must exercise belongs in `CLAUDE.md`, not an `ask` entry.
- **Adding an `ask` entry or a hook branch needs the same justification as an agent.** State what
  a wrong edit or command costs, why an always-on rule can't carry it, and what the session should
  do when it fires.
- **A new agent definition PR must state three things:** the non-derivable knowledge the agent
  captures, why the existing agents don't already cover it, and its model tier.
- **Model tiers:** implementation and reasoning agents run `opus`; mechanical / prescribed-steps
  agents run `sonnet`; nothing pins `fable`.
- Labels are display output only — nothing reads a label as control flow. Every work item is
  classified fresh from its content and from current code, never from its labels.
- PR titles are conventional-commit typed (`type(scope): summary`, scopes as the history uses them:
  `app`, `window`, `logs`, `platform`, `packaging`, …). Run
  `printf '%s' "<title>" | npx commitlint` before opening the PR.
