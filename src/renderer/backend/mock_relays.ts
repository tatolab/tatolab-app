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

/** Each adapter's logo as `GET /api/relay-adapters` serves it, copied from the recorded answer of a v0.55.5 runtime. */
const MOCK_RELAY_ADAPTER_DISPLAY_ICON_DATA_URIS = {
  local:
    "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDI0IDEwMjQiPgogIDxkZWZzPgogICAgPGxpbmVhckdyYWRpZW50IGlkPSJ0YXRvbGFiLWFwcC1pY29uLWJvZHkiIHgxPSIwIiB5MT0iMCIgeDI9IjAiIHkyPSIxIj4KICAgICAgPHN0b3Agb2Zmc2V0PSIwIiBzdG9wLWNvbG9yPSIjNGQ3YmZmIi8+CiAgICAgIDxzdG9wIG9mZnNldD0iMC41NSIgc3RvcC1jb2xvcj0iIzJhNWJmZiIvPgogICAgICA8c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiMxYzNmZDYiLz4KICAgIDwvbGluZWFyR3JhZGllbnQ+CiAgICA8cmFkaWFsR3JhZGllbnQgaWQ9InRhdG9sYWItYXBwLWljb24tc2hlZW4iIGN4PSIwLjMiIGN5PSIwLjA4IiByPSIwLjg1Ij4KICAgICAgPHN0b3Agb2Zmc2V0PSIwIiBzdG9wLWNvbG9yPSIjZmZmZmZmIiBzdG9wLW9wYWNpdHk9IjAuMjIiLz4KICAgICAgPHN0b3Agb2Zmc2V0PSIwLjYiIHN0b3AtY29sb3I9IiNmZmZmZmYiIHN0b3Atb3BhY2l0eT0iMCIvPgogICAgPC9yYWRpYWxHcmFkaWVudD4KICAgIDxsaW5lYXJHcmFkaWVudCBpZD0idGF0b2xhYi1hcHAtaWNvbi1yaW0iIHgxPSIwIiB5MT0iMCIgeDI9IjAiIHkyPSIxIj4KICAgICAgPHN0b3Agb2Zmc2V0PSIwIiBzdG9wLWNvbG9yPSIjZmZmZmZmIiBzdG9wLW9wYWNpdHk9IjAuMzgiLz4KICAgICAgPHN0b3Agb2Zmc2V0PSIwLjMiIHN0b3AtY29sb3I9IiNmZmZmZmYiIHN0b3Atb3BhY2l0eT0iMC4wNiIvPgogICAgICA8c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiMwMDBhNDAiIHN0b3Atb3BhY2l0eT0iMC4xOCIvPgogICAgPC9saW5lYXJHcmFkaWVudD4KICAgIDxsaW5lYXJHcmFkaWVudCBpZD0idGF0b2xhYi1hcHAtaWNvbi1sZXR0ZXIiIHgxPSIwIiB5MT0iMCIgeDI9IjAiIHkyPSIxIj4KICAgICAgPHN0b3Agb2Zmc2V0PSIwIiBzdG9wLWNvbG9yPSIjZmZmZmZmIi8+CiAgICAgIDxzdG9wIG9mZnNldD0iMSIgc3RvcC1jb2xvcj0iI2U2ZWNmZiIvPgogICAgPC9saW5lYXJHcmFkaWVudD4KICAgIDxmaWx0ZXIgaWQ9InRhdG9sYWItYXBwLWljb24tZHJvcC1zaGFkb3ciIHg9Ii0yMCUiIHk9Ii0yMCUiIHdpZHRoPSIxNDAlIiBoZWlnaHQ9IjE0NSUiPgogICAgICA8ZmVEcm9wU2hhZG93IGR4PSIwIiBkeT0iMTIiIHN0ZERldmlhdGlvbj0iMTQiIGZsb29kLWNvbG9yPSIjMGExNDQwIiBmbG9vZC1vcGFjaXR5PSIwLjMyIi8+CiAgICA8L2ZpbHRlcj4KICAgIDxmaWx0ZXIgaWQ9InRhdG9sYWItYXBwLWljb24tbGV0dGVyLXNoYWRvdyIgeD0iLTMwJSIgeT0iLTMwJSIgd2lkdGg9IjE2MCUiIGhlaWdodD0iMTcwJSI+CiAgICAgIDxmZURyb3BTaGFkb3cgZHg9IjAiIGR5PSIxMCIgc3RkRGV2aWF0aW9uPSIxMiIgZmxvb2QtY29sb3I9IiMwYjFkOGEiIGZsb29kLW9wYWNpdHk9IjAuMzUiLz4KICAgIDwvZmlsdGVyPgogIDwvZGVmcz4KICA8ZyBmaWx0ZXI9InVybCgjdGF0b2xhYi1hcHAtaWNvbi1kcm9wLXNoYWRvdykiPgogICAgPHJlY3QgeD0iMTAwIiB5PSIxMDAiIHdpZHRoPSI4MjQiIGhlaWdodD0iODI0IiByeD0iMTg1IiBmaWxsPSJ1cmwoI3RhdG9sYWItYXBwLWljb24tYm9keSkiLz4KICA8L2c+CiAgPHJlY3QgeD0iMTAwIiB5PSIxMDAiIHdpZHRoPSI4MjQiIGhlaWdodD0iODI0IiByeD0iMTg1IiBmaWxsPSJ1cmwoI3RhdG9sYWItYXBwLWljb24tc2hlZW4pIi8+CiAgPHJlY3QgeD0iMTAyIiB5PSIxMDIiIHdpZHRoPSI4MjAiIGhlaWdodD0iODIwIiByeD0iMTgzIiBmaWxsPSJub25lIiBzdHJva2U9InVybCgjdGF0b2xhYi1hcHAtaWNvbi1yaW0pIiBzdHJva2Utd2lkdGg9IjQiLz4KICA8cGF0aCBkPSJNMzQzIDM4NGgzMzhNNTEyIDM4NHYzMDAiIGZpbGw9Im5vbmUiIHN0cm9rZT0idXJsKCN0YXRvbGFiLWFwcC1pY29uLWxldHRlcikiIHN0cm9rZS13aWR0aD0iOTIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgZmlsdGVyPSJ1cmwoI3RhdG9sYWItYXBwLWljb24tbGV0dGVyLXNoYWRvdykiLz4KPC9zdmc+Cg==",
  cloudflare:
    "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MiIgaGVpZ2h0PSI4MiIgZmlsbD0ibm9uZSIgdmlld0JveD0iLTggLTI2IDgyIDgyIj48ZyBjbGlwLXBhdGg9InVybCgjY2xpcDBfNzQ2XzIpIj48cGF0aCBmaWxsPSIjZmY5OTEwIiBkPSJNNTMuMTIgMTMuMTI1YzYuOTk3IDAgMTIuNjY4IDUuNzA4IDEyLjY2OCAxMi43NSAwIDEuMjU1LS4xOCAyLjQ2OC0uNTE2IDMuNjE0YS43Mi43MiAwIDAgMS0uNjk0LjUxMUg0Ni45NTNhLjM3NS4zNzUgMCAwIDEtLjM0OC0uNTFsLjMzNy0uODgyYzEuMDc2LTIuODMzIDQuMTQ2LTUuMTU0IDYuOTg3LTUuMjlsNS4zODQtLjI3N2EuNTQzLjU0MyAwIDAgMCAuNTE0LS41NDQuNTQzLjU0MyAwIDAgMC0uNTEtLjU0NGwtNS4wNTYtLjI5OWMtMi43MTgtLjE0LTQuMDQ2LTIuNTYtMy4zMTUtNS4wODFsLjg0Mi0yLjkwMmEuNzIuNzIgMCAwIDEgLjY0Ni0uNTI3cS4zNC0uMDIuNjg2LS4wMTkiLz48cGF0aCBmaWxsPSIjZmY1ZjA4IiBkPSJNMzUuNjA5IDBjNy4yOTUgMCAxMy40MjQgNS4wMjUgMTUuMTU3IDExLjgyNC4wNzMuMjg1LjA1LjU4Ni0uMDU0Ljg2MmwtMS4zODggMy42NzdjLTEuMDc2IDIuODMzLTMuODQyIDUuMjktNi45NyA1LjI5bC0yNC4xMDUuMjc4YS41MzMuNTMzIDAgMCAwLS41MjUuNTM1YzAgLjI5My4yMzQuNTMxLjUyNC41MzVsMjMuNzY1LjMxNmMyLjcyNCAwIDQuMDQ2IDIuNTYgMy4zMTYgNS4wODFsLS4zMDcgMS4wNjFhLjc1Ljc1IDAgMCAxLS43MTYuNTQxSC45NjRhLjcxLjcxIDAgMCAxLS43MTgtLjY0NiAxMSAxMSAwIDAgMS0uMDM0LS44NTRjMC01LjQ3NiA0LjE2Ni05Ljk3MyA5LjQ4Mi0xMC40NTZhNy4yIDcuMiAwIDAgMS0uMTY3LTEuNTQ0YzAtMy45MzUgMy4xNy03LjEyNSA3LjA4LTcuMTI1IDEuNTU1IDAgMi45OTQuNTA2IDQuMTYyIDEuMzYyQzIyLjg0OSA0LjQ5NyAyOC43MDcgMCAzNS42MDkgMCIvPjxwYXRoIGZpbGw9IiNmZjk5MTAiIGQ9Ik01My4xMiAxMy4xMjVjNi45OTcgMCAxMi42NjggNS43MDggMTIuNjY4IDEyLjc1IDAgMS4yNTUtLjE4IDIuNDY4LS41MTYgMy42MTRhLjcyLjcyIDAgMCAxLS42OTQuNTExSDQ2Ljk1M2EuMzc1LjM3NSAwIDAgMS0uMzQ4LS41MWwuMzM3LS44ODJjMS4wNzYtMi44MzMgNC4xNDYtNS4xNTQgNi45ODctNS4yOWw1LjM4NC0uMjc3YS41NDMuNTQzIDAgMCAwIC41MTQtLjU0NC41NDMuNTQzIDAgMCAwLS41MS0uNTQ0bC01LjA1Ni0uMjk5Yy0yLjcxOC0uMTQtNC4wNDYtMi41Ni0zLjMxNS01LjA4MWwuODQyLTIuOTAyYS43Mi43MiAwIDAgMSAuNjQ2LS41MjdxLjM0LS4wMi42ODYtLjAxOSIvPjxwYXRoIGZpbGw9IiNmZjVmMDgiIGQ9Ik0zNS42MDkgMGM3LjI5NSAwIDEzLjQyNCA1LjAyNSAxNS4xNTcgMTEuODI0LjA3My4yODUuMDUuNTg2LS4wNTQuODYybC0xLjM4OCAzLjY3N2MtMS4wNzYgMi44MzMtMy44NDIgNS4yOS02Ljk3IDUuMjlsLTI0LjEwNS4yNzhhLjUzMy41MzMgMCAwIDAtLjUyNS41MzVjMCAuMjkzLjIzNC41MzEuNTI0LjUzNWwyMy43NjUuMzE2YzIuNzI0IDAgNC4wNDYgMi41NiAzLjMxNiA1LjA4MWwtLjMwNyAxLjA2MWEuNzUuNzUgMCAwIDEtLjcxNi41NDFILjk2NGEuNzEuNzEgMCAwIDEtLjcxOC0uNjQ2IDExIDExIDAgMCAxLS4wMzQtLjg1NGMwLTUuNDc2IDQuMTY2LTkuOTczIDkuNDgyLTEwLjQ1NmE3LjIgNy4yIDAgMCAxLS4xNjctMS41NDRjMC0zLjkzNSAzLjE3LTcuMTI1IDcuMDgtNy4xMjUgMS41NTUgMCAyLjk5NC41MDYgNC4xNjIgMS4zNjJDMjIuODQ5IDQuNDk3IDI4LjcwNyAwIDM1LjYwOSAwIi8+PC9nPjxkZWZzPjxjbGlwUGF0aCBpZD0iY2xpcDBfNzQ2XzIiPjxwYXRoIGZpbGw9IiNmZmYiIGQ9Ik0wIDBoNjZ2MzBIMHoiLz48L2NsaXBQYXRoPjwvZGVmcz48L3N2Zz4=",
  moqpro:
    "data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBzdGFuZGFsb25lPSJubyI/Pgo8IURPQ1RZUEUgc3ZnIFBVQkxJQyAiLS8vVzNDLy9EVEQgU1ZHIDIwMDEwOTA0Ly9FTiIKICJodHRwOi8vd3d3LnczLm9yZy9UUi8yMDAxL1JFQy1TVkctMjAwMTA5MDQvRFREL3N2ZzEwLmR0ZCI+CjxzdmcgdmVyc2lvbj0iMS4wIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciCiB3aWR0aD0iNDIwLjAwMDAwMHB0IiBoZWlnaHQ9IjQyMC4wMDAwMDBwdCIgdmlld0JveD0iLTUxIC01MSA1MjIgNTIyIgogcHJlc2VydmVBc3BlY3RSYXRpbz0ieE1pZFlNaWQgbWVldCI+CjxyZWN0IHg9IjAiIHk9IjAiIHdpZHRoPSI0MjAiIGhlaWdodD0iNDIwIiByeD0iOTAiIGZpbGw9IiMwZjE3MmEiLz4KPGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMC4wMDAwMDAsNDIwLjAwMDAwMCkgc2NhbGUoMC4xMDAwMDAsLTAuMTAwMDAwKSIKZmlsbD0iI2ZhZmFmYSIgc3Ryb2tlPSJub25lIj4KPHBhdGggZD0iTTEwNTEgMzY2OCBjLTU3IC0zOCAtNzYgLTk0IC0xNDEgLTQwNCAtMzMgLTE1OSAtNzkgLTM3MiAtMTAxIC00NzQKLTIyIC0xMDIgLTY5IC0zMjIgLTEwNCAtNDkwIC0xMDkgLTUyMSAtMTYzIC03NjkgLTIwMCAtOTMwIC02NCAtMjc3IC05NiAtNDQzCi0xMDIgLTUzMiBsLTYgLTg3IDMxIC0zMSBjMjUgLTI0IDM3IC0zMCA1NCAtMjUgNTcgMTcgMTExIDEwMyAxNjMgMjU4IDg3IDI2MAo1MzUgMjEwMyA1MzUgMjIwMCAwIDQ3IDI1IDEwIDkwIC0xMzYgMTY1IC0zNjggMjQ5IC01MTcgMzM4IC01OTggOTggLTg5IDk5Ci05MCA0NzEgLTYwIDEzMCAxMCAyNjYgMTggMzAyIDE4IDExMSAtMSAxNDEgMjAgMjY3IDE4OCAxMTYgMTU0IDE4MiAyNjEgMjY0CjQyNSA2MyAxMjYgNTcgMTE0IDYzIDEwOCAzIC0zIDIzIC0xMjAgNDUgLTI1OSA1NiAtMzY2IDg1IC01MzcgMTcwIC05ODkgMTYKLTkxIDQ2IC0yNTkgNjYgLTM3NSA1OCAtMzQ5IDg3IC00NDcgMjA4IC03MDUgbDgxIC0xNzQgNiA1NCBjNCAzMCAxNyAxMTggMzAKMTk1IDE4IDEwOSAyMiAxNzggMjIgMzEwIC0xIDIxMSAtMTIgMjg4IC0xNDggMTAxMCAtMTkgOTkgLTU1IDI5OSAtODAgNDQ1Ci04MiA0NjkgLTEyMiA2MzkgLTE5MiA4MTUgLTQ2IDExNSAtNzYgMTU5IC0xMjEgMTgxIC00NSAyMSAtNzkgMTEgLTEwNyAtMzMKLTExIC0xOCAtMzIgLTM3IC00NyAtNDQgLTQyIC0xNyAtMTAzIC05MCAtMTQxIC0xNjYgLTc0IC0xNDYgLTIzMCAtNTAzIC0yNjQKLTYwMyAtMjAgLTU4IC0zOSAtMTA4IC00MiAtMTEyIC00IC00IC0zNSAtMyAtNzAgMyAtOTQgMTcgLTI4NCAtMiAtNDU2IC00NQotNzYgLTIwIC0xNDAgLTM0IC0xNDAgLTMzIC0yMyAzNiAtMTYzIDMxNiAtMjM5IDQ3NyAtMTE2IDI0NyAtMjA0IDQxNSAtMjUxCjQ4MSAtMTggMjUgLTM1IDU1IC0zOSA2NSAtMyAxMSAtMjIgMzUgLTQxIDU0IC00NyA0NSAtMTIzIDU0IC0xNzQgMTh6Ii8+CjwvZz4KPGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMC4wMDAwMDAsNDIwLjAwMDAwMCkgc2NhbGUoMC4xMDAwMDAsLTAuMTAwMDAwKSIKZmlsbD0iIzRjYzMxNSIgc3Ryb2tlPSJub25lIj4KPHBhdGggZD0iTTIzMDYgMjA3MCBjLTM5IC0xMiAtNzMgLTQ2IC0xMDEgLTEwMSAtNTAgLTk4IC00MSAtMTczIDI5IC0yNDMgNTMKLTUzIDk1IC02MyAxNzAgLTQyIDE0NSA0MyAxOTEgMjI4IDgzIDMzNCAtNTYgNTQgLTExNiA3MSAtMTgxIDUyeiIvPgo8cGF0aCBkPSJNMTcxNSAyMDM1IGMtOTIgLTMzIC0xNDcgLTEzNCAtMTI0IC0yMjkgMzIgLTEzNyAxOTUgLTE4MiAyOTUgLTgyCjY2IDY2IDcxIDE2NSAxMyAyNDUgLTUxIDcxIC0xMTIgOTMgLTE4NCA2NnoiLz4KPC9nPgo8L3N2Zz4K",
} as const;

/** The catalog a streamlib release serves, its names, logos, docs and settings as `GET /api/relay-adapters` gives them. */
const MOCK_RELAY_ADAPTERS: readonly RelayAdapter[] = [
  {
    kind: "local",
    display_name: "Local relay",
    display_icon_data_uri: MOCK_RELAY_ADAPTER_DISPLAY_ICON_DATA_URIS.local,
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
    display_name: "Cloudflare",
    display_icon_data_uri: MOCK_RELAY_ADAPTER_DISPLAY_ICON_DATA_URIS.cloudflare,
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
    display_name: "moq.pro",
    display_icon_data_uri: MOCK_RELAY_ADAPTER_DISPLAY_ICON_DATA_URIS.moqpro,
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
  /** The catalog of a runtime older than adapter names and logos, which serves neither. */
  doesTheCatalogServeNoNamesOrLogos: boolean;
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
      const adapters = sources.doesTheCatalogServeNoNamesOrLogos
        ? MOCK_RELAY_ADAPTERS.map((adapter) => ({ ...adapter, display_name: null, display_icon_data_uri: null }))
        : [...MOCK_RELAY_ADAPTERS];
      return structuredClone({ relays, adapters });
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
