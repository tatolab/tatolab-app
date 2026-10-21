// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import type { DataKind, Exposure } from "@/data/mock";
import {
  adapterByKind,
  type RelayAdapter,
  type RelayInstance,
  todayRelays,
  todayStreams,
  type TodayStream,
} from "../../data";

export const builtInListenerWords: Record<
  string,
  { name: string; reaches: string; defaultPort: number }
> = {
  "local-loopback": {
    name: "Loopback listener",
    reaches: "This machine",
    defaultPort: 4443,
  },
  "local-every-interface": {
    name: "Network listener",
    reaches: "Other machines on your network",
    defaultPort: 4445,
  },
};

export function relayDisplayName(relay: RelayInstance) {
  return (
    builtInListenerWords[relay.relayId]?.name ??
    adapterByKind(relay.adapter).name
  );
}

export const addableAdapters = () => [
  adapterByKind("cloudflare"),
  adapterByKind("moqpro"),
];

export function nextRelayId(
  kind: RelayAdapter["kind"],
  relays: RelayInstance[] = todayRelays,
) {
  const taken = relays.filter((r) => r.adapter === kind).length;
  return `${kind}-${taken + 1}`;
}

/** The default a setting falls back to when it is `null`, as text. */
export function settingDefault(relay: RelayInstance, name: string) {
  if (name === "port")
    return String(builtInListenerWords[relay.relayId]?.defaultPort ?? "");
  return adapterByKind(relay.adapter).settings.find((s) => s.name === name)
    ?.defaultValue;
}

export function hostOf(url: string) {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

/** The non-secret settings, one phrase each, defaults marked. */
export function settingsSummary(
  relay: RelayInstance,
): { text: string; isDefault: boolean }[] {
  const adapter = adapterByKind(relay.adapter);
  return adapter.settings
    .filter((s) => !s.secret)
    .map((s) => {
      const value = relay.settings[s.name];
      if (value === null || value === undefined) {
        const fallback = settingDefault(relay, s.name);
        if (!fallback) return null;
        return {
          text:
            s.name === "relay_url" ? hostOf(fallback) : `${s.name} ${fallback}`,
          isDefault: true,
        };
      }
      if (s.name === "relay_url")
        return { text: hostOf(String(value)), isDefault: false };
      if (s.name === "project_id")
        return { text: `project ${value}`, isDefault: false };
      return { text: `${s.name} ${value}`, isDefault: false };
    })
    .filter((x): x is { text: string; isDefault: boolean } => x !== null);
}

export interface PublishedOutput {
  stream: TodayStream;
  nodeId: string;
  nodeLabel: string;
  port: string;
  kind: DataKind;
  exposure: Exposure;
}

export function outputsAt(exposure: Exposure): PublishedOutput[] {
  return todayStreams.flatMap((stream) =>
    stream.nodes.flatMap((node) =>
      node.ports
        .filter((p) => p.direction === "out" && p.exposure === exposure)
        .map((p) => ({
          stream,
          nodeId: node.id,
          nodeLabel: node.label,
          port: p.name,
          kind: p.kind,
          exposure,
        })),
    ),
  );
}

/** How many loaded outputs a relay carries: public ports reach every relay, private ones the loopback listener only. */
export function carriedBy(relay: RelayInstance) {
  const loaded = (o: PublishedOutput) => o.stream.loaded;
  const publicCount = outputsAt("public").filter(loaded).length;
  const privateCount = relay.serves.includes("private")
    ? outputsAt("private").filter(loaded).length
    : 0;
  return { publicCount, privateCount };
}

export function settingsFileJson(
  adapter: RelayAdapter,
  values: Record<string, string>,
) {
  const body: Record<string, string> = {};
  for (const s of adapter.settings) {
    const v = values[s.name]?.trim();
    if (s.secret) body[s.name] = "<secret>";
    else if (v) body[s.name] = v;
  }
  return JSON.stringify(body, null, 2);
}

function shellWord(value: string) {
  return /^[\w@%+=:,./-]+$/.test(value)
    ? value
    : `'${value.replace(/'/g, `'\\''`)}'`;
}

/** `tatolab relay set`, naming only what changed; a secret is read from stdin. */
export function relaySetCommand(
  relayId: string,
  changed: Record<string, string | null>,
  replacedSecrets: string[],
) {
  const parts = ["tatolab relay set", relayId];
  for (const [k, v] of Object.entries(changed))
    parts.push(`${k}=${v === null ? "null" : shellWord(v)}`);
  for (const s of replacedSecrets) parts.push(`--secret ${s} --from-stdin`);
  return parts.join(" ");
}
