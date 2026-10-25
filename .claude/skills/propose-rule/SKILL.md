---
name: propose-rule
description: The only path by which a rule in CLAUDE.md is added, changed, or deleted. CLAUDE.md holds only what the code can't show; deleting a line is always welcome.
disable-model-invocation: false
---

# Propose rule

Rules are invariants born from evidence — never from one annoyance.

1. **Evidence in**: the recurring review finding, the repeated owner correction, or the shipped
   defect. Link at least two occurrences, or one shipped incident.
2. **Overlap check**: does an existing rule, a streamlib rule this repo already mirrors, or an
   existing gate already cover it? Prefer extending. When the operation is mechanical, a gate (a
   `scripts/check-*.sh` source gate, a hook, a CI step) beats prose — propose the gate, its
   planted-violation test, AND the deletion of the prose it replaces.
3. **Draft**: the rule text (invariant style, one concern, positive phrasing), where it lives
   (`CLAUDE.md`, and only when the code, a gate or the config can't carry it — anything an agent
   can read from the tree is never written down), and the incident it would have
   prevented.
4. **The owner approves the draft in their own words.** Hard stop.
5. Land it in a **dedicated operating-model PR**, never mixed into feature work.
   A session never lands a rule it is itself subject to mid-task.
