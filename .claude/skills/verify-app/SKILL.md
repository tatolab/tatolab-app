---
name: verify-app
description: Prove a change to Tatolab.app works the way a person meets it — the window, the tray, the runtime the app runs as its child, the tatolab link — with labelled screenshots (Live, Linux, Mock) and a written description of each. Use before claiming any visible or machine-facing change done, when the owner asks to see the app, or to audit a PR's claimed evidence.
---

# verify-app — done means seen

Tests catch logic; they cannot show that the window says the right thing, that the tray follows,
or that the runtime the app starts comes up and stops with it. This skill produces the evidence
`review-pr` requires for any visible or machine-facing change. The evidence lives in the pull
request and never reaches `main`.

## Always the latest: the branch's head and streamlib's `main`

Evidence counts only when it was shot on what would ship now:

- **The app** is built from the PR branch's head commit. A commit that changes anything the build
  takes in after you shot means you rebuild and shoot again.
- **The runtime** is streamlib's `main` at its current head, fetched and built by this repository's
  own scripts. `infisical run -- apps/tato-app/scripts/build-tatolab-app.sh` does that by default: it resolves `main` on GitHub,
  fetches exactly that commit into `apps/tato-app/build/streamlib` and builds the unit there. Never build in, read,
  or pass a unit from the owner's `../streamlib` or any other checkout or `/tmp` directory. A unit
  from `apps/tato-app/build/streamlib/target/tatolab-runtime` may be passed with `--runtime-unit` only when it was
  built at `main`'s current head; the build refuses it otherwise. `--streamlib-ref` is for a release
  tag, or for unreleased streamlib work the owner names, never to avoid a rebuild.
- **Check it before you shoot, and put it in the evidence.** These must name one commit:
  - `git ls-remote https://github.com/tatolab/streamlib.git refs/heads/main`;
  - the bundle's `Contents/Resources/streamlib-commit` (unpackaged: the unit's `streamlib-commit`);
  - the build id that the bundled `tatolab-cli -V` reports from the running runtime.

  The build itself checks `main` again when it finishes. A build of `main` that ends without
  `streamlib main is still <commit>` failed because `main` moved, so build again. If `main` moves
  after that, while you are shooting, rebuild. Evidence from any other commit is not evidence.

## Pick the lowest rung that proves the claim

1. **Mock (browser).** Pure window changes — layout, copy, a new state's presentation.
   Start `node apps/tato-app/scripts/serve_the_mock_window_in_a_browser.mjs` in the background (stop it at the
   end), then drive the page with Playwright at the URL it prints with the presets
   `apps/tato-app/mock/mock_tatolab_backend.ts` and `apps/tato-app/mock/mock_window_preset.ts` read:
   `?platform=linux`, `?state=` (running, empty, loading, node-error, camera-access, dropping,
   not-listed, starting, not-running), `?project=none|unreadable`, `?cli_link=not_linked|taken`,
   `?restart=refused`, and the screen keys
   `?layout_shape=<shape>`, `?outliner=open`, `?select=<row id>`,
   `?open_stream=<stream id>`, `?menu=<menu>` with `?submenu=<entry>`, `?area_menu=<area id>`,
   `?page=settings` with `?section=`, `?restart=pressed`, `?link=pressed`,
   `?sheet=new_project` with `?new_project_name=<name>` and `?new_project=browse|create`; the
   doc comment of `driveMockWindowToPreset` is the full list. A key it does not name is
   ignored without a word, so check each frame shows the state its URL asks for. The window is dark-only. Label every image **Mock**. A screen the
   presets cannot reach gets a preset in the same change.
