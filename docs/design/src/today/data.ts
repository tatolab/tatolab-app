// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

/* What the runtime serves today, in its own shapes (runtime 0.46, streamlib main 2026-10-20):
   list_streams, graph (nodes, links with dropped / refused counters, exposed ports),
   logs, expose_port, add_node / remove_node / connect / disconnect, and the relay verbs
   list_relays / add_relay / configure_relay / remove_relay over the relay-adapter catalog.
   One machine: the app talks to this machine's runtime only. */

import { type Exposure, type StreamSpec, type StreamStatus, streams as directionStreams } from "@/data/mock"

export const thisMachine = {
  name: "studio-mac",
  runtimeVersion: "0.46.0",
  socket: "~/Library/Application Support/Tatolab/run/local-api.sock",
  uptime: "3d 2h",
}

/** `list_streams` state. Attached lives as long as the connection that ran it. */
export type RuntimeStreamState = "attached" | "kept" | "stopped" | "failed"

export interface TodayStream extends StreamSpec {
  state: RuntimeStreamState
  loaded: boolean
  /** `failed_because`, only for a failed stream. */
  failedBecause?: string
  /** `stream_instance` of the current load. */
  streamInstance?: string
  /** `compile_warnings` from the last run. */
  compileWarnings: string[]
}

const runtimeState: Record<string, { state: RuntimeStreamState; failedBecause?: string; compileWarnings?: string[] }> = {
  "front-door": { state: "kept" },
  "studio-voice": { state: "kept" },
  "halftone-booth": { state: "attached" },
  "dock-4": {
    state: "kept",
    compileWarnings: ["cross-floor check: nodes/heat_render.py imports cupy, which has no linux-aarch64 wheel — this stream will not run on a Jetson"],
  },
  "lobby-wall": { state: "kept" },
  "test-pattern": { state: "stopped" },
  "lobby-recorder": {
    state: "failed",
    failedBecause: "Could not re-load when the runtime started: CameraSource found no camera at index 0.",
  },
}

function statusOf(state: RuntimeStreamState): StreamStatus {
  if (state === "stopped") return "paused"
  if (state === "failed") return "failed"
  return "live"
}

export const todayStreams: TodayStream[] = directionStreams.map((s, i) => {
  const r = runtimeState[s.id]
  const loaded = r.state === "kept" || r.state === "attached"
  return {
    ...s,
    machine: "studio-mac",
    project: s.project.replace("/opt/streams/", "~/streams/"),
    status: statusOf(r.state),
    statusDetail: r.failedBecause ?? (loaded ? "" : "Stopped"),
    runMode: r.state === "attached" ? "dev-session" : r.state === "stopped" ? "manual" : "always-on",
    state: r.state,
    loaded,
    failedBecause: r.failedBecause,
    streamInstance: loaded ? `${s.id}#${i + 3}` : undefined,
    compileWarnings: r.compileWarnings ?? [],
  }
})

export const todayStreamById = (id: string) => todayStreams.find((s) => s.id === id)

/** The words for list_streams states, with the runtime's term kept for tooltips. */
export const runtimeStateWords: Record<RuntimeStreamState, { label: string; long: string }> = {
  kept: { label: "Always on", long: "The runtime keeps it: it loads again whenever the runtime starts, until you stop it." },
  attached: {
    label: "Dev session",
    long: "Run by `tatolab dev` or `tatolab run` in a terminal. It lives as long as that command, and reloads on save under dev.",
  },
  stopped: { label: "Stopped", long: "Kept, but stopped. It stays unloaded across runtime restarts until you start it." },
  failed: { label: "Failed", long: "Skipped at start until you start it again, which retries it." },
}

/** Exposure levels each relay instance serves; the publisher forwards a port to every relay its level reaches. */
export type RelayConnectionState =
  | { state: "joined" }
  | { state: "joining" }
  | { state: "not_joined"; why?: string }
  | { state: "lost"; why: string; rejoiningAfterMs: number }

export interface RelaySettingSchema {
  name: string
  label: string
  description: string
  secret?: boolean
  required?: boolean
  placeholder?: string
  defaultValue?: string
  kind: "text" | "port" | "textarea"
}

export interface RelayAdapter {
  kind: "local" | "cloudflare" | "moqpro"
  name: string
  logo?: string
  description: string
  serves: Exposure[]
  settings: RelaySettingSchema[]
  addable: boolean
}

