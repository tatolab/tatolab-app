import type { ListedRelay, RelayAdapter, RelayConnectionState, RelaysDescription } from "../../shared/tatolab_backend_contract";
import { relaySettingLabel } from "./relay_settings_form";
import type { StatusTone } from "./runtime_presentation";

/** What the window holds of the runtime's relays: nothing yet, what it last answered, or why the last read was refused, beside what was read before it. */
export type RelaysReading =
  | { kind: "not_read" }
  | { kind: "read"; description: RelaysDescription }
  | { kind: "refused"; refusal: string; lastDescription: RelaysDescription | null };

/** A relay's connection state in the window: its word, its tone, and the runtime's reason beside it when it gave one. */
export interface RelayConnectionPresentation {
  words: string;
  tone: StatusTone;
  why: string | null;
}

/** `connectionState` as the window words it. */
export function presentRelayConnectionState(connectionState: RelayConnectionState): RelayConnectionPresentation {
  switch (connectionState.state) {
    case "joined":
      return { words: "Joined", tone: "ok", why: null };
    case "joining":
      return { words: "Joining…", tone: "progress", why: null };
    case "not_joined":
      return { words: "Not joined", tone: "warning", why: connectionState.why };
    case "lost":
      return { words: `Lost · joining again in ${Math.ceil(connectionState.rejoining_after_ms / 1000)}s`, tone: "warning", why: connectionState.why };
    case "newer_than_this_app":
      return { words: connectionState.spelled_as, tone: "idle", why: null };
  }
}

/** The names and words of the local relay's two listeners, by the ids the runtime gives them. */
const LOCAL_RELAY_LISTENER_WORDS: Readonly<Record<string, { label: string; servesWords: string }>> = {
  "local-loopback": { label: "Loopback", servesWords: "Every exposed port, to this machine alone" },
  "local-every-interface": { label: "Every interface", servesWords: "Public ports, to any machine that reaches it" },
};

/** One listener of the local relay, a built-in relay: its name, what it serves, its port and its state. */
export interface LocalRelayListenerRow {
  relay: ListedRelay;
  /** "Loopback" or "Every interface"; a built-in relay this app does not know is named by its id. */
  label: string;
  servesWords: string | null;
  portWords: string;
  connection: RelayConnectionPresentation;
}

/** One relay someone added: its settings, each secret as set or not, and its state. */
export interface HostedRelayRow {
  relay: ListedRelay;
  /** Each setting as "Project ID pb1studio", then each secret as "Signing key set". */
  settingsWords: string[];
  connection: RelayConnectionPresentation;
}

/** An adapter Add relay offers, or offers greyed out with why. */
export interface RelayAdapterChoice {
  adapter: RelayAdapter;
  unavailableBecause: string | null;
}

/** What Settings › Relays shows. */
export type RelaysSectionPresentation =
  | { kind: "runtime_not_running"; words: string }
  | { kind: "reading" }
  | { kind: "not_listed"; refusal: string }
  | {
      kind: "listed";
      localRelayListenerRows: LocalRelayListenerRow[];
      hostedRelayRows: HostedRelayRow[];
      adapterChoices: RelayAdapterChoice[];
      /** Why the latest read was refused while the rows are the read before it. */
      lastReadingRefusal: string | null;
    };

function localRelayListenerRow(relay: ListedRelay): LocalRelayListenerRow {
  const listenerWords = LOCAL_RELAY_LISTENER_WORDS[relay.relay_id];
  const port = relay.settings["port"];
  return {
    relay,
    label: listenerWords?.label ?? relay.relay_id,
    servesWords: listenerWords?.servesWords ?? null,
    portWords: typeof port === "number" ? `Port ${port}` : "Default port",
    connection: presentRelayConnectionState(relay.connection_state),
  };
}

function hostedRelayRow(relay: ListedRelay): HostedRelayRow {
  const settingWords = Object.entries(relay.settings)
    .filter(([, settingValue]) => settingValue !== null)
    .map(([settingName, settingValue]) => `${relaySettingLabel(settingName)} ${String(settingValue)}`);
  const secretWords = Object.entries(relay.secrets).map(([secretName, presence]) => `${relaySettingLabel(secretName)} ${presence === "set" ? "set" : "not set"}`);
  return { relay, settingsWords: [...settingWords, ...secretWords], connection: presentRelayConnectionState(relay.connection_state) };
}

/** Why the form cannot add a relay of `adapter`: a setting whose type it cannot draw; `null` when it can. */
function whyAnAdapterCannotBeAdded(adapter: RelayAdapter): string | null {
  const notDrawable = adapter.setting_fields.find((settingField) => settingField.value_kind.kind === "not_drawable");
  if (notDrawable === undefined || notDrawable.value_kind.kind !== "not_drawable") return null;
  return `Tatolab can't show the setting ${notDrawable.name} (${notDrawable.value_kind.schema_type_words}) in a form yet.`;
}

/**
 * Settings › Relays while the runtime runs: the local relay's listeners, which are the built-in relays, then every relay
 * someone added, and the adapters Add relay offers — every one that backs no built-in relay.
 */
export function presentRelaysSection(isTheRuntimeRunning: boolean, reading: RelaysReading): RelaysSectionPresentation {
  if (!isTheRuntimeRunning) return { kind: "runtime_not_running", words: "Relays show here while the runtime runs." };
  if (reading.kind === "not_read") return { kind: "reading" };
  const description = reading.kind === "read" ? reading.description : reading.lastDescription;
  if (description === null) return { kind: "not_listed", refusal: reading.kind === "refused" ? reading.refusal : "" };
  const adaptersBackingABuiltInRelay = new Set(description.relays.filter((relay) => relay.built_in).map((relay) => relay.adapter));
  return {
    kind: "listed",
    localRelayListenerRows: description.relays.filter((relay) => relay.built_in).map(localRelayListenerRow),
    hostedRelayRows: description.relays.filter((relay) => !relay.built_in).map(hostedRelayRow),
    adapterChoices: description.adapters
      .filter((adapter) => !adaptersBackingABuiltInRelay.has(adapter.kind))
      .map((adapter) => ({ adapter, unavailableBecause: whyAnAdapterCannotBeAdded(adapter) })),
    lastReadingRefusal: reading.kind === "refused" ? reading.refusal : null,
  };
}
