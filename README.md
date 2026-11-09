# Live (local proof) for tatolab/tatolab-app#176

- streamlib: `4c126df41efe3cc995c7dd72024674391dbcca76` (main when built), test-root runtime unit from `scripts/build-tatolab-runtime-unit.sh --local-proof-test-root`
- tatolab-app: `3e686c161245a8cecd73f5e34b4cf54428109035` for 01–06, and `673625e` (claude/project-thread-g24grs with main merged in, carrying #175) for 07–09; built with `npm run build -- --local-proof-test-root`, run unpackaged with `electron . --no-sandbox`, driven over CDP with Playwright
- Runtime loaded: `pattern` (main), `doorways` (`front_door` running, `back_door` failed: its node module reads a missing key file at import, so main refuses to describe it), `sidedoor` (main, running, with a `RiveSource` whose `riv_path` is a missing `side_door.riv`, so its `start()` raises)

| Screenshot | What it shows |
| --- | --- |
| `01-projects-window.png` | Projects window on a fresh HOME, runtime running and its 4 streams listed (app log `listed_stream_count=4`, no listing warning); no project opened yet, so no cards |
| `02-pattern-project-outliner.png` | The pattern project opened via Open…; the outliner lists its stream by display name `pattern` and the graph shows its three nodes |
| `03-sidedoor-graph-with-the-failed-rive-node.png` | At 3e686c1 (before #175): sidedoor's stream graph; the runtime reports `sidedoorsign` in state `Error`, `start() raised: RiveSource: could not read "side_door.riv"` — the card shows no failure |
| `04-failed-rive-node-selected-properties.png` | At 3e686c1: `sidedoorsign` selected; Properties shows its config and ports, no failure |
| `05-projects-window-runtime-stopped.png` | Projects window reloaded after tatolabd was stopped: the two opened projects, no Running badge |
| `06-projects-window-runtime-running.png` | Projects window reloaded after tatolabd restarted and re-loaded: both projects marked Running |
| `07-pattern-project-outliner-at-673625e.png` | At 673625e: the pattern project, opened from its card; the outliner lists its stream by display name `pattern` |
| `08-sidedoor-graph-with-the-failed-rive-node-at-673625e.png` | At 673625e: the `sidedoorsign` card is badged `Failed` and shows `start() raised: RiveSource: could not read "side_door.riv": …` |
| `09-failed-rive-node-selected-properties-at-673625e.png` | At 673625e: `sidedoorsign` selected; Properties leads with "This node failed." and the runtime's reason, then its config and ports |

The viewer pane in 02–04 shows that the native viewer addon was not built (`npm run build` does not build it); that is outside #176.
