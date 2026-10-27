import { describe, expect, it } from "vitest";
import type { ListedRelay, RelayAdapter, RelaysDescription } from "../../shared/tatolab_backend_contract";
import {
  presentRelayAdapterNaming,
  presentRelayConnectionState,
  presentRelaysSection,
  relaySettingsDialogSubjectOf,
  runtimeWordsSegmentsOf,
} from "./relays_presentation";

const LOCAL_ADAPTER: RelayAdapter = {
  kind: "local",
  display_name: "Local relay",
  display_icon_data_uri: "data:image/svg+xml;base64,TE9DQUw=",
  doc: "The machine's own relay, built in.",
  setting_fields: [
    { name: "port", description: null, is_required: false, is_secret: false, value_kind: { kind: "whole_number", minimum: 0, maximum: 65535 }, accepts_null: true },
  ],
};
const CLOUDFLARE_ADAPTER: RelayAdapter = {
  kind: "cloudflare",
  display_name: "Cloudflare",
  display_icon_data_uri: "data:image/svg+xml;base64,Q0xPVUQ=",
  doc: "A relay Cloudflare provisioned.",
  setting_fields: [{ name: "relay_url", description: null, is_required: true, is_secret: true, value_kind: { kind: "text" }, accepts_null: false }],
};
const RED5_ADAPTER: RelayAdapter = {
  kind: "red5",
  display_name: null,
  display_icon_data_uri: null,
  doc: "A Red5 relay.",
  setting_fields: [
    { name: "regions", description: null, is_required: true, is_secret: false, value_kind: { kind: "not_drawable", schema_type_words: "array" }, accepts_null: false },
  ],
};

const LOOPBACK: ListedRelay = { relay_id: "local-loopback", adapter: "local", built_in: true, settings: { port: 4443 }, secrets: {}, connection_state: { state: "joined" } };
const EVERY_INTERFACE: ListedRelay = { ...LOOPBACK, relay_id: "local-every-interface", settings: { port: 4445 } };
const MOQPRO_ADAPTER: RelayAdapter = {
  kind: "moqpro",
  display_name: "moq.pro",
  display_icon_data_uri: "data:image/svg+xml;base64,TU9RUFJP",
  doc: "A moq.pro project.",
  setting_fields: [{ name: "project_id", description: null, is_required: true, is_secret: false, value_kind: { kind: "text" }, accepts_null: false }],
};

const MOQPRO: ListedRelay = {
  relay_id: "moqpro-1",
  adapter: "moqpro",
  built_in: false,
  settings: { project_id: "pb1studio" },
  secrets: { signing_key: "set" },
  connection_state: { state: "lost", why: "refused", rejoining_after_ms: 4000 },
};

const DESCRIBED: RelaysDescription = { relays: [LOOPBACK, EVERY_INTERFACE, MOQPRO], adapters: [LOCAL_ADAPTER, CLOUDFLARE_ADAPTER, RED5_ADAPTER] };

