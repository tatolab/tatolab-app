// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { type Exposure, type RelaySpec, relays } from "@/data/mock"

export const labRelay: RelaySpec = {
  id: "edge-lab",
  provider: "custom",
  name: "edge-lab",
  url: "https://moq.edge-lab.internal:4443",
  region: "Self-hosted · rack 2",
  status: "error",
  latencyMs: 0,
  subscribers: 0,
  egressMbps: 0,
  tracks: 0,
  joinedBy: ["dock-box"],
  credential: "key",
  note: "TLS handshake failed: certificate expired 2 days ago.",
}

export const allRelays: RelaySpec[] = [...relays, labRelay]

export const relayLookup = (id: string) => allRelays.find((r) => r.id === id)

export interface RelaySetup {
  id: string
  name: string
  description: string
  relays: string[]
  machines: string[]
  exposure: Exposure
  isDefault?: boolean
}

export const relaySetups: RelaySetup[] = [
  {
    id: "studio",
    name: "Studio",
    description: "Public broadcasts from the studio and the lobby.",
    relays: ["cloudflare", "local"],
    machines: ["studio-mac", "lobby-tv"],
    exposure: "public",
  },
  {
    id: "warehouse-ops",
    name: "Warehouse ops",
    description: "Dock cameras for the ops team only.",
    relays: ["moqpro"],
    machines: ["dock-box"],
    exposure: "public",
  },
  {
    id: "private-crew",
    name: "Private crew",
    description: "Machine to machine, nothing in between.",
    relays: ["iroh"],
    machines: ["garage-jetson"],
    exposure: "private",
  },
  {
    id: "local-only",
    name: "Local only",
    description: "Every new machine starts here.",
    relays: ["local"],
    machines: ["render-pod"],
    exposure: "private",
    isDefault: true,
  },
]

export const credentialSecrets: Record<string, { label: string; value: string }> = {
  cloudflare: { label: "API token", value: "cf_tok_8Xq2mN7pLr4vW9sK" },
  moqpro: { label: "Publish key", value: "mp_live_4f2k9q8x7c" },
  red5: { label: "API key", value: "r5_k_7y3m2n8b4v" },
  iroh: { label: "Node secret", value: "iroh_sk_5x7kq2z9w3" },
  "edge-lab": { label: "JWT signing key", value: "lab_jwt_9c8x7z6y5" },
}
