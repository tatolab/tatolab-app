---
name: hygiene
description: Sniff out everything in the app repo that runs counter to the operating model — README claims false against the tree, proof captions describing a window that changed, references to deleted files or retired features, dead rule globs, issues pointing at closed streamlib work. Detects and reports only; it never fixes anything.
disable-model-invocation: false
---

# Hygiene

The project's smell test. Report only — no edits from this skill, ever. Staleness detection is
automatable; staleness repair is a decision, and decisions route to the skill that owns them.

Sweep these surfaces:

1. **README and entry-doc rot.** Claims in `README.md` that are false against the tree: a path that does not exist, a script option a script no longer takes, a CI behaviour the
   workflows no longer have, a platform statement the platform modules contradict.
2. **Runtime-contract drift.** Anything here that contradicts the local API contract in
   streamlib's plan (read from streamlib's `main`) — and any app behaviour that needs a runtime
   contract the plan does not state.
3. **Proof drift.** `proof/` captions and `docs/design` describing a window, a state or a flow the
   code no longer has; screenshots of retired features presented as current.
4. **References to deleted machinery.** Mentions of removed features (the retired output-port tap and frame
   exchange), deleted files, or dead vocabulary in code comments, rules, skills, agents, hooks, the
   issue forms and the workflows.
5. **Operating-model bloat.** A `CLAUDE.md` line, skill or agent text that restates what the code,
   a gate or the config already shows (propose its deletion via `/propose-rule`).
6. **Tracker misalignment.** Open issues whose "Waits on" streamlib work has shipped (ready to
   build) or been retired (needs a rewrite).

Output: ONE table — surface / finding / evidence (`file:line` or quote) / who owns the fix (a
docs PR, `/reconcile-understanding`, `/propose-rule`, `/file-issue`, or a streamlib session).
Order by thrash risk: things an agent might read and obey rank above cosmetic rot.

Run it before a design session, after a big change ships, or whenever something feels off.