describe("the Relays section", () => {
  it("says the relays show while the runtime runs, whatever it last read", () => {
    expect(presentRelaysSection(false, { kind: "read", description: DESCRIBED })).toEqual({
      kind: "runtime_not_running",
      words: "Relays show here while the runtime runs.",
    });
  });

  it("waits for the first reading, and shows a refusal with nothing read in the runtime's words", () => {
    expect(presentRelaysSection(true, { kind: "not_read" })).toEqual({ kind: "reading" });
    expect(presentRelaysSection(true, { kind: "refused", refusal: "no route /api/relay-adapters", lastDescription: null })).toEqual({
      kind: "not_listed",
      refusal: "no route /api/relay-adapters",
    });
  });

  it("shows the local relay's listeners first with their ports, and every other relay after them", () => {
    const section = presentRelaysSection(true, { kind: "read", description: DESCRIBED });

    if (section.kind !== "listed") return expect.unreachable(section.kind);
    expect(section.localRelayListenerRows.map((row) => [row.relay.relay_id, row.label, row.portWords])).toEqual([
      ["local-loopback", "Loopback", "Port 4443"],
      ["local-every-interface", "Every interface", "Port 4445"],
    ]);
    expect(section.localRelayListenerRows.map((row) => row.servesWords)).toEqual(["Every exposed port, to this machine alone", "Public ports, to any machine that reaches it"]);
    expect(section.hostedRelayRows.map((row) => [row.relay.relay_id, row.settingsWords])).toEqual([["moqpro-1", "Project ID pb1studio · Signing key set"]]);
    expect(section.lastReadingRefusal).toBeNull();
  });

  it("names each Configure… by its relay, and makes it unavailable naming why for an adapter whose settings the form cannot draw or the catalog does not name", () => {
    const section = presentRelaysSection(true, {
      kind: "read",
      description: {
        relays: [LOOPBACK, { ...MOQPRO, adapter: "red5", relay_id: "red5-1" }, MOQPRO],
        adapters: [LOCAL_ADAPTER, RED5_ADAPTER],
      },
    });

    if (section.kind !== "listed") return expect.unreachable(section.kind);
    expect(section.localRelayListenerRows.map((row) => [row.configureLabel, row.configureUnavailableBecause])).toEqual([["Configure Loopback", null]]);
    expect(section.hostedRelayRows.map((row) => [row.configureLabel, row.configureUnavailableBecause])).toEqual([
      ["Configure red5-1", "Tatolab can't show the setting regions (array) in a form yet."],
      ["Configure moqpro-1", "The runtime's catalog names no adapter moqpro."],
    ]);
    expect(section.noAddedRelayWords).toBe("Add one with + to serve public outputs beyond this machine's own network.");
  });

  it("offers every adapter that backs no built-in relay, and one whose settings the form cannot draw as unavailable naming why", () => {
    const section = presentRelaysSection(true, { kind: "read", description: DESCRIBED });

    if (section.kind !== "listed") return expect.unreachable(section.kind);
    expect(section.adapterChoices).toEqual([
      { adapter: CLOUDFLARE_ADAPTER, adapterNaming: presentRelayAdapterNaming(CLOUDFLARE_ADAPTER), unavailableBecause: null },
      { adapter: RED5_ADAPTER, adapterNaming: presentRelayAdapterNaming(RED5_ADAPTER), unavailableBecause: "Tatolab can't show the setting regions (array) in a form yet." },
    ]);
  });

  it("keeps the last relays it read beside the refusal of the reading after them", () => {
    const section = presentRelaysSection(true, { kind: "refused", refusal: "`list_relays` answered with no text", lastDescription: DESCRIBED });

    if (section.kind !== "listed") return expect.unreachable(section.kind);
    expect(section.lastReadingRefusal).toBe("`list_relays` answered with no text");
    expect(section.hostedRelayRows).toHaveLength(1);
  });

  it("names a built-in relay this app does not know by its id, and a port the runtime lists none for as its default", () => {
    const section = presentRelaysSection(true, {
      kind: "read",
      description: { relays: [{ ...LOOPBACK, relay_id: "local-tailnet", settings: {} }], adapters: [LOCAL_ADAPTER] },
    });

    if (section.kind !== "listed") return expect.unreachable(section.kind);
    expect(section.localRelayListenerRows.map((row) => [row.label, row.servesWords, row.portWords])).toEqual([["local-tailnet", null, "Default port"]]);
  });
});

