import type { ListedRelay, RelayAdapter, RelaySettingsByName, RelaysDescription } from "../../shared/tatolab_backend_contract";

/**
 * The relays the mock runtime holds as the page opens, picked with `?relays=`: the local relay's two listeners with a
 * joined Cloudflare relay and a moq.pro one it lost (the default), or the two listeners alone (`local`).
 */
export type MockRelaysScenario = "hosted" | "local";

/** What `?relays=` names. */
export function mockRelaysScenarioNamed(relaysInTheQuery: string | null): MockRelaysScenario {
  return relaysInTheQuery === "local" ? "local" : "hosted";
}

const MOCK_RELAY_CALL_MILLISECONDS = 30;
/** How long the mock takes to answer an add or a configure, which the runtime answers once the adapter has taken the settings. */
const MOCK_RELAY_CHANGE_MILLISECONDS = 600;
/** How long an added or configured relay stays joining before it reads joined. */
const MOCK_RELAY_JOIN_MILLISECONDS = 1800;

/** The default port of each local listener, as the local adapter's schema says. */
const LOCAL_LISTENER_DEFAULT_PORTS: Readonly<Record<string, number>> = { "local-loopback": 4443, "local-every-interface": 4445 };

/** The catalog a streamlib release serves, its docs and settings as `GET /api/relay-adapters` gives them. */
const MOCK_RELAY_ADAPTERS: readonly RelayAdapter[] = [
  {
    kind: "local",
    doc: "The machine's own relay, built in: `local-loopback` serves every exposed port to this machine alone, `local-every-interface` serves public ports to any machine that reaches it. Where each listens is never a setting.",
    setting_fields: [
      {
        name: "port",
        description: "The port the listener takes for QUIC and HTTP alike; absent, the listener's own default (4443 at loopback, 4445 at every interface).",
        is_required: false,
        is_secret: false,
        value_kind: { kind: "whole_number", minimum: 0, maximum: 65535 },
        accepts_null: true,
      },
    ],
  },
  {
    kind: "cloudflare",
    doc: "A relay Cloudflare provisioned, dialed at its publish-and-subscribe URL, which carries its token and is kept whole as a secret. Serves public ports, at the relay's top level.",
    setting_fields: [
      {
        name: "relay_url",
        description:
          "The relay's publish-and-subscribe URL as Cloudflare returns it, `https://draft-16.cloudflare.mediaoverquic.com/<token>`; its token rides the path, so the whole URL is a secret.",
        is_required: true,
        is_secret: true,
        value_kind: { kind: "text" },
        accepts_null: false,
      },
    ],
  },
  {
    kind: "moqpro",
    doc: "A moq.pro project, dialed at its path on moq.pro's relays with a token signed by the project's key, which is kept as a secret. Serves public ports, under the project.",
    setting_fields: [
      {
        name: "project_id",
        description: "The project's id as moq.pro names it: the root every token is minted under and the path the relay is dialed at.",
        is_required: true,
        is_secret: false,
        value_kind: { kind: "text" },
        accepts_null: false,
      },
      {
        name: "relay_url",
        description: "The relays the project is served at; absent, `https://cdn.moq.dev`.",
        is_required: false,
        is_secret: false,
        value_kind: { kind: "text" },
        accepts_null: true,
      },
      {
        name: "signing_key",
        description: "The project's signing key, the JWK moq.pro gave for it, as JSON or base64url JSON. It mints read and write for every broadcast of the project.",
        is_required: true,
        is_secret: true,
        value_kind: { kind: "text" },
        accepts_null: false,
      },
    ],
  },
];

function mockBuiltInRelays(): ListedRelay[] {
  return Object.entries(LOCAL_LISTENER_DEFAULT_PORTS).map(([relayId, port]) => ({
    relay_id: relayId,
    adapter: "local",
    built_in: true,
    settings: { port },
    secrets: {},
    connection_state: { state: "joined" },
  }));
}

