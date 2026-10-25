---
name: verify-app
description: Prove a change to Tatolab.app works the way a person meets it — the window, the tray, first-launch setup, the Run Tatolab switch, uninstall — with labelled screenshots (Live, Linux, Mock) and a written description of each. Use before claiming any visible or machine-facing change done, when the owner asks to see the app, or to audit a PR's claimed evidence.
---

# verify-app — done means seen

Tests catch logic; they cannot show that the window says the right thing, that the tray follows,
or that launchd and systemd do what the platform layer assumes. This skill produces the evidence
`review-pr` requires for any visible or machine-facing change. The evidence lives in the pull
request and never reaches `main`.

## Pick the lowest rung that proves the claim

1. **Mock (browser).** Pure window changes — layout, copy, a new state's presentation, light/dark.
   Start `npm run dev` in the background (stop it at the end), then drive the page with Playwright
   at `http://localhost:1420/` with the presets `index.html`, `src/renderer/feature_flags.ts`,
   `src/renderer/backend/mock_tatolab_backend.ts` and `src/renderer/mock_window_preset.ts` read:
   `?theme=light|dark`, `?platform=linux`, `?state=` (running, empty, loading, node-error,
   not-listed, starting, stopped, unreachable, setup; macOS-only approval, missing,
   not-registered), `?uninstall=cancel`, and the screen keys `?stream=`, `?tab=`,
   `?page=settings`, `?sheet=uninstall|uninstalling|uninstalled`, `?setup=waiting`,
   `?levels=errors`, `?search=<query>`, and on Graph `?step=<step>`, `?focus=<step>`,
   `?pin=<step>.<port>`, `?hover=<step>.<port>`, `?previews=off` and `?counters=off`; the
   doc comment of `driveMockWindowToPreset` is the full list. A key it does not name is
   ignored without a word, so check each frame shows the state its URL asks for. Shoot both themes. Label every image **Mock**. A screen the
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

   Without the packaged build — the unpackaged app over a runtime run by hand, as #37 and #38
   did:
   - Build streamlib `main`'s test-root unit in a scratch worktree with
     `scripts/build-tatolab-runtime-unit.sh <worktree> --local-proof-test-root`, so the owner's
     checkout keeps its own unit. The build pins the `bun` it makes the preview page with: fetch
     that version into a scratch directory and put it first on `PATH`, never over the owner's.
   - Create the lock `tatolabd` asks for (its refusal gives the commands), then run the unit's
     `tatolabd` with `TATOLAB_TEST_MACHINE_ROOT=/tmp/tatolab-proof`,
     `TATOLAB_TEST_LOOPBACK_HTTP_PORT=14446` and the two `TATOLAB_TEST_LOCAL_RELAY_*_PORT`s. The
     preview page reads the relay only at 4443, so a preview plays only when the test relay takes
     4443 and 4445; check they are free first.
   - `npm run build && npm run build:electron`, switch `machineDirectoriesUnderATestRoot` on in
     the built `tatolab_app_build_features.js` only, and run `npx electron .
     --remote-debugging-port=<port>` with `TATOLAB_TEST_MACHINE_ROOT` and `CFFIXED_USER_HOME` (a
     scratch home) set. Drive it with Playwright over the DevTools protocol; Electron answers no
     window-bounds command there, so a larger page is an emulated viewport, said in the caption.
   - **The unpackaged app still calls Service Management at launch**: it tries to register the
     runtime's agent and to restart the runtime under its own version, against the owner's real
     `com.tatolab.tatolabd`. In #38 both calls failed, but nothing stops them. Record
     `launchctl print gui/$(id -u)/com.tatolab.tatolabd` and the runtime's pid before, and show
     both unchanged after.
   - After: quit the app, stop the unit's `tatolabd`, `rm -rf /tmp/tatolab-proof`, remove the
     scratch worktree, and build again so the built copy is back to `false`.

   A change to what the app reads from the local API also runs the live contract test against
   that runtime: `TATOLAB_APP_LIVE_LOCAL_API_SOCKET=/tmp/tatolab-proof/run/local-api.sock npx vitest
   run src/main/local_api_client.test.ts`.
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
   On a Mac, `scripts/verify/run-the-window-in-an-ubuntu-container.sh <folder>` does this with the
   stand-ins in `scripts/verify/linux-stand-ins/`.

## Capture

- Shoot into the session's scratch folder with descriptive names (`03-four-streams-attached.png`),
  both themes for a visual change, and the window at its real size — not cropped to the change.
- The packaged window cannot be driven by Playwright (its fuses turn off the inspector); capture it
  with the platform's screenshot tool — on macOS `screencapture -l <CGWindowID>` (find the id with
  `osascript -e 'tell application "System Events" to id of first window of process "Tatolab"'`
  or a small `CGWindowListCopyWindowInfo` script; the terminal needs Screen Recording), on Linux
  `gnome-screenshot -w` or `import`.
- For the PR body, copy the images to `.pr-evidence/<issue>/` on the PR branch and commit them: in
  this private repository they render only as
  `https://github.com/tatolab/tatolab-app/blob/<sha>/.pr-evidence/<issue>/<file>?raw=true` links,
  which keep working from the PR after the files are gone. The PR's last commit before merge
  deletes `.pr-evidence/`.
- Never capture a secret, a signing identity, a token, or a home-directory path that names a real
  person other than the owner.

## Audit every image

Read each image with the Read tool and **describe what it shows** — the stream names, the state
words, the selected row, the log lines, the theme. "Looks fine" is banned; a reviewer must be able
to tell from the description alone that you looked. An image that does not show the claimed state
is a failure, not evidence. Check AA contrast on any colour the change introduced.

## Report

Put the evidence in the PR body:

```markdown
## Evidence
| what | label | image | shows |
|---|---|---|---|
| <the claim> | Mock / Live (local proof) / Live / Linux | [<file>](<blob link>) | <the description> |

Found and fixed while shooting: <anything the run surfaced, with the proof of the fix> (or "nothing").
Not covered: <what this evidence does not prove, and why> (or "nothing").
```

Clean up: stop the dev server and any local-proof runtime you started, remove
`/tmp/tatolab-proof` when you created it, and say what you removed.
