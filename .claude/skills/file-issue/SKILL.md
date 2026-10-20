---
name: file-issue
description: File a well-shaped tatolab-app issue from a short intent — pick the right form (feature / bug / research), fill its sections, link the streamlib plan entry and the runtime work it waits on, and set native dependency edges. Use when the owner says "file this", "open an issue for X", "log that bug", or when discussion surfaces a trackable task. Never files an umbrella issue — decomposes into self-contained issues with real blocked-by edges.
---

# file-issue

Turn an intent into an issue a future session can pick up cold. The issue is the goal, not a spec
— carry the design content but keep implementation mechanics out (they rot; the picker
re-derives them).

## 1. Pick the form and the repository
Match the intent to one of `.github/ISSUE_TEMPLATE/` and fill **its** sections — don't invent a
structure:
- **feature** — a change to the window, the tray, setup, uninstall, the platform layer or
  packaging: What & why · Design (what it reads from the local API, what it shows, on which
  platform; link the streamlib plan entry, never restate or extend it) · Done means (2–4 outcomes a
  person could check in the running app) · Validation shape (hermetic tests + the `/verify-app`
  rung) · Platforms · Waits on · Non-derivable notes (default "None").
- **bug** — Symptom · Where it bit (platform, install kind, versions) · Expected · Repro ·
  Platforms.
- **research** — Question · Why now · Deliverable shape.

**Runtime work is filed in `tatolab/streamlib`, not here.** When the intent needs the runtime to
serve something it does not today, the runtime half is a streamlib issue (filed from a streamlib
session, or with `gh issue create -R tatolab/streamlib` on its forms) and the app issue names it
under **Waits on**.

## 2. Labels and milestone
Labels are display output only. Assign a milestone only when this repository has one that names
the capability; when none fits, say so rather than inventing one — milestone scoping is the
owner's call.

## 3. Never file an umbrella issue
An issue that says "do all of X" and lists sub-tasks is the failure mode. Decompose into
**self-contained issues**, each with its own Done means and validation shape, connected by
**native GitHub dependency edges** — not text like "depends on #N." Set the edges through whichever
`gh` surface the repository actually exposes — **verify which exists before using it** (the
issue-relationship API or sub-issues) with a probe, and use the one that works. When a streamlib
issue is the blocker and no cross-repository edge is accepted, the "Waits on" line is the record.

## 4. Phrase claims honestly
Any specific claim about code or behaviour in the body is phrased "to the best of our current
knowledge" so the picker verifies it. Keep file paths, exact test names and step-by-step ordering
out of the body.

## 5. Confirm and report
Show the drafted issue(s) and the edges before filing when the decomposition is non-trivial; file,
then report the issue number(s) and the dependency graph you set.
