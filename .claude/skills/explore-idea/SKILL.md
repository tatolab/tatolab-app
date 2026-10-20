---
name: explore-idea
description: Free-form what-if exploration of an app direction before it becomes work — a sandbox with zero commitments that ends with a concrete recommended starting shape (spike / prototype / MVP slice). Use when an idea is fuzzy, when unknowns are too many for an issue, when a set of issues has no clear shape behind it, or when the owner says "what if", "explore", or "I want to think through".
disable-model-invocation: true
---

# Explore idea

The pressure-release valve before work: ideas too fuzzy or too broad for an issue get explored
here first. Nothing in this skill commits anything: **no issues, no plan edits, no code.**

This skill is proactive, not just inquisitive — the owner brings a fuzzy want; Claude's job is to
give it a shape they can react to. Digging and questioning are means; the deliverable is a formed
picture plus the smallest sensible way to start.

1. **Situate.** Read the local API it would read (streamlib's plan, §Control plane &
   observability), the calm-native spec, the relevant code, and the open issues circling the idea. When the input is a
   messy set of issues, reverse-engineer what they collectively want and present that back first.
2. **Sharpen the fuzz with `grilling`.** One question at a time, each with a recommended answer.
   Facts get looked up, never asked.
3. **Sketch 2–3 genuinely different shapes** (a mock screenshot from the browser mock, or a
   Mermaid sketch of the flow, welcome). For each: the unknowns it carries, what the runtime must
   give it that it does not today (each one is streamlib work the app waits on), its cost class
   (one issue / a few / a milestone), and what existing screens or code it would displace.
4. **Shape the smallest start** on the build ladder, and recommend the lowest rung that teaches
   something real:
   - **Spike** — hours, throwaway, answers exactly ONE named question (can WebKitGTK render X? does
     `SMAppService` report Y after Z?).
   - **Prototype** — a mock-backend screen in the browser; ugly, no tests, clearly throwaway.
     Exists to be reacted to.
   - **MVP slice** — the smallest *showable* version in the real app over the real local API.
   - **Full change** — only when the idea is already well-understood and small.

   State the smallest version worth building, the explicit **deferred list**, and the iteration
   path. When the idea is iterable, bias one rung smaller than feels natural — iteration is cheap,
   unbuilding is not.
5. **Drive to identical understanding.** Say the idea AND the recommended start back in your own
   words until the owner confirms it matches what is in their head. Unconfirmed = unexplored.
6. **Exit explicitly**, one of three ways:
   - **Graduate** → `/file-issue`; a calm-native spec change → a stated question to the owner,
     then `/file-issue`; a runtime contract the app needs → a streamlib issue the app issue waits
     on.
   - **Park** → memo at `docs/research/explorations/<slug>.md`: the idea, the shapes considered,
     the recommended start, and what unknown must resolve before it revives.
   - **Kill** → same memo, with the reason — so the idea is not innocently re-explored in three
     months.

If exploration reveals the idea is really N ideas, or more than one set of issues' worth of work,
say so and split before graduating.
