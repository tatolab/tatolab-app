---
name: propose-rule
description: The only path by which a rule under .claude/rules/ or a rule in CLAUDE.md is added, changed, or deleted.
disable-model-invocation: false
---

# Propose rule

Rules are invariants born from evidence — never from one annoyance.

1. **Evidence in**: the recurring review finding, the repeated owner correction, or the shipped
   defect. Link at least two occurrences, or one shipped incident.
2. **Overlap check**: does an existing rule, a streamlib rule this repo already mirrors, or an
   existing gate already cover it? Prefer extending. When the operation is mechanical, a gate (a
   rule in `eslint.config.js` or `stylelint.config.js`, a hook, a CI step) beats prose — propose the gate, its
   planted-violation test, AND the deletion of the prose it replaces.
3. **Draft**: the rule text (invariant style, one concern, positive phrasing), where it lives
   (`CLAUDE.md` when it governs a decision the session makes before it opens a file;
   `.claude/rules/<file>.md` with a `paths:` scope otherwise), and the incident it would have
   prevented.
4. **The owner approves the draft in their own words.** Hard stop.
5. Land it in a **dedicated operating-model PR** (per `flow.md` — never mixed into feature work).
   A session never lands a rule it is itself subject to mid-task.
