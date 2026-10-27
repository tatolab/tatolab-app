import type { ListedRelay, RelayAdapter, RelayConnectionState, RelaysDescription } from "../../shared/tatolab_backend_contract";
import { relaySettingLabel } from "./relay_settings_form";
import type { StatusTone } from "./runtime_presentation";

/** What the window holds of the runtime's relays: nothing yet, what it last answered, or why the last read was refused, beside what was read before it. */
export type RelaysReading =
  | { kind: "not_read" }
  | { kind: "read"; description: RelaysDescription }
  | { kind: "refused"; refusal: string; lastDescription: RelaysDescription | null };

/** The latest relays `reading` holds, those read before a refused read included; `null` before any. */
export function relaysDescriptionOfTheReading(reading: RelaysReading): RelaysDescription | null {
  if (reading.kind === "read") return reading.description;
  return reading.kind === "refused" ? reading.lastDescription : null;
}

/** A relay's connection state in the window: its word, its tone, and the runtime's reason for it when it gave one. */
export interface RelayConnectionPresentation {
  words: string;
  tone: StatusTone;
  /** The runtime's own words for why the relay is not joined, or lost. */
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
    case "lost": {
      const rejoiningInSeconds = Math.ceil(connectionState.rejoining_after_ms / 1000);
      return { words: rejoiningInSeconds > 0 ? `Lost · joining again in ${rejoiningInSeconds}s` : "Lost · joining again now", tone: "warning", why: connectionState.why };
    }
    case "newer_than_this_app":
      return { words: connectionState.spelled_as, tone: "idle", why: null };
  }
}

/** The names and words of the local relay's two listeners, by the ids the runtime gives them. */
const LOCAL_RELAY_LISTENER_WORDS: Readonly<Record<string, { label: string; servesWords: string }>> = {
  "local-loopback": { label: "Loopback", servesWords: "Every exposed port, to this machine alone" },
  "local-every-interface": { label: "Every interface", servesWords: "Public ports, to any machine that reaches it" },
};

/** What every relay's row shows, a listener's and an added relay's alike. */
interface RelayRow {
  relay: ListedRelay;
  /** Its adapter in the runtime's catalog, whose settings Configure draws; `null` when the catalog names none. */
  adapter: RelayAdapter | null;
  connection: RelayConnectionPresentation;
  /** Configure…'s accessible name, naming the relay. */
  configureLabel: string;
  configureUnavailableBecause: string | null;
}

/** One listener of the local relay, a built-in relay: its name, what it serves and its port. */
export interface LocalRelayListenerRow extends RelayRow {
  /** "Loopback" or "Every interface"; a built-in relay this app does not know is named by its id. */
  label: string;
  servesWords: string | null;
  portWords: string;
}

/** One relay someone added: its settings and each secret as set or not. */
export interface HostedRelayRow extends RelayRow {
  /** Each setting as "Project ID pb1studio", then each secret as "Signing key set". */
  settingsWords: string[];
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
      /** What the added relays' group says while it holds none. */
      noAddedRelayWords: string;
      /** Why the latest read was refused while the rows are the read before it. */
      lastReadingRefusal: string | null;
    };

/** Why the form cannot draw `adapter`'s settings: one whose type it cannot draw; `null` when it can. */
export function whyTheFormCannotDrawTheAdaptersSettings(adapter: RelayAdapter): string | null {
  for (const settingField of adapter.setting_fields) {
    if (settingField.value_kind.kind === "not_drawable") {
      return `Tatolab can't show the setting ${settingField.name} (${settingField.value_kind.schema_type_words}) in a form yet.`;
    }
  }
  return null;
}

function relayRow(relay: ListedRelay, adapters: readonly RelayAdapter[], shownName: string): RelayRow {
  const adapter = adapters.find((catalogAdapter) => catalogAdapter.kind === relay.adapter) ?? null;
  return {
    relay,
    adapter,
    connection: presentRelayConnectionState(relay.connection_state),
    configureLabel: `Configure ${shownName}`,
    configureUnavailableBecause: adapter === null ? `The runtime's catalog names no adapter ${relay.adapter}.` : whyTheFormCannotDrawTheAdaptersSettings(adapter),
  };
}

