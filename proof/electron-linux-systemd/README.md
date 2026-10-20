# Electron on Linux drives tatolabd.service (#19)

Label: **Linux (container, unbundled)**. Ubuntu 24.04 cloud container, systemd 255, no user manager
running (PID 1 is not systemd and `systemd --user` will not start there). The Electron main
process's built modules (`npm run build:electron`) are driven by
[`drive-the-run-tatolab-switch.mjs`](drive-the-run-tatolab-switch.mjs): the real
`SystemctlOnThePath` runner (`execFile`, no shell), `SystemdUserRuntimeService` and
`RunTatolabSwitch` over a temporary preference file. No window: the window reaches the switch with
#18 and #23.

## A. The container's real `systemctl --user`

`is-enabled` reads unit files without a user manager, so the readback is real systemd's answer.
Changes need the manager, so they show the refusal in systemctl's own words.

| Unit on disk | What the app read |
|---|---|
| none | `not_found` (exit 4, `not-found`), logged once |
| `~/.config/systemd/user/tatolabd.service` | `not_registered` (`disabled`) |
| after `systemctl --user enable tatolabd.service` | `enabled` |

Run Tatolab off answered `unregistration_failed`: `systemctl --user disable --now tatolabd.service failed (exit 1): Removed "/root/.config/systemd/user/default.target.wants/tatolabd.service".` followed by `Failed to connect to bus: No medium found`. The app then read `not_registered`.
Run Tatolab on answered `registration_failed` in the same words for `enable --now`, then read `enabled`.

## B. A `systemctl` stand-in on the PATH

[`systemctl-stand-in`](systemctl-stand-in), **a stand-in**, answers as `systemctl --user` does for
one unit, and its unit's runtime is a stand-in process (`sleep`). It is put first on the PATH as
`systemctl`, so the real runner's exit-code handling is exercised.

| Step | What the app answered and read back |
|---|---|
| status, no unit | `not_found` |
| Run Tatolab on, no unit | `registration_failed`: `systemctl --user enable --now tatolabd.service failed (exit 1): Failed to enable unit: Unit file tatolabd.service does not exist.`; still `not_found` |
| unit installed | `not_registered` |
| Run Tatolab on | `registered`, then `enabled`; the runtime stand-in is running |
| Run Tatolab off | `unregistered`, then `not_registered`; the runtime stand-in is stopped |
| Run Tatolab on | `registered`, then `enabled` |

The commands the stand-in received, in order (each run loads the switch, which reads `is-enabled` once):

```
--user is-enabled tatolabd.service
--user is-enabled tatolabd.service
--user enable --now tatolabd.service
--user is-enabled tatolabd.service
--user is-enabled tatolabd.service
--user is-enabled tatolabd.service
--user is-enabled tatolabd.service
--user enable --now tatolabd.service
--user is-enabled tatolabd.service
--user start tatolabd.service
--user is-enabled tatolabd.service
--user is-enabled tatolabd.service
--user disable --now tatolabd.service
--user is-enabled tatolabd.service
--user is-enabled tatolabd.service
--user enable --now tatolabd.service
--user is-enabled tatolabd.service
--user start tatolabd.service
--user is-enabled tatolabd.service
```

## Reproduce

```
npm run build:electron
node proof/electron-linux-systemd/drive-the-run-tatolab-switch.mjs status   # the real systemctl
mkdir -p /tmp/stand-in/bin /tmp/stand-in/state && cp proof/electron-linux-systemd/systemctl-stand-in /tmp/stand-in/bin/systemctl
touch /tmp/stand-in/state/tatolabd.service   # "install" the unit
SYSTEMCTL_STAND_IN_STATE=/tmp/stand-in/state PATH=/tmp/stand-in/bin:$PATH node proof/electron-linux-systemd/drive-the-run-tatolab-switch.mjs on
```
