# Engine guarantee

Status: decisions as of 2026-11-09, with Studio's feedback folded in.

These are the contracts the runtime will guarantee for every project, and the decisions behind them.
Several change how Tato Studio works; Studio's feedback is folded in below.

## Principles

Every contract below follows from these seven rules.

1. **The runtime is the engine.** It holds all the logic. People, Tato Studio and agents all talk to
   it through its local API; Studio never reads or writes project files itself.
2. **Every change is an action the runtime runs.** Graph edits, asset changes, imports and project
   settings are all actions. App management, such as quitting, is not.
3. **Everything is a project.** A dependency, a Marketplace entry (shipped as a zip) and a sample
   are all full projects with the same layout. There is no separate package or sample kind.
4. **Copy once, then reference.** Adding a module copies that project once, whole, into
   `imports/<module>/`; everything resolves there and nothing is copied or moved afterwards. The
   only exceptions are caches that can always be rebuilt (`.venv`, compiled shaders).
5. **A project is what runs.** Start, stop and pause apply to a whole project, and every graph in
   it runs, as in Unreal, TouchDesigner or Houdini. Starting or stopping a single stream goes away.
   A reactive node still wakes only when upstream data arrives.
6. **Closing a running project's window stops it,** after a prompt saying so (stop and close, or
   cancel). Running in the background is left out for now and may be added later.
7. **One SDK per contract.** Everyone, first party included, uses the same strictly typed SDK. A
   generated JSON Schema is a convenience, never the guarantee.

## The action contract

Every change to a project is one strictly typed, versioned action, parsed and applied one way
whether it arrives through MCP, the CLI, Studio or an SDK, the way Redux actions or CRDT ops are.
Clients build actions with one SDK.

- **The envelope.** Each applied action is a transaction: a UUID, an author (person, agent or the
  runtime), the commit history was at, the operations, their inverses, and what it undoes or
  redoes. Two additions are decided: a format version, so a newer runtime can still read and undo
  an older record, and a caller-made idempotency key, so a request Studio retries after a timeout
  is applied once. The client mints one key per user gesture, so a slider drag that commits on
  release is one key and one transaction.
- **Refusals.** A refused action comes back as structured data carrying the runtime's own words,
  so Studio can show it next to the field or wire that caused it.
- **The log.** There is no JSONL transaction log. Each transaction is one commit in the project's
  own Git history (`.tatolab/history.git`, branch `main`, written by the runtime, never pushed), its
  full JSON in a `Tatolab-Transaction:` trailer. Clients follow changes through the MCP resource
  `streamlib://project/<uuid>/transactions`.
- **Live edits** (`mode: live`) change the running graph only and are never recorded.
- **Undo and redo** are per author and produce new transactions. Studio's Undo says whose change it
  will revert when the last change was not the person's own.

