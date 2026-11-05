---
name: verify-app
description: Prove a change to Tatolab.app works the way a person meets it — the window, the tray, first-launch setup, the Run Tatolab switch, uninstall — with labelled screenshots (Live, Linux, Mock) and a written description of each. Use before claiming any visible or machine-facing change done, when the owner asks to see the app, or to audit a PR's claimed evidence.
---

# verify-app — done means seen

Tests catch logic; they cannot show that the window says the right thing, that the tray follows,
or that launchd and systemd do what the platform layer assumes. This skill produces the evidence
`review-pr` requires for any visible or machine-facing change. The evidence lives in the pull
request and never reaches `main`.

## Always the latest: the branch's head and streamlib's `main`

Evidence counts only when it was shot on what would ship now:

- **The app** is built from the PR branch's head commit. A commit that changes anything the build
  takes in after you shot means you rebuild and shoot again.
- **The runtime** is streamlib's `main` at its current head, fetched and built by this repository's
  own scripts. `infisical run -- scripts/build-tatolab-app.sh` does that by default: it resolves `main` on GitHub,
  fetches exactly that commit into `build/streamlib` and builds the unit there. Never build in, read,
  or pass a unit from the owner's `../streamlib` or any other checkout or `/tmp` directory. A unit
  from `build/streamlib/target/tatolab-runtime` may be passed with `--runtime-unit` only when it was
  built at `main`'s current head; the build refuses it otherwise. `--streamlib-ref` is for a release
  tag, or for unreleased streamlib work the owner names, never to avoid a rebuild.
- **Check it before you shoot, and put it in the evidence.** These must name one commit:
  - `git ls-remote https://github.com/tatolab/streamlib.git refs/heads/main`;
  - the bundle's `Contents/Resources/streamlib-commit` (unpackaged: the unit's `streamlib-commit`);
  - the build id that the bundled `tatolab-cli -V` reports from the running runtime.

  The build itself checks `main` again when it finishes. A build of `main` that ends without
  `streamlib main is still <commit>` failed because `main` moved, so build again. If `main` moves
  after that, while you are shooting, rebuild. Evidence from any other commit is not evidence.
- Building streamlib needs the `bun` its preview page pins. Fetch that version into a scratch
  directory and put it first on `PATH`, never over the owner's.

## Pick the lowest rung that proves the claim

1. **Mock (browser).** Pure window changes — layout, copy, a new state's presentation.
   Start `node scripts/serve_the_mock_window_in_a_browser.mjs` in the background (stop it at the
   end), then drive the page with Playwright at the URL it prints with the presets
   `src/renderer/backend/mock_tatolab_backend.ts` and `src/renderer/mock_window_preset.ts` read:
   `?platform=linux`, `?runtime_install=installing|failed`, `?state=` (running, empty, loading, node-error,
   not-listed, starting, stopped, unreachable, setup; macOS-only approval, missing,
   not-registered), `?project=none|unreadable`, `?uninstall=cancel`, and the screen keys
   `?layout=build|compose|spatial|code|perform`, `?outliner=open`, `?select=<row id>`,
   `?open_stream=<stream id>`, `?menu=<menu>` with `?submenu=<entry>`, `?area_menu=<area id>`,
   `?page=preferences` with `?section=`, `?restart=`, `?link=pressed`,
   `?sheet=uninstall|uninstalling|uninstalled`, `?setup=` and `?setup_step_action=`; the
   doc comment of `driveMockWindowToPreset` is the full list. A key it does not name is
   ignored without a word, so check each frame shows the state its URL asks for. The window is dark-only. Label every image **Mock**. A screen the
   presets cannot reach gets a preset in the same change.
