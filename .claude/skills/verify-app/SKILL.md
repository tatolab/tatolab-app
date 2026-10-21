---
name: verify-app
description: Prove a change to Tatolab.app works the way a person meets it — the window, the tray, first-launch setup, the Run Tatolab switch, uninstall — with labelled screenshots (Live, Linux, Mock) and a written description of each. Use before claiming any visible or machine-facing change done, when the owner asks to see the app, or to audit a PR's claimed evidence.
---

# verify-app — done means seen

Tests catch logic; they cannot show that the window says the right thing, that the tray follows,
or that launchd and systemd do what the platform layer assumes. This skill produces the evidence
`review-pr` requires for any visible or machine-facing change, in the shape `proof/README.md`
already uses.

## Pick the lowest rung that proves the claim

1. **Mock (browser).** Pure window changes — layout, copy, a new state's presentation, light/dark.
   Start `npm run dev` in the background (stop it at the end), then drive the page with Playwright
   at `http://localhost:1420/` with the presets `index.html`, `src/feature_flags.ts`,
   `src/backend/mock_tatolab_backend.ts` and `src/mock_window_preset.ts` read:
   `?theme=light|dark`, `?platform=linux`, `?state=` (running, empty, loading, node-error,
   not-listed, starting, stopped, unreachable, setup; macOS-only approval, missing,
   not-registered), `?uninstall=cancel`, and the screen keys `?stream=`, `?tab=`,
   `?page=settings`, `?sheet=uninstall|uninstalling|uninstalled`, `?setup=waiting`,
   `?levels=errors`, `?search=<query>`, and `?watch=<node>.<port>` (only with
   `?feature=watch-exposed-output`). Shoot both themes. Label every image **Mock**. A screen the
   presets cannot reach gets a preset in the same change.
2. **Local-proof live (macOS).** Anything that talks to a runtime — streams appearing and going,
   graph, logs, the switch, setup. `scripts/build-tatolab-app.sh --local-proof-test-root` builds a
   runtime unit and an app whose machine lock, state and socket live under
   `TATOLAB_TEST_MACHINE_ROOT=/tmp/tatolab-proof`: no administrator prompt, nothing written to
   `/Library` or `/usr/local/bin`. Drive streams with that unit's own CLI
   (`<streamlib>/target/tatolab-runtime/bin/tatolab`, with `TATOLAB_TEST_MACHINE_ROOT` set) —
   test-pattern streams only. Reuse an already-built unit with `--runtime-unit` rather than
   rebuilding streamlib. **The proof build shares the installed app's bundle id and agent label,
   so while it runs it replaces the owner's runtime.** Before: record
   `launchctl print gui/$(id -u)/com.tatolab.tatolabd | head -5` and quit the installed Tatolab.
   After: turn "Run Tatolab" off in the proof build and quit it. Never use its "Uninstall
   Tatolab…" unless uninstall is what you are proving — it also deletes
   `~/Library/Application Support/com.tatolab.tatolab`, the installed app's own settings. Then
   `rm -rf /tmp/tatolab-proof`, reopen `/Applications/Tatolab.app` so it registers its own agent,
   and show `launchctl print` matches the record. Label **Live (local proof)**.

   A change to what the app reads from the local API also runs the live contract test against
   that runtime: `TATOLAB_APP_LIVE_LOCAL_API_SOCKET=/tmp/tatolab-proof/run/local-api.sock npx vitest
   run src-electron/src/local_api_client.test.ts`.
3. **Live on the machine.** Only for what the test root cannot reach: the real administrator
   prompt, `SMAppService` registration after a `brew` reinstall, Gatekeeper, TCC prompts. This
   acts on the owner's real runtime — the `machine-brake` hook notes it — so say what you will
   run, run it only when the owner asked for this proof, and restore what you changed. Label
   **Live**.
4. **Linux.** On x86_64 Linux: `scripts/build-tatolab-linux-app.sh [--local-proof-test-root]`,
   then run the AppImage or `.deb`. On the Mac (arm64, which that script refuses): in an
   `ubuntu:22.04` container, build and run the unpackaged app (`npm ci && npm run build && npm run build:electron`,
   then `npx electron .`) with a container volume over `node_modules/`, so Linux's Electron never
   lands in the host's; run it under Xvfb with a StatusNotifier host and capture with
   `import -window root`. Packaging itself (`.deb` Depends, desktop entry, AppImage) is proven only
   by an x86_64 build (CI). A runtime stand-in (a fake local API answering on the socket) is
   allowed and **named as a stand-in**. Label **Linux** or **Linux (container, unbundled)**.
   Commit the container recipe the first time you use one.

## Capture

- Screenshots go under `proof/<topic>/` with descriptive names (`03-four-streams-attached.png`),
  both themes for a visual change, and the window at its real size — not cropped to the change.
- The packaged window cannot be driven by Playwright (its fuses turn off the inspector); capture it
  with the platform's screenshot tool — on macOS `screencapture -l <CGWindowID>` (find the id with
  `osascript -e 'tell application "System Events" to id of first window of process "Tatolab"'`
  or a small `CGWindowListCopyWindowInfo` script; the terminal needs Screen Recording), on Linux
  `gnome-screenshot -w` or `import`.
- In the PR body, images in this private repository render only as
  `https://github.com/tatolab/tatolab-app/blob/<sha>/proof/<path>?raw=true` links.
- Never capture a secret, a signing identity, a token, or a home-directory path that names a real
  person other than the owner.

## Audit every image

Read each image with the Read tool and **describe what it shows** — the stream names, the state
words, the selected row, the log lines, the theme. "Looks fine" is banned; a reviewer must be able
to tell from the description alone that you looked. An image that does not show the claimed state
is a failure, not evidence. Check AA contrast on any colour the change introduced.

## Report

Add a section to `proof/README.md` (newest first) when the evidence is worth keeping, and put the
evidence in the PR body:

```markdown
## Evidence
| what | label | image | shows |
|---|---|---|---|
| <the claim> | Mock / Live (local proof) / Live / Linux | proof/<topic>/<file>.png | <the description> |

Found and fixed while shooting: <anything the run surfaced, with the proof of the fix> (or "nothing").
Not covered: <what this evidence does not prove, and why> (or "nothing").
```

Clean up: stop the dev server and any local-proof runtime you started, remove
`/tmp/tatolab-proof` when you created it, and say what you removed.