function localRelayListenerRow(relay: ListedRelay, adapters: readonly RelayAdapter[]): LocalRelayListenerRow {
  const listenerWords = LOCAL_RELAY_LISTENER_WORDS[relay.relay_id];
  const label = listenerWords?.label ?? relay.relay_id;
  const port = relay.settings["port"];
  return {
    ...relayRow(relay, adapters, label),
    label,
    servesWords: listenerWords?.servesWords ?? null,
    portWords: typeof port === "number" ? `Port ${port}` : "Default port",
  };
}

function hostedRelayRow(relay: ListedRelay, adapters: readonly RelayAdapter[]): HostedRelayRow {
  const settingWords = Object.entries(relay.settings)
    .filter(([, settingValue]) => settingValue !== null)
    .map(([settingName, settingValue]) => `${relaySettingLabel(settingName)} ${String(settingValue)}`);
  const secretWords = Object.entries(relay.secrets).map(([secretName, presence]) => `${relaySettingLabel(secretName)} ${presence === "set" ? "set" : "not set"}`);
  return { ...relayRow(relay, adapters, relay.relay_id), settingsWords: [...settingWords, ...secretWords] };
}

/**
 * Settings › Relays while the runtime runs: the local relay's listeners, which are the built-in relays, then every relay
 * someone added, and the adapters Add relay offers — every one that backs no built-in relay.
 */
export function presentRelaysSection(isTheRuntimeRunning: boolean, reading: RelaysReading): RelaysSectionPresentation {
  if (!isTheRuntimeRunning) return { kind: "runtime_not_running", words: "Relays show here while the runtime runs." };
  if (reading.kind === "not_read") return { kind: "reading" };
  const description = relaysDescriptionOfTheReading(reading);
  if (description === null) return { kind: "not_listed", refusal: reading.kind === "refused" ? reading.refusal : "" };
  const adaptersBackingABuiltInRelay = new Set(description.relays.filter((relay) => relay.built_in).map((relay) => relay.adapter));
  const adapterChoices = description.adapters
    .filter((adapter) => !adaptersBackingABuiltInRelay.has(adapter.kind))
    .map((adapter) => ({ adapter, unavailableBecause: whyTheFormCannotDrawTheAdaptersSettings(adapter) }));
  return {
    kind: "listed",
    localRelayListenerRows: description.relays.filter((relay) => relay.built_in).map((relay) => localRelayListenerRow(relay, description.adapters)),
    hostedRelayRows: description.relays.filter((relay) => !relay.built_in).map((relay) => hostedRelayRow(relay, description.adapters)),
    adapterChoices,
    noAddedRelayWords:
      adapterChoices.length === 0
        ? "The runtime offers no relay adapter to add one through."
        : "Add one with + to serve public outputs beyond this machine's own network.",
    lastReadingRefusal: reading.kind === "refused" ? reading.refusal : null,
  };
}

/** What Remove relay… asks before the runtime forgets `relayId`, and what answering yes does. */
export function presentRelayRemovalConfirmation(relayId: string): { title: string; explanation: string } {
  return { title: `Remove ${relayId}?`, explanation: "The runtime leaves this relay and forgets it and its secrets. Public outputs stop reaching it." };
}

/** One stretch of the runtime's words: plain text, or a code span it wrote between backticks. */
export type RuntimeWordsSegment = { kind: "text" | "code"; words: string };

/** The runtime's `words` cut at its backtick code spans, so a code span is typeset as code; a lone backtick stays text. */
export function runtimeWordsSegmentsOf(words: string): RuntimeWordsSegment[] {
  const segments: RuntimeWordsSegment[] = [];
  let remaining = words;
  for (;;) {
    const opening = remaining.indexOf("`");
    const closing = opening === -1 ? -1 : remaining.indexOf("`", opening + 1);
    if (closing === -1) break;
    if (opening > 0) segments.push({ kind: "text", words: remaining.slice(0, opening) });
    segments.push({ kind: "code", words: remaining.slice(opening + 1, closing) });
    remaining = remaining.slice(closing + 1);
  }
  if (remaining !== "") segments.push({ kind: "text", words: remaining });
  return segments;
}