function mockHostedRelays(): ListedRelay[] {
  return [
    { relay_id: "cloudflare-1", adapter: "cloudflare", built_in: false, settings: {}, secrets: { relay_url: "set" }, connection_state: { state: "joined" } },
    {
      relay_id: "moqpro-1",
      adapter: "moqpro",
      built_in: false,
      settings: { project_id: "pb1studio" },
      secrets: { signing_key: "set" },
      connection_state: { state: "lost", why: "the relay closed the session: unauthorized", rejoining_after_ms: 4000 },
    },
  ];
}

/** The mock runtime's relays, behind the four relay calls of the backend. */
export interface MockRelays {
  describeRelays(): Promise<RelaysDescription>;
  addRelay(adapter: string, settings: Readonly<RelaySettingsByName>): Promise<string>;
  configureRelay(relayId: string, settings: Readonly<RelaySettingsByName>): Promise<void>;
  removeRelay(relayId: string): Promise<void>;
}

/** What the mock relays are built from: what the page asks, and whether the mock runtime answers now and its words when it does not. */
export interface MockRelaysSources {
  scenario: MockRelaysScenario;
  /** `?relay_add=refused`: every add is refused as one that could not be joined. */
  isEveryAddRefused: boolean;
  isTheRuntimeRunning: () => boolean;
  noRuntimeAnswersRefusal: () => string;
}

const sleep = (milliseconds: number) => new Promise<void>((settle) => window.setTimeout(settle, milliseconds));

/**
 * Relays kept as the runtime keeps them: an add takes the lowest free `<kind>-<n>`, a secret is held only as `set` and
 * never kept, a change reads joining and then joined, and each refusal is worded as the runtime words it.
 */
