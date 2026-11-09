---
name: diagnose
description: Feedback-loop-first debugging. Use when something in the app is broken, throwing, failing, flaky, or slow — before reading code to build a theory.
---

# Diagnose

Phases in order. The feedback loop is the skill; everything else is mechanical.

1. **Build a red-capable feedback loop first**: one command — already run at least once (paste the
   invocation and its output) — deterministic, fast, that shows the failure. Failing test (a
   vitest case in `apps/tato-app/src/main/` against the fake local API server or an injected platform seam; a vitest case
   against a presentation function or the mock backend) > script > throwaway harness > bisection.
   Catching yourself reading code to build a theory before this command exists is the exact failure
   this skill prevents: **no red-capable command, no phase 2.** Genuinely can't build one → stop and
   say what access or artifact you need (a log from the owner's machine, `launchctl print` output,
   `journalctl --user -u tatolabd` lines, a screenshot).
2. **Reproduce the reporter's failure mode** (wrong bug = wrong fix) — on the platform and install
   kind it bit (brew cask, `.dmg`, `.deb`, AppImage, local proof) — then minimize one element at a
   time until everything left is load-bearing.
3. **3–5 ranked falsifiable hypotheses before testing any** — single-hypothesis generation anchors
   on the first plausible idea. Show the list; proceed on your ranking if the owner is away. For
   app symptoms, separate the layers first: the runtime (does the local API answer — `tatolab
   streams`?), the service manager (what does launchd / systemd say?), the backend (what does the
   window's IPC command answer?), the window (what does presentation make of it?). A runtime defect is
   filed in streamlib, never patched around here.
   To read the app's own log (a Finder launch discards stderr): quit the app, then start the
   binary from a terminal — `TATOLAB_APP_LOG=debug /Applications/Tatolab.app/Contents/MacOS/Tatolab`, or
   `/usr/bin/Tatolab` / the AppImage on Linux. A direct start skips the single-instance check, so
   quit the running app first.
4. **Instrument** one variable at a time, each probe mapped to a prediction. Tag every debug line
   `[DEBUG-xxxx]` so cleanup is one grep.
5. **Regression test before the fix**, at a real seam. If no correct seam exists, that itself is a
   finding for the PR's Notes for owner — and the fix still lands with the best available test.
6. **Cleanup**: repro gone, every `[DEBUG-` gone, the confirmed hypothesis stated in the commit
   message.

The fix itself lands through `/implement` against a bug issue.