2. **Local-proof live (macOS).** Anything that talks to a runtime — streams appearing and going,
   graph, logs, the switch, setup. `infisical run -- scripts/build-tatolab-app.sh --local-proof-test-root`
   builds a runtime unit and an app signed with the Developer ID from Infisical — the identity and
   team the installed release carries — whose machine lock, state and socket live under
   `TATOLAB_TEST_MACHINE_ROOT=/tmp/tatolab-proof`: no administrator prompt, nothing written to
   `/Library` or `/usr/local/bin`. Without the Developer ID the build stops and names what is
   missing; there is no other way to build one, so a proof never runs on a bundle signed
   differently from what ships. Drive streams with that unit's own CLI
   (`build/streamlib/target/tatolab-runtime/bin/tatolab`, with `TATOLAB_TEST_MACHINE_ROOT` set) —
   test-pattern streams only. `build/streamlib` keeps cargo's cache between builds, so building
   again at an unchanged commit is quick. **The proof build shares the installed app's bundle id**, so
   quit the installed Tatolab first. It drives only the launch agent
   `com.tatolab.tatolabd.local-proof` under the test root, and installs no runtime: streamlib's
   `install.sh` takes no test root yet, so run the unit's `tatolabd` by hand as below. Before: record
   `launchctl print gui/$(id -u)/com.tatolab.tatolabd | head -5`. After: quit the proof build.
   Never use its "Uninstall Tatolab…" unless uninstall is what you are proving — it also deletes
   `~/Library/Application Support/com.tatolab.tatolab`, the installed app's own settings. Then
   `rm -rf /tmp/tatolab-proof`, reopen `/Applications/Tatolab.app`, and show `launchctl print`
   matches the record. Label **Live (local proof)**.

   Without the packaged build — the unpackaged app over a runtime run by hand, as #37 and #38
   did:
   - Fetch streamlib `main` and build its test-root unit with
     `scripts/fetch-streamlib-for-the-app-build.sh build/streamlib`, then
     `scripts/build-tatolab-runtime-unit.sh build/streamlib --local-proof-test-root`. The unit's
     `streamlib-commit` must name `main`'s current head.
   - Create the lock `tatolabd` asks for (its refusal gives the commands), then run the unit's
     `tatolabd` with `TATOLAB_TEST_MACHINE_ROOT=/tmp/tatolab-proof`,
     `TATOLAB_TEST_LOOPBACK_HTTP_PORT=14446` and the two `TATOLAB_TEST_LOCAL_RELAY_*_PORT`s. The
     preview page reads the relay only at 4443, so a preview plays only when the test relay takes
     4443 and 4445; check they are free first.
   - `npm run build -- --local-proof-test-root` (it writes
     `machineDirectoriesUnderATestRoot: true` into `out/main/tatolab_app_build_features.json`;
     never edit the built `.js`), and run `npx electron . --remote-debugging-port=<port>` with `TATOLAB_TEST_MACHINE_ROOT` and `CFFIXED_USER_HOME` (a
     scratch home) set. Drive it with Playwright over the DevTools protocol; Electron answers no
     window-bounds command there, so a larger page is an emulated viewport, said in the caption.
   - **The local-proof app drives launchd at launch**: it asks only about
     `com.tatolab.tatolabd.local-proof`, whose plist would sit under the test root, never the
     owner's `com.tatolab.tatolabd`, and a local-proof build installs no runtime. Record
     `launchctl print gui/$(id -u)/com.tatolab.tatolabd` and the owner's runtime pid before, and
     show both unchanged after.
   - After: quit the app, stop the unit's `tatolabd`, `rm -rf /tmp/tatolab-proof`, and run
     `npm run build` again so `out/` holds the shipping features.

   A change to what the app reads from the local API also runs the live contract test against
   that runtime: `TATOLAB_APP_LIVE_LOCAL_API_SOCKET=/tmp/tatolab-proof/run/local-api.sock npx vitest
   run src/main/local_api_client.test.ts`.
3. **Live on the machine.** Only for what the test root cannot reach: the real administrator
   prompt, the carried runtime installing over the owner's after a `brew` reinstall, Gatekeeper, TCC prompts. This
   acts on the owner's real runtime — the `machine-brake` hook notes it — so say what you will
   run, run it only when the owner asked for this proof, and restore what you changed. Label
   **Live**.
4. **Linux.** On x86_64 Linux: `scripts/build-tatolab-linux-app.sh [--local-proof-test-root]`,
   then run the AppImage or `.deb`. On the Mac (arm64, which that script refuses): in an
   `ubuntu:22.04` container, build and run the unpackaged app (`npm ci && npm run build`,
   then `npx electron .`) with a container volume over `node_modules/`, so Linux's Electron never
   lands in the host's; run it under Xvfb with a StatusNotifier host and capture with
   `import -window root`. Packaging itself (`.deb` Depends, desktop entry, AppImage) is proven only
   by `scripts/build-tatolab-linux-app.sh` on x86_64 Linux. A runtime stand-in (a fake local API
   answering on the socket) is allowed and **named as a stand-in**. Label **Linux** or **Linux (container, unbundled)**.
   On a Mac, `scripts/verify/run-the-window-in-an-ubuntu-container.sh <folder>` does this with the
   stand-ins in `scripts/verify/linux-stand-ins/`.
   The carried runtime's install is proven only by a packaged `.deb` or AppImage of a real build,
   opened where a systemd user manager runs and the installed build differs or is none: the
   overlay shows the installer's lines, then the streams. A `--local-proof-test-root` package
   installs nothing, since `install.sh` writes only into the real home folder.

## Capture

- Shoot into the session's scratch folder with descriptive names (`03-four-streams-running.png`),
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
Built from <branch head sha>; the runtime is streamlib `main` <commit>, matching `git ls-remote`
and the running runtime's build id (or "no runtime: Mock / Linux stand-in only").

| what | label | image | shows |
|---|---|---|---|
| <the claim> | Mock / Live (local proof) / Live / Linux | [<file>](<blob link>) | <the description> |

Found and fixed while shooting: <anything the run surfaced, with the proof of the fix> (or "nothing").
Not covered: <what this evidence does not prove, and why> (or "nothing").
```

Clean up: stop the dev server and any local-proof runtime you started, remove
`/tmp/tatolab-proof` when you created it, and say what you removed.