The operations, as they stand once the module rework (streamlib #3402, #3401) lands:

| Family | Operations | Notes |
| --- | --- | --- |
| Graph | `add_node`, `remove_node`, `connect`, `disconnect`, `set_node_config`, `set_pin_value`, `rename_node`, `set_studio_fields`, `set_exposed_config_fields`, `refresh_fragment`, `add_group`, `remove_group`, `set_group_fields` | Nodes and links named by UUID; each records what its inverse needs. Decided with Studio: `collapse_selection_into_subgraph` and `unlock_generator_fragment` (a generator's frozen output becomes plain nodes) |
| Asset | `import_asset`, `relocate_asset`, `delete_asset`, `set_asset_settings` | A replaced file goes through a `replace_asset` action (decided, to add); replacing a file outside the runtime is unsupported |
| Import | `place_import`, `remove_import` | A module copied whole into `imports/<folder>/` |
| Graph document | `create_stream_document`, `delete_stream_document` | Get `create_stream` / `delete_stream` verbs (decided, to add); Studio's New stream waits on them |
| Project | Decided with Studio: `write_project_file`, `rename_project` | A file save is recorded, so a code edit undoes like any other edit |

**Decided, to build:** today each entry point has its own request types in front of the operations
(the MCP tools have their own argument structs), and requests and records use different names
(`rename_asset` and `move_asset` both record `relocate_asset`). The guarantee closes that into one
action vocabulary.

**Not actions:** run, stop and pause a project; listing and reading project files; duplicating and
deleting a project (runtime verbs, because they act on the whole project and its
history); viewers; app management. A stream's display name
moves into the project as an action (today `rename_stream` writes the runtime's own record).

## The project layout

Every project, module, Marketplace entry and sample has this one layout. Fixed by code:
`tatolab-project.json`, the `.asset.json` sidecar beside each asset, `views/`, `imports/` and
`.tatolab/`. `streams/`, `nodes/` and `media/` are conventions; an asset or a Python file may sit at
any path.

```text
project/
├── tatolab-project.json              Identity, runtime version, imports
├── pyproject.toml                    Project Python; runtime writes uv sources
├── .python-version                   Interpreter version
├── .gitignore                        .venv, __pycache__, *.pyc
├── streams/                          Convention: any path works
│   ├── main.graph.json               A stream asset
│   └── main.graph.json.asset.json    Its sidecar
├── nodes/                            Convention: any .py works
│   └── halftone_lens_effect.py       Node types and graph generators
├── media/                            Any folder name
│   ├── clip.mp4                      Media; history keeps a pointer only
│   └── clip.mp4.asset.json           UUID, kind, SHA-256, size, settings
├── views/                            Custom views; same SDK as Studio's own
├── imports/                          Modules, copied once, read in place
│   └── module/                       A whole project, same layout
│       ├── tatolab-project.json      The module's identity
│       ├── streams/ nodes/ ...       Its own streams, node code, assets
│       └── imports/                  Its own modules, nested
├── .tatolab/                         * Runtime-owned, not in history
│   ├── history.git/                  * The transaction log (bare Git)
│   ├── uploads/                      * Staged uploads, emptied on import
│   └── logs/project.jsonl            * The JSONL run log
└── .venv/                            * Cache, rebuilt from the lock
```

History records every file except the starred ones, and keeps a media, scene or data asset as its
sidecar alone (hash and size, like a Git LFS pointer), never its bytes. The run log moves from
`.streamlib/logs/` into `.tatolab/logs/` (decided). A module is opened and edited as its own
project; nothing is written back to the place it was copied from.

## Extension contracts

What a module or a view author can rely on, each defined once in code and held by a gate.

| Contract | Defined by | Status |
| --- | --- | --- |
| Node types | `@node.process`, `@node.function`, `@node.rust_function` in `tatolab.stream`; ports are `Input`/`Output` of one of five families (Image, Array, Channels, Packets, Records); config from a config class | Exists; held by the Python conformance gate |
| Graph generators | `@graph_generator`, its output stored as a fragment | Exists |
| Native half of a node | `tatolab-module-sdk` module host table | Exists |
| Module identity | `tatolab-project.json` (a module is a project) | Exists; strict, unknown keys refused |
| Views | The view SDK's Zod contract, `packages/tato-app-view-sdk` (view contract 1.0): title, entry, `placement` (`area` or `node`), declared `inputs`/`outputs`, `settings`, sandbox and capabilities | Exists in tatolab-app |
| A node's `studio` fields | The `studio` map on each node in a graph document | Decided: a strict, versioned contract owned by Tatolab for the important keys (canvas position, group, comment, colour, collapsed or expanded), plus one free-form metadata map for anything else |
| Graph-level Studio items | Canvas Notes and Frames, which are not nodes | Decided with Studio: their own place in the graph document's Studio metadata, under the same versioned contract |

Views are found in `views/<name>/` of the project and its imports and listed by the runtime
through a verb (decided). Each entry carries the view's id, title, icon, `description`, `preview`,
`placement`, declared inputs and outputs with their families, the project that brings it, and
whether it opens and, if not, why, in the schema's or the runtime's words. Today the view SDK finds a project's views through a Python
`tatolab.views` entry point, and Studio lists them itself; that changes.

## Views as graph nodes

A view that sits on the canvas is a real node, so the graph, Properties and every other client
treat it like any other node. The view's panel is always available in Studio, and its node is the
panel's plug into a stream, wiring data in and out.

- **The node.** Each view is its own node type, named by its view type (`acme-dj:deck`), the way a
  project's Python node classes are. The runtime reads the view's declared input and output ports,
  with their families, from the view contract and reports them like any node's ports, so the
  canvas draws pins and Properties builds the form the usual way. The manifest's `description`
  and each port's `description` are the type's, for tooltips and agents. Add-node and search list
  views under a **Views** group, each by its `title`.
- **One node per view per stream.** For now a stream holds at most one node of a view type; the
  runtime refuses a second, so a panel always knows its node. Several nodes of one view, with a
  picker in the panel, may come later.
- **Settings are config.** The view's `settings` become the node's config and change through
  `set_node_config`, so they are in history and undo like every other edit.
- **Reads.** Panels read the node's inputs through the existing viewer path; Image stays
  zero-copy. One GPU copy is allowed for an inbound Image where the view needs it.
- **Writes.** A panel sends values to the node over a new runtime path. The node owns its values
  and publishes them on its output ports, and downstream keeps the last value. This replaces
  `send_output` going to the runtime directly.
- **Many panels.** Any number of panels can show the same node. All of them see the same values;
  when two edit at once, the last write wins. Fan-out downstream works like any node.
- **When Studio is closed.** The project stops when its window closes (after a prompt), so a view
  node never runs without a window to draw it.

```text
 Runtime (the graph)
 ┌───────────────┐  inputs  ┌──────────────────────────┐  outputs  ┌──────────────────┐
 │ Upstream node │ ───────► │ acme-dj:deck node        │ ────────► │ Downstream node  │
 └───────────────┘          │ config = view settings   │           │ keeps last value │
                            │ owns its values          │           └──────────────────┘
                            └──────────────────────────┘
                     reads (viewer path) │      ▲ sends values (last write wins)
 Studio window                           ▼      │
                            ┌──────────────┐  ┌──────────────────────────┐
                            │ View panel   │  │ Same view, second panel  │
                            └──────────────┘  └──────────────────────────┘
```

The node is the single store: a panel never holds its own copy of a value, it draws what the node
publishes and sends edits back.

## What changes for Studio

Each item is something Studio does today that moves, or something it will need to do.

| Area | Today | After |
| --- | --- | --- |
| Run controls | Start and stop per stream (`start_stream`, `stop_stream`) | Run, stop and pause apply to the whole project; per-stream start and stop go away |
| Closing the window | No rule | Closing a running project's window asks: stop and close, or cancel. Background running is left out for now |
| Project files | The view bridge's `read_project_file` / `save_project_file` asks go to the runtime's file tools, and views are listed by `list_project_views` | Studio reads no project files. Listing and reading are runtime verbs, and a write is the `write_project_file` action; views are listed by the runtime from `views/<name>/` in the project and its imports |
| Node view settings | Kept by the view | Become the node's config, changed with `set_node_config` |
| View output | A panel's value goes to its node through `write_studio_view_output` (`tatolab_view_bridge.ts`) | Panels send values to the node over the new runtime path (see Views as graph nodes) |
| View input wiring | Matched by node name | Matched by node UUID |
| Node `studio` fields | A free map; only `group` is checked | A strict, versioned contract for position, group, comment and colour, plus a free-form metadata map |
| Edits | Studio calls separate tools whose arguments differ from what history records | Every edit goes through one SDK in one action contract, with a format version and a caller idempotency key |
| Stream display name | Held outside the project | A field in the project, changed by a transaction |
| Naming | "Stream" | Renamed to "graph" in one sweep, later |

## Studio's feedback

Studio confirmed the draft covers graph and node editing, history, views as nodes, the Library,
Modules and project run controls, and asked for what is now folded in above:

- verbs to list, read and write a project's files, for the Code and Files views;
- rename, duplicate and delete a project, built under tatolab/streamlib#3406;
- collapsing a selection into a subgraph, and unlocking a generator's frozen output;
- canvas Notes and Frames, and a node's collapsed state, in the Studio metadata contract;
- the view listing's fields, including whether a view opens and why not;
- structured refusals, one idempotency key per gesture, and an Undo that names whose change it
  reverts.

Studio's screens keep "Stream" until the sweep to "graph" is scheduled.
