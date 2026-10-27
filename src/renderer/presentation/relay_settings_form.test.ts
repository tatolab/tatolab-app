import { describe, expect, it } from "vitest";
import type { ListedRelay, RelayAdapter } from "../../shared/tatolab_backend_contract";
import {
  relaySettingLabel,
  relaySettingsDraftWithoutTypedSecrets,
  relaySettingsFormFields,
  presentRelaySettingsForm,
  relaySettingsSendUnavailableBecause,
  relaySettingsToSendToAdd,
  relaySettingsToSendToConfigure,
} from "./relay_settings_form";

const MOQPRO_ADAPTER: RelayAdapter = {
  kind: "moqpro",
  doc: "A moq.pro project.",
  setting_fields: [
    { name: "project_id", description: "The project's id.", is_required: true, is_secret: false, value_kind: { kind: "text" }, accepts_null: false },
    { name: "relay_url", description: "The relays the project is served at.", is_required: false, is_secret: false, value_kind: { kind: "text" }, accepts_null: true },
    { name: "signing_key", description: "The project's signing key.", is_required: true, is_secret: true, value_kind: { kind: "text" }, accepts_null: false },
  ],
};
const LOCAL_ADAPTER: RelayAdapter = {
  kind: "local",
  doc: "The machine's own relay.",
  setting_fields: [
    { name: "port", description: "The port.", is_required: false, is_secret: false, value_kind: { kind: "whole_number", minimum: 0, maximum: 65535 }, accepts_null: true },
  ],
};
const MOQPRO_RELAY: ListedRelay = {
  relay_id: "moqpro-1",
  adapter: "moqpro",
  built_in: false,
  settings: { project_id: "pb1studio" },
  secrets: { signing_key: "set" },
  connection_state: { state: "joined" },
};
const EVERY_INTERFACE: ListedRelay = {
  relay_id: "local-every-interface",
  adapter: "local",
  built_in: true,
  settings: { port: 4445 },
  secrets: {},
  connection_state: { state: "joined" },
};

describe("a relay setting's label", () => {
  it("is its name in words, its initialisms in capitals", () => {
    expect(["project_id", "relay_url", "signing_key", "port", "api_key", "tls_certificate_path", "jwk"].map(relaySettingLabel)).toEqual([
      "Project ID",
      "Relay URL",
      "Signing key",
      "Port",
      "API key",
      "TLS certificate path",
      "JWK",
    ]);
  });
});

describe("the settings form", () => {
  it("draws each setting, required ones first, a secret masked and an optional one offering its default", () => {
    expect(relaySettingsFormFields(MOQPRO_ADAPTER).map((formField) => [formField.name, formField.label, formField.input, formField.isRequired, formField.offersItsDefault])).toEqual([
      ["project_id", "Project ID", "text", true, false],
      ["signing_key", "Signing key", "secret", true, false],
      ["relay_url", "Relay URL", "text", false, true],
    ]);
    expect(relaySettingsFormFields(LOCAL_ADAPTER)[0]?.input).toBe("whole_number");
  });
});

describe("the settings an add sends", () => {
  it("are every setting typed, a number as a number, an empty optional one left out", () => {
    expect(
      relaySettingsToSendToAdd(LOCAL_ADAPTER, { port: { kind: "typed", text: " 14447 " } }),
    ).toEqual({ kind: "ready", settings: { port: 14447 } });
    expect(
      relaySettingsToSendToAdd(MOQPRO_ADAPTER, {
        project_id: { kind: "typed", text: "pb1studio" },
        signing_key: { kind: "typed", text: '{"kty":"OKP"}' },
        relay_url: { kind: "typed", text: "" },
      }),
    ).toEqual({ kind: "ready", settings: { project_id: "pb1studio", signing_key: '{"kty":"OKP"}' } });
  });

  it("wait for each required setting and a whole number within its bounds, naming what is missing", () => {
    expect(relaySettingsToSendToAdd(MOQPRO_ADAPTER, { project_id: { kind: "typed", text: "pb1studio" } })).toEqual({
      kind: "incomplete",
      problems: { signing_key: "Required" },
      firstProblem: "Signing key is required.",
    });
    expect(relaySettingsToSendToAdd(LOCAL_ADAPTER, { port: { kind: "typed", text: "70000" } })).toEqual({
      kind: "incomplete",
      problems: { port: "A whole number from 0 to 65535" },
      firstProblem: "Port must be a whole number from 0 to 65535.",
    });
    expect(relaySettingsToSendToAdd(LOCAL_ADAPTER, { port: { kind: "typed", text: "44.5" } }).kind).toBe("incomplete");
  });
});

