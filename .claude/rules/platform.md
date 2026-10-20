---
paths:
  - "src-tauri/**"
  - "packaging/**"
  - "scripts/**"
---

# Platform layer

- **Everything that differs by platform sits in `src-tauri/src/platform/`**, behind the traits the
  rest of the app uses (`RuntimeAgentRegistration`, `TatolabMachineSetup`) and the items each
  platform module exposes. Both modules expose the same items with the same signatures, re-exported
  from `platform/mod.rs`; where a platform has nothing to do, its item says so in its doc. No
  `target_os` outside `platform/`, except `main.rs`'s compile-error guard —
  `scripts/check-platform-cfg-confinement.sh` enforces it.
- **Extend the platform seam, never bypass it.** A new OS mechanism (a service-manager call, a
  path, a prompt) is a new item on both modules or a new method on the existing trait — never a
  `Command::new("launchctl")` in shared code, never a second registration path.
- **The Linux module builds on a Mac** (`#[cfg(any(target_os = "linux", test))]`), so its tests run
  everywhere. Keep it free of Linux-only crates; `tauri-plugin-single-instance` wiring is the one
  exception and stays behind `cfg(target_os = "linux")` inside the module.
- **Every OS side effect is injected.** `launchctl`, `systemctl --user`, `osascript`'s
  administrator prompt, `SMAppService` and the filesystem roots reach the code through a seam a
  test fakes. A test that would show a real prompt, register a real agent or touch `/Library`,
  `/usr/local/bin` or `~/.config/systemd` is a defect.
- **`machine-directories-under-a-test-root` is for local proof only.** It moves the machine lock,
  state and socket under `TATOLAB_TEST_MACHINE_ROOT`. Never ship it: the bundle scripts refuse a
  test-root unit without `--local-proof-test-root`, and `verify-tatolab-app-bundle.sh --shipping`
  fails such a bundle. Both feature sets are tested and linted in CI.
- **Signing and the bundle's seal are load-bearing.** Code lives only under `Contents/MacOS/` and
  `Contents/Frameworks/`; nothing writes into a signed bundle at run time; entitlements change only
  with a stated reason (each one is something the hardened runtime otherwise refuses). After any
  packaging change, `scripts/verify-tatolab-app-bundle.sh` passes on the built bundle.
- **macOS changes are proven on macOS, Linux changes on Linux.** A Mac cannot lint the Linux `cfg`
  arms; the `ubuntu-22.04` PR check is the gate for them. Linux proof without a Linux machine runs
  in a container and is labelled so (a runtime stand-in is named a stand-in).
