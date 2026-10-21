# Roadmap

How the redesign lands. Issues cite frames as `docs/design/public/storyboard/<edition>/<id>.jpg`.

## New design — milestone 2

The app on the new design with the features it already has. Starts once the Electron conversion
ships (#24).

| Issue | What | Frames |
|---|---|---|
| #36 | React, Tailwind and shadcn window; tokens and vocabulary; shell; Streams list | `today/streams*` |
| #37 | A stream's Overview and Inspect | `today/overview*`, `today/inspect` |
| #38 | A stream's graph: steps, links, state, counters, previews of exposed outputs | `today/graph*` |
| #39 | A stream's logs and the pointer to older records | `today/logs*` |
| #40 | Add a stream: run a project folder or create one | `today/new*` |
| #41 | Settings | `today/settings-*` |
| #3 | First run | `today/setup-*` |

## Relays in the app — milestone 3

| Issue | What | Frames |
|---|---|---|
| #5 | Relays panel: list, add, configure, remove | `today/relays*`, `today/relay-*` |
| #6 | A stream's Outputs tab: exposure, thumbnails, Watch | `today/outputs` |
| #7 | Track addresses per relay; the local relay's listeners up or down | `today/outputs`, `today/relays` |
| #8 | Provider sign-in for Cloudflare and moq.pro | `today/relay-add-*`, `today/relay-configure` |

## Later — the Direction edition

Not scheduled: editing the running graph from the app, several machines, per-step CPU / GPU /
frame rate and stats, a library of packs, relay setups, more relay providers, TV mode. See
`public/storyboard/direction/` and the prototype at `/direction`.

## Open questions for the owner

1. Graph edits made in the app are not written to `stream.py` — is "Copy as code" enough, or
   should the app offer to write them back?
2. Stopped and failed streams show their last graph, read-only. Should the app keep it, or should
   the runtime serve the recorded graph of a kept stream that is not loaded?
3. "Retry now" on a lost relay is modelled as `configure_relay` with no changes — is a real rejoin
   verb wanted?

## Invented in the prototype — verify before an issue relies on it

- The Direction edition's CLI flags (`tatolab pair`, `tatolab expose … --relay`, `tatolab env`) and
  the domain `watch.tatolab.dev`.
- Mock data: exit codes, per-step memory and threads, relay subscriber and egress counts,
  machine temperature, the moq.pro project id.