export function createMockRelays(sources: MockRelaysSources): MockRelays {
  const relays: ListedRelay[] = [...mockBuiltInRelays(), ...(sources.scenario === "hosted" ? mockHostedRelays() : [])];

  const refuseUnlessTheRuntimeRuns = () => {
    if (!sources.isTheRuntimeRunning()) throw sources.noRuntimeAnswersRefusal();
  };
  const relayNamed = (relayId: string): ListedRelay => {
    const relay = relays.find((listedRelay) => listedRelay.relay_id === relayId);
    if (relay === undefined) throw `no relay is named \`${relayId}\`; the relays are ${relays.map((listedRelay) => listedRelay.relay_id).join(", ")}`;
    return relay;
  };
  const joinAfterAMoment = (relay: ListedRelay) => {
    relay.connection_state = { state: "joining" };
    window.setTimeout(() => {
      if (relays.includes(relay)) relay.connection_state = { state: "joined" };
    }, MOCK_RELAY_JOIN_MILLISECONDS);
  };
  /** `settings` laid onto `relay` as the runtime takes them: a secret held as `set` and its value dropped, `null` a setting's default. */
  const takeTheSettings = (relay: ListedRelay, adapter: RelayAdapter, settings: Readonly<RelaySettingsByName>) => {
    const settingNames = adapter.setting_fields.map((settingField) => settingField.name);
    const unknownSettingName = Object.keys(settings).find((settingName) => !settingNames.includes(settingName));
    if (unknownSettingName !== undefined) {
      const expected = settingNames.length === 1 ? `\`${settingNames[0]}\`` : `one of ${settingNames.map((settingName) => `\`${settingName}\``).join(", ")}`;
      throw `the settings of the relay \`${relay.relay_id}\` are refused: unknown field \`${unknownSettingName}\`, expected ${expected}`;
    }
    const projectId = settings["project_id"];
    if (adapter.kind === "moqpro" && typeof projectId === "string" && (projectId === "" || projectId.includes("/"))) {
      throw `the settings of the relay \`${relay.relay_id}\` are refused: \`project_id\` \`${projectId}\` is not a moq.pro project id: one path segment, non-empty, with no \`/\``;
    }
    for (const settingField of adapter.setting_fields) {
      const settingValue = settings[settingField.name];
      if (settingValue === undefined) continue;
      if (settingField.is_secret) {
        relay.secrets = { ...relay.secrets, [settingField.name]: settingValue === null ? "unset" : "set" };
      } else if (settingValue === null) {
        const settingsLeft = { ...relay.settings };
        delete settingsLeft[settingField.name];
        const defaultPort = LOCAL_LISTENER_DEFAULT_PORTS[relay.relay_id];
        relay.settings = settingField.name === "port" && defaultPort !== undefined ? { ...settingsLeft, port: defaultPort } : settingsLeft;
      } else {
        relay.settings = { ...relay.settings, [settingField.name]: settingValue };
      }
    }
  };

  return {
    describeRelays: async () => {
      await sleep(MOCK_RELAY_CALL_MILLISECONDS);
      refuseUnlessTheRuntimeRuns();
      return structuredClone({ relays, adapters: [...MOCK_RELAY_ADAPTERS] });
    },
    addRelay: async (adapterKind, settings) => {
      await sleep(MOCK_RELAY_CHANGE_MILLISECONDS);
      refuseUnlessTheRuntimeRuns();
      const adapter = MOCK_RELAY_ADAPTERS.find((catalogAdapter) => catalogAdapter.kind === adapterKind);
      if (adapter === undefined) {
        throw `no relay adapter is named \`${adapterKind}\`; the adapters are ${MOCK_RELAY_ADAPTERS.map((catalogAdapter) => catalogAdapter.kind).join(", ")}`;
      }
      if (adapter.kind === "local") {
        throw "no `local` relay is added: the local relay is built in: its listeners `local-loopback` and `local-every-interface` are on every machine, and where a listener binds is never a setting";
      }
      let instanceNumber = 1;
      while (relays.some((listedRelay) => listedRelay.relay_id === `${adapter.kind}-${instanceNumber}`)) instanceNumber += 1;
      const relayId = `${adapter.kind}-${instanceNumber}`;
      if (sources.isEveryAddRefused) throw `the relay \`${relayId}\` could not be joined: the relay answered 401 Unauthorized`;
      const secretNames = adapter.setting_fields.filter((settingField) => settingField.is_secret).map((settingField) => settingField.name);
      const relay: ListedRelay = {
        relay_id: relayId,
        adapter: adapter.kind,
        built_in: false,
        settings: {},
        secrets: Object.fromEntries(secretNames.map((secretName) => [secretName, "unset" as const])),
        connection_state: { state: "joining" },
      };
      const missingSettingName = adapter.setting_fields.find((settingField) => settingField.is_required && (settings[settingField.name] ?? null) === null)?.name;
      if (missingSettingName !== undefined) throw `the settings of the relay \`${relayId}\` are refused: missing field \`${missingSettingName}\``;
      takeTheSettings(relay, adapter, settings);
      relays.push(relay);
      joinAfterAMoment(relay);
      return relayId;
    },
    configureRelay: async (relayId, settings) => {
      await sleep(MOCK_RELAY_CHANGE_MILLISECONDS);
      refuseUnlessTheRuntimeRuns();
      const relay = relayNamed(relayId);
      const adapter = MOCK_RELAY_ADAPTERS.find((catalogAdapter) => catalogAdapter.kind === relay.adapter);
      if (adapter === undefined) throw `no relay adapter is named \`${relay.adapter}\``;
      const relayWithTheNewSettings = structuredClone(relay);
      takeTheSettings(relayWithTheNewSettings, adapter, settings);
      Object.assign(relay, relayWithTheNewSettings);
      joinAfterAMoment(relay);
    },
    removeRelay: async (relayId) => {
      await sleep(MOCK_RELAY_CALL_MILLISECONDS);
      refuseUnlessTheRuntimeRuns();
      const relay = relayNamed(relayId);
      if (relay.built_in) throw `the relay \`${relayId}\` is built in and is never removed`;
      relays.splice(relays.indexOf(relay), 1);
    },
  };
}
