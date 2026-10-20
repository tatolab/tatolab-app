---
name: architecture-question
description: Ask how something in the app works and get Claude's current understanding back, with evidence, labeled by source. Use when the owner asks "how does X work", "why is Y shaped this way", "what happens when Z" — any question about the app's behaviour or structure rather than a request to change it.
---

# Architecture question

The deliverable is shared understanding, not just an answer. No edits from this skill.

1. **Verify before asserting.** Read the actual code paths before answering — both platform
   modules when the answer differs by platform, and the runtime side in streamlib (at `main`: `gh api repos/tatolab/streamlib/contents/<path>`) when the
   answer depends on what the local API does.
2. **Answer in labeled layers**:
   - **[CODE]** — what the tree does today, with `file:line`. Code is the authority on current
     behaviour.
   - **[PLAN]** — what streamlib's `docs/plan/` says is agreed for the app or the local API, or
     what the calm-native spec says about the window.
   - **[INFERRED]** — Claude's judgment or reconstruction, with stated confidence.
3. **Surface disagreements found on the way.** If the code contradicts the plan, the spec or the
   README, say so in the answer.
4. **Close the say-back loop.** End with one paragraph: "So my understanding is … — does that match
   yours?" A correction goes through `/reconcile-understanding`.