/** The `streamlib://relay-adapter-catalog` resource, as the three adapters on main describe themselves. */
export const relayAdapterCatalog: RelayAdapter[] = [
  {
    kind: "local",
    name: "Local relay",
    description: "The machine's own relay, run by the runtime as two built-in instances. Nothing to add.",
    serves: ["private", "public"],
    addable: false,
    settings: [
      {
        name: "port",
        label: "Port",
        description: "The port the listener takes for QUIC and HTTP alike. Absent, the listener's default.",
        kind: "port",
      },
    ],
  },
  {
    kind: "cloudflare",
    name: "Cloudflare",
    logo: "/relays/cloudflare.svg",
    description:
      "A relay Cloudflare provisioned, dialed at the publish-and-subscribe URL Cloudflare returns for it. Serves public ports, at the relay's top level.",
    serves: ["public"],
    addable: true,
    settings: [
      {
        name: "relay_url",
        label: "Relay URL",
        description: "The publish-and-subscribe URL as Cloudflare returns it. Its token rides the path, so the whole URL is kept as a secret.",
        secret: true,
        required: true,
        placeholder: "https://draft-16.cloudflare.mediaoverquic.com/<token>",
        kind: "text",
      },
    ],
  },
  {
    kind: "moqpro",
    name: "moq.pro",
    logo: "/relays/moqpro.svg",
    description: "A moq.pro project, dialed with tokens minted from the project's signing key. Serves public ports, under the project.",
    serves: ["public"],
    addable: true,
    settings: [
      {
        name: "project_id",
        label: "Project ID",
        description: "The project's id as moq.pro names it: the root every token is minted under.",
        required: true,
        placeholder: "pb1studio",
        kind: "text",
      },
      {
        name: "signing_key",
        label: "Signing key",
        description: "The JWK moq.pro gave for the project, as JSON or base64url JSON. Kept in the OS secret store and never shown again.",
        secret: true,
        required: true,
        placeholder: '{"kty":"OKP","crv":"Ed25519", …}',
        kind: "textarea",
      },
      {
        name: "relay_url",
        label: "Relay URL",
        description: "The relays the project is served at.",
        placeholder: "https://cdn.moq.dev",
        defaultValue: "https://cdn.moq.dev",
        kind: "text",
      },
    ],
  },
]

export interface RelayInstance {
  relayId: string
  adapter: RelayAdapter["kind"]
  builtIn: boolean
  /** Non-secret settings; a secret is never returned. */
  settings: Record<string, string | number | null>
  /** Each secret setting by name: `set` or `unset`, never its value. */
  secrets: Record<string, "set" | "unset">
  connection: RelayConnectionState
  serves: Exposure[]
  /** App-side counters for the prototype; the runtime does not serve these today. */
  tracks: number
}

/** `list_relays`, built-in instances first. */
export const todayRelays: RelayInstance[] = [
  {
    relayId: "local-loopback",
    adapter: "local",
    builtIn: true,
    settings: { port: 4443 },
    secrets: {},
    connection: { state: "joined" },
    serves: ["private"],
    tracks: 9,
  },
  {
    relayId: "local-every-interface",
    adapter: "local",
    builtIn: true,
    settings: { port: 4445 },
    secrets: {},
    connection: { state: "joined" },
    serves: ["public"],
    tracks: 6,
  },
  {
    relayId: "cloudflare-1",
    adapter: "cloudflare",
    builtIn: false,
    settings: {},
    secrets: { relay_url: "set" },
    connection: { state: "joined" },
    serves: ["public"],
    tracks: 6,
  },
  {
    relayId: "moqpro-1",
    adapter: "moqpro",
    builtIn: false,
    settings: { project_id: "pb1studio", relay_url: null },
    secrets: { signing_key: "set" },
    connection: { state: "lost", why: "refused", rejoiningAfterMs: 2000 },
    serves: ["public"],
    tracks: 0,
  },
]

export const adapterByKind = (kind: RelayAdapter["kind"]) => relayAdapterCatalog.find((a) => a.kind === kind)!

/** The relays a port at this exposure level reaches. */
export function relaysReaching(level: Exposure) {
  if (level === "internal") return []
  return todayRelays.filter((r) => (level === "public" ? true : r.serves.includes("private")))
}