2. **Local-proof live (macOS).** Anything that talks to a runtime — streams appearing and going,
   graph, logs, the runtime starting and stopping with the app. `infisical run -- apps/tato-app/scripts/build-tatolab-app.sh --local-proof-test-root`
   builds a runtime unit and an app signed with the Developer ID from Infisical — the identity and
   team the installed release carries — whose machine lock, state and socket live under
   `TATOLAB_TEST_MACHINE_ROOT=/tmp/tatolab-proof`: no administrator prompt, nothing written to
   `/Library` or `/usr/local/bin`. Without the Developer ID the build stops and names what is
   missing; there is no other way to build one, so a proof never runs on a bundle signed
   differently from what ships. Drive streams with that unit's own CLI
   (`apps/tato-app/build/streamlib/target/tatolab-runtime/bin/tatolab`, with `TATOLAB_TEST_MACHINE_ROOT` set) —
   test-pattern streams only. `apps/tato-app/build/streamlib` keeps cargo's cache between builds, so building
   again at an unchanged commit is quick. **The proof build shares the installed app's bundle id**, so
   quit the installed Tato Studio first, which stops its runtime. The proof build starts its own
   carried `tatolabd` under the test root as its child and stops it when it quits. After: quit the
   proof build, `rm -rf /tmp/tatolab-proof`, and reopen `/Applications/Tato Studio.app`. Label
   **Live (local proof)**. A proof build takes `TATOLAB_TEST_MACHINE_ROOT` and
   `TATOLAB_TEST_LOOPBACK_HTTP_PORT` from its own environment (`/tmp/tatolab-proof` and 14446 when
   unset), so a second proof on the same machine runs with its own root and port, and cleans up
   that root instead.

   Without the packaged build — the unpackaged app over a runtime run by hand, as #37 and #38
   did:
   - Fetch streamlib `main` and build its test-root unit with
     `apps/tato-app/scripts/fetch-streamlib-for-the-app-build.sh apps/tato-app/build/streamlib`, then
     `apps/tato-app/scripts/build-tatolab-runtime-unit.sh apps/tato-app/build/streamlib --local-proof-test-root`. The unit's
     `streamlib-commit` must name `main`'s current head.
   - Create the lock `tatolabd` asks for (its refusal gives the commands), then run the unit's
     `tatolabd` with `TATOLAB_TEST_MACHINE_ROOT=/tmp/tatolab-proof`,
     and `TATOLAB_TEST_LOOPBACK_HTTP_PORT=14446`.
   - `npm run build -- --local-proof-test-root` (it writes
     `machineDirectoriesUnderATestRoot: true` into `apps/tato-app/out/main/tatolab_app_build_features.json`;
     never edit the built `.js`), and run `npx electron . --remote-debugging-port=<port>` with `TATOLAB_TEST_MACHINE_ROOT` and `CFFIXED_USER_HOME` (a
     scratch home) set. Drive it with Playwright over the DevTools protocol; Electron answers no
     window-bounds command there, so a larger page is an emulated viewport, said in the caption.
   - An unpackaged app carries no runtime and starts none: it uses the `tatolabd` you ran, and
     says no runtime is running while none answers.
   - After: quit the app, stop the unit's `tatolabd`, `rm -rf /tmp/tatolab-proof`, and run
     `npm run build` again so `apps/tato-app/out/` holds the shipping features.

   A change to what the app reads from the local API also runs the live contract test against
   that runtime, in `apps/tato-app/`: `TATOLAB_APP_LIVE_LOCAL_API_SOCKET=/tmp/tatolab-proof/run/local-api.sock
   npx vitest run src/main/local_api_client.test.ts`.
3. **Live on the machine.** Only for what the test root cannot reach: Gatekeeper, TCC prompts,
   the real `~/.local/bin/tatolab` link. This
   acts on the owner's real runtime — the `machine-brake` hook notes it — so say what you will
   run, run it only when the owner asked for this proof, and restore what you changed. Label
   **Live**.
4. **Linux.** On x86_64 Linux: `apps/tato-app/scripts/build-tatolab-linux-app.sh [--local-proof-test-root]`,
   then run the AppImage or `.deb`. On the Mac (arm64, which that script refuses): in an
   `ubuntu:22.04` container, build and run the unpackaged app (`npm ci && npm run build`,
   then `npx electron .`) with a container volume over `node_modules/`, so Linux's Electron never
   lands in the host's; run it under Xvfb with a StatusNotifier host and capture with
   `import -window root`. Packaging itself (`.deb` Depends, desktop entry, AppImage) is proven only
   by `apps/tato-app/scripts/build-tatolab-linux-app.sh` on x86_64 Linux. A runtime stand-in (a fake local API
   answering on the socket) is allowed and **named as a stand-in**. Label **Linux** or **Linux (container, unbundled)**.
   On a Mac, `apps/tato-app/scripts/verify/run-the-window-in-an-ubuntu-container.sh <folder>` does this with the
   stand-ins in `apps/tato-app/scripts/verify/linux-stand-ins/`.
   The carried runtime running as the app's child is proven only by a packaged `.deb` or AppImage
   of a real build.

## Capture

- Shoot into the session's scratch folder with descriptive names (`03-four-streams-running.png`),
  both themes for a visual change, and the window at its real size — not cropped to the change.
- The packaged window cannot be driven by Playwright (its fuses turn off the inspector); capture it
  with the platform's screenshot tool — on macOS `screencapture -l <CGWindowID>` (find the id with
  `osascript -e 'tell application "System Events" to id of first window of process "Tatolab"'`
  or a small `CGWindowListCopyWindowInfo` script; the terminal needs Screen Recording), on Linux
  `gnome-screenshot -w` or `import`.
- Never commit an image, on the PR branch or any other: it is temporary content that git keeps for
  good. Keep the images outside the repository and attach them in the conversation where you report
  the work; the PR body describes each one in words.
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
| <the claim> | Mock / Live (local proof) / Live / Linux | <file name, as attached in the conversation> | <the description> |

Found and fixed while shooting: <anything the run surfaced, with the proof of the fix> (or "nothing").
Not covered: <what this evidence does not prove, and why> (or "nothing").
```

Clean up: stop the dev server and any local-proof runtime you started, remove
`/tmp/tatolab-proof` when you created it, and say what you removed.