describe("an adapter's naming", () => {
  it("is the name and icon the catalog serves", () => {
    expect(presentRelayAdapterNaming(CLOUDFLARE_ADAPTER)).toEqual({ words: "Cloudflare", isTheAdapterKind: false, iconDataUri: "data:image/svg+xml;base64,Q0xPVUQ=" });
  });

  it("falls back to the kind, with no icon, from a runtime that serves neither, or an empty name", () => {
    expect(presentRelayAdapterNaming(RED5_ADAPTER)).toEqual({ words: "red5", isTheAdapterKind: true, iconDataUri: null });
    expect(presentRelayAdapterNaming({ ...CLOUDFLARE_ADAPTER, display_name: " ", display_icon_data_uri: null })).toEqual({
      words: "cloudflare",
      isTheAdapterKind: true,
      iconDataUri: null,
    });
  });

  it("names every row and Add relay choice by its adapter, and a relay whose adapter the catalog does not name by the kind it lists", () => {
    const section = presentRelaysSection(true, {
      kind: "read",
      description: { relays: [LOOPBACK, MOQPRO, { ...MOQPRO, relay_id: "red5-1", adapter: "red5" }, { ...MOQPRO, relay_id: "srt-1", adapter: "srt" }], adapters: [LOCAL_ADAPTER, MOQPRO_ADAPTER, CLOUDFLARE_ADAPTER, RED5_ADAPTER] },
    });

    if (section.kind !== "listed") return expect.unreachable(section.kind);
    expect(section.localRelayListenerRows.map((row) => row.adapterNaming)).toEqual([{ words: "Local relay", isTheAdapterKind: false, iconDataUri: "data:image/svg+xml;base64,TE9DQUw=" }]);
    expect(section.hostedRelayRows.map((row) => [row.relay.relay_id, row.adapterNaming.words, row.adapterNaming.isTheAdapterKind, row.adapterNaming.iconDataUri])).toEqual([
      ["moqpro-1", "moq.pro", false, "data:image/svg+xml;base64,TU9RUFJP"],
      ["red5-1", "red5", true, null],
      ["srt-1", "srt", true, null],
    ]);
    expect(section.adapterChoices.map((choice) => choice.adapterNaming.words)).toEqual(["moq.pro", "Cloudflare", "red5"]);
  });
});

describe("a Configure dialog's subject", () => {
  it("is the listed relay and its adapter, and nothing once the relay is no longer listed or its adapter is not in the catalog", () => {
    const section = presentRelaysSection(true, { kind: "read", description: DESCRIBED });

    expect(relaySettingsDialogSubjectOf(section, "local-every-interface")).toEqual({ relay: EVERY_INTERFACE, adapter: LOCAL_ADAPTER });
    expect(relaySettingsDialogSubjectOf(section, "moqpro-1")).toBeNull();
    expect(relaySettingsDialogSubjectOf(section, "cloudflare-9")).toBeNull();
    expect(relaySettingsDialogSubjectOf(presentRelaysSection(false, { kind: "read", description: DESCRIBED }), "local-loopback")).toBeNull();
  });
});

describe("a relay's connection state", () => {
  it("is a word, toned for a problem, with the runtime's reason beside it", () => {
    expect(presentRelayConnectionState({ state: "joined" })).toEqual({ words: "Joined", tone: "ok", why: null });
    expect(presentRelayConnectionState({ state: "joining" })).toEqual({ words: "Joining…", tone: "progress", why: null });
    expect(presentRelayConnectionState({ state: "not_joined", why: null })).toEqual({ words: "Not joined", tone: "warning", why: null });
    expect(presentRelayConnectionState({ state: "not_joined", why: "no local relay runs" })).toEqual({ words: "Not joined", tone: "warning", why: "no local relay runs" });
    expect(presentRelayConnectionState({ state: "lost", why: "refused", rejoining_after_ms: 4000 })).toEqual({ words: "Lost · joining again in 4s", tone: "warning", why: "refused" });
    expect(presentRelayConnectionState({ state: "lost", why: "refused", rejoining_after_ms: 0 })).toEqual({ words: "Lost · joining again now", tone: "warning", why: "refused" });
    expect(presentRelayConnectionState({ state: "newer_than_this_app", spelled_as: "paused" })).toEqual({ words: "paused", tone: "idle", why: null });
  });
});

describe("the runtime's words", () => {
  it("are cut at their backtick code spans, a lone backtick kept as text", () => {
    expect(runtimeWordsSegmentsOf("The relays the project is served at; absent, `https://cdn.moq.dev`.")).toEqual([
      { kind: "text", words: "The relays the project is served at; absent, " },
      { kind: "code", words: "https://cdn.moq.dev" },
      { kind: "text", words: "." },
    ]);
    expect(runtimeWordsSegmentsOf("`local-loopback` and `local-every-interface`")).toEqual([
      { kind: "code", words: "local-loopback" },
      { kind: "text", words: " and " },
      { kind: "code", words: "local-every-interface" },
    ]);
    expect(runtimeWordsSegmentsOf("a lone ` backtick")).toEqual([{ kind: "text", words: "a lone ` backtick" }]);
  });
});
