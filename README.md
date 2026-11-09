# Live (local proof) for tatolab/tatolab-app#176

- streamlib: `4c126df41efe3cc995c7dd72024674391dbcca76` (main when built), test-root runtime unit from `scripts/build-tatolab-runtime-unit.sh --local-proof-test-root`
- tatolab-app: `3e686c161245a8cecd73f5e34b4cf54428109035` (claude/project-thread-g24grs), built with `npm run build -- --local-proof-test-root`, run unpackaged with `electron . --no-sandbox`, driven over CDP with Playwright
- Runtime loaded: `pattern` (main), `doorways` (`front_door` running, `back_door` failed: its node module reads a missing key file at import, so main refuses to describe it), `sidedoor` (main, running, with a `RiveSource` whose `riv_path` is a missing `side_door.riv`, so its `start()` raises)

| Screenshot | What it shows |
| --- | --- |
| `01-projects-window.png` | Projects window on a fresh HOME, runtime running and its 4 streams listed (app log `listed_stream_count=4`, no listing warning); no project opened yet, so no cards |
| `02-pattern-project-outliner.png` | The pattern project opened via Open…; the outliner lists its stream by display name `pattern` and the graph shows its three nodes |
| `03-sidedoor-graph-with-the-failed-rive-node.png` | sidedoor's stream graph; the runtime reports `sidedoorsign` in state `Error`, `start() raised: RiveSource: could not read "side_door.riv"` — the card shows no failure |
| `04-failed-rive-node-selected-properties.png` | `sidedoorsign` selected; Properties shows its config and ports, no failure |
| `05-projects-window-runtime-stopped.png` | Projects window reloaded after tatolabd was stopped: the two opened projects, no Running badge |
| `06-projects-window-runtime-running.png` | Projects window reloaded after tatolabd restarted and re-loaded: both projects marked Running |

The viewer pane in 02–04 shows that the native viewer addon was not built (`npm run build` does not build it); that is outside #176.
