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
   `npm run dev`, then drive the page with Playwright at `http://localhost:1420/` with the presets
   `src/backend/mock_tatolab_backend.ts` and `src/mock_window_preset.ts` read:
   `?state=` (running, empty, loading, node-error, not-listed, starting, stopped, unreachable,
   setup; macOS-only approval, missing, not-registered), `?platform=linux`, and the screen keys
   `?stream=`, `?tab=`, `?page=settings`, `?sheet=uninstall|uninstalling|uninstalled`,
   `?setup=waiting`, `?watch=<node>.<port>`, `?levels=errors`, `?search=<query>`. Emulate both
   colour schemes. Label every image **Mock**. A screen the presets cannot reach gets a preset in
   the same change.
2. **Local-proof live (macOS).** Anything that talks to a runtime — streams appearing and going,
   graph, logs, the switch, setup. `scripts/build-tatolab-app.sh --local-proof-test-root` builds a
   runtime unit and an app whose machine lock, state and socket live under
   `TATOLAB_TEST_MACHINE_ROOT=/tmp/tatolab-proof`: no administrator prompt, nothing written to
   `/Library` or `/usr/local/bin`. Drive streams with that unit's own CLI
   (`<streamlib>/target/tatolab-runtime/bin/tatolab`, with `TATOLAB_TEST_MACHINE_ROOT` set) —
   test-pattern streams only. Opening the proof build still registers its login item with
   Service Management, as the installed app would — note what was registered before, and when
   done turn "Run Tatolab" off or use the proof build's "Uninstall Tatolab…" (it removes
   `/tmp/tatolab-proof` instead of prompting), then put the owner's own setup back. Label
   **Live (local proof)**.
3. **Live on the machine.** Only for what the test root cannot reach: the real administrator
   prompt, `SMAppService` registration after a `brew` reinstall, Gatekeeper, TCC prompts. This
   acts on the owner's real runtime — the `machine-brake` hook notes it — so say what you will
   run, run it only when the owner asked for this proof, and restore what you changed. Label
   **Live**.
4. **Linux.** Build with `scripts/build-tatolab-linux-app.sh` (add `--local-proof-test-root` to
   read a test-root runtime) and run the AppImage or `.deb` on Linux or in an Ubuntu container with
   a systemd user session. A runtime stand-in (a fake local API answering on the socket) is
   allowed and **named as a stand-in** in the caption. Label **Linux**.

## Capture

- Screenshots go under `proof/<topic>/` with descriptive names (`03-four-streams-attached.png`),
  both themes for a visual change, and the window at its real size — not cropped to the change.
- The window inside Tauri cannot be driven by Playwright; capture it with the platform's screenshot
  tool (`screencapture -l <window id>` / `-R` on macOS, `gnome-screenshot -w` or `import` on
  Linux).
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
