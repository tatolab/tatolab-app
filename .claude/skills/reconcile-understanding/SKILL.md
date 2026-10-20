---
name: reconcile-understanding
description: The correction loop — the owner fixes something Claude got wrong about the app, and the wrong belief is hunted down in every place it lives (memories, README, proof captions, rules, skills, issues). Use when the owner says "that's wrong", "you misunderstood", "let me correct you", or steers Claude's model of the app.
---

# Reconcile understanding

A correction that only fixes the conversation evaporates at session end. This skill makes it stick.

1. **Say-back gate.** Restate the correction in your own words — not the owner's — until they
   confirm it matches their intent. Do not proceed past this step without the yes.
2. **Hunt the belief's homes.** Search everywhere the wrong version may live: this project's memory
   directory, `CLAUDE.md`, `.claude/` rules, agents and skills, `README.md`, `proof/` captions and
   `FINAL-SPEC.md`, code comments, and open issues. When the belief is about the runtime or the
   plan, it may live in streamlib too — name those places and leave their fix to a streamlib
   session. List every occurrence found.
3. **Propose the fix batch**: place / current wrong text / corrected text, one table. The owner
   approves as a list and may strike lines.
4. **Apply the approved batch**: memories directly; docs and code comments through the normal PR
   path; rule, agent and skill text in a dedicated operating-model PR (`flow.md`).
5. **Write the correction as a memory** (type: feedback — the fact, why the old belief was wrong,
   how to apply the right one).