describe("the settings a configure sends", () => {
  it("are only the settings changed, a default asked for as null and a secret typed again replacing the one held", () => {
    expect(relaySettingsToSendToConfigure(MOQPRO_ADAPTER, MOQPRO_RELAY, {})).toEqual({ kind: "no_change" });
    expect(relaySettingsToSendToConfigure(MOQPRO_ADAPTER, MOQPRO_RELAY, { project_id: { kind: "typed", text: "pb1studio" } })).toEqual({ kind: "no_change" });
    const relayOnItsOwnRelayUrl: ListedRelay = { ...MOQPRO_RELAY, settings: { ...MOQPRO_RELAY.settings, relay_url: "https://relay.pb1studio.example" } };
    expect(relaySettingsToSendToConfigure(MOQPRO_ADAPTER, MOQPRO_RELAY, { relay_url: { kind: "use_default" } })).toEqual({ kind: "no_change" });
    expect(
      relaySettingsToSendToConfigure(MOQPRO_ADAPTER, relayOnItsOwnRelayUrl, {
        project_id: { kind: "typed", text: "pb2studio" },
        relay_url: { kind: "use_default" },
        signing_key: { kind: "typed", text: "a-new-key" },
      }),
    ).toEqual({ kind: "ready", settings: { project_id: "pb2studio", relay_url: null, signing_key: "a-new-key" } });
  });

  it("keep a held secret whose replacement is left empty, and refuse emptying a required setting", () => {
    expect(relaySettingsToSendToConfigure(MOQPRO_ADAPTER, MOQPRO_RELAY, { signing_key: { kind: "typed", text: "" } })).toEqual({ kind: "no_change" });
    expect(relaySettingsToSendToConfigure(MOQPRO_ADAPTER, MOQPRO_RELAY, { project_id: { kind: "typed", text: " " } })).toEqual({
      kind: "incomplete",
      problems: { project_id: "Required" },
      firstProblem: "Project ID is required.",
    });
  });

  it("move a local listener's port, or return it to its default", () => {
    expect(relaySettingsToSendToConfigure(LOCAL_ADAPTER, EVERY_INTERFACE, { port: { kind: "typed", text: "14447" } })).toEqual({ kind: "ready", settings: { port: 14447 } });
    expect(relaySettingsToSendToConfigure(LOCAL_ADAPTER, EVERY_INTERFACE, { port: { kind: "use_default" } })).toEqual({ kind: "ready", settings: { port: null } });
    expect(relaySettingsToSendToConfigure(LOCAL_ADAPTER, EVERY_INTERFACE, { port: { kind: "typed", text: "4445" } })).toEqual({ kind: "no_change" });
  });
});

describe("an optional setting that takes no null", () => {
  it("cannot be emptied, as the runtime has no default to return it to", () => {
    const labelledAdapter: RelayAdapter = {
      ...MOQPRO_ADAPTER,
      setting_fields: [{ name: "label", description: null, is_required: false, is_secret: false, value_kind: { kind: "text" }, accepts_null: false }],
    };
    const labelledRelay: ListedRelay = { ...MOQPRO_RELAY, settings: { label: "desk" } };

    expect(relaySettingsToSendToConfigure(labelledAdapter, labelledRelay, { label: { kind: "typed", text: "" } })).toEqual({
      kind: "incomplete",
      problems: { label: "Can't be left empty" },
      firstProblem: "Label can't be left empty.",
    });
  });
});

describe("the form's rows", () => {
  it("show a held secret as set with Replace… until it is replaced, the relay's values before an edit, and Use default only off the default", () => {
    const { rows } = presentRelaySettingsForm(MOQPRO_ADAPTER, MOQPRO_RELAY, {}, new Set());

    expect(rows.map((row) => [row.formField.name, row.shownText, row.heldSecretWords, row.showsTheField, row.offersUseDefault])).toEqual([
      ["project_id", "pb1studio", null, true, false],
      ["signing_key", "", "Set", false, false],
      ["relay_url", "", null, true, false],
    ]);
    expect(rows[1]).toMatchObject({ replaceWords: "Replace…", replaceLabel: "Replace Signing key" });
    expect(presentRelaySettingsForm(MOQPRO_ADAPTER, MOQPRO_RELAY, { relay_url: { kind: "typed", text: "https://relay.example" } }, new Set(["signing_key"])).rows.map((row) => [row.formField.name, row.showsTheField, row.offersUseDefault])).toEqual([
      ["project_id", true, false],
      ["signing_key", true, false],
      ["relay_url", true, true],
    ]);
  });

  it("name what is wrong only with a setting the person has typed into", () => {
    const { rows, sendUnavailableBecause } = presentRelaySettingsForm(LOCAL_ADAPTER, null, { port: { kind: "typed", text: "70000" } }, new Set());
    expect(rows[0]?.problem).toBe("A whole number from 0 to 65535");
    expect(sendUnavailableBecause).toBe("Port must be a whole number from 0 to 65535.");
    expect(presentRelaySettingsForm(MOQPRO_ADAPTER, null, {}, new Set()).rows.map((row) => row.problem)).toEqual([null, null, null]);
  });

  it("say which settings are required before anything is typed, an optional one reading Default, and a whole number asking for digits", () => {
    expect(presentRelaySettingsForm(MOQPRO_ADAPTER, null, {}, new Set()).rows.map((row) => [row.formField.name, row.requiredWords, row.placeholder, row.heldSecretWords])).toEqual([
      ["project_id", "Required", null, null],
      ["signing_key", "Required", null, null],
      ["relay_url", null, "Default", null],
    ]);
    expect(presentRelaySettingsForm(LOCAL_ADAPTER, null, {}, new Set()).rows[0]?.inputMode).toBe("numeric");
    expect(presentRelaySettingsForm(MOQPRO_ADAPTER, { ...MOQPRO_RELAY, secrets: { signing_key: "unset" } }, {}, new Set()).rows[1]).toMatchObject({
      heldSecretWords: "Not set",
      replaceWords: "Set…",
      replaceLabel: "Set Signing key",
    });
  });
});

describe("sending a form", () => {
  it("is unavailable naming why, and forgets every secret typed once the runtime answers", () => {
    expect(relaySettingsSendUnavailableBecause({ kind: "no_change" })).toBe("Nothing has changed.");
    expect(relaySettingsSendUnavailableBecause({ kind: "incomplete", problems: {}, firstProblem: "Signing key is required." })).toBe("Signing key is required.");
    expect(relaySettingsSendUnavailableBecause({ kind: "ready", settings: {} })).toBeNull();
    expect(
      relaySettingsDraftWithoutTypedSecrets(MOQPRO_ADAPTER, { project_id: { kind: "typed", text: "desk" }, signing_key: { kind: "typed", text: "typed-in-the-test" } }),
    ).toEqual({ project_id: { kind: "typed", text: "desk" } });
  });
});
