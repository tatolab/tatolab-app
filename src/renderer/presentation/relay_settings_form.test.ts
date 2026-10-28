import { describe, expect, it } from "vitest";
import type { ListedRelay, RelayAdapter, RelaySettingField } from "../../shared/tatolab_backend_contract";
import {
  relaySettingFileUnreadableSentence,
  relaySettingLabel,
  relaySettingValueWords,
  relaySettingsDraftWithoutEnteredSecrets,
  relaySettingsFormFields,
  presentRelaySettingsForm,
  type RelaySettingFormRow,
  relaySettingsSendUnavailableBecause,
  relaySettingsToSendToAdd,
  relaySettingsToSendToConfigure,
} from "./relay_settings_form";

/** A setting as the catalog lists it, neither secret nor required, with no default unless `overrides` gives one. */
function settingField(name: string, fieldType: RelaySettingField["field_type"], overrides: Partial<RelaySettingField> = {}): RelaySettingField {
  return { name, field_type: fieldType, is_secret: false, is_required: false, doc: `The ${name}.`, default_value: null, ...overrides };
}

const MOQPRO_ADAPTER: RelayAdapter = {
  kind: "moqpro",
  display_name: "moq.pro",
  display_icon_data_uri: null,
  doc: "A moq.pro project.",
  setting_fields: [
    settingField("project_id", { type: "string" }, { is_required: true }),
    settingField("signing_key", { type: "file" }, { is_required: true, is_secret: true }),
  ],
};
const CLOUDFLARE_ADAPTER: RelayAdapter = {
  kind: "cloudflare",
  display_name: "Cloudflare",
  display_icon_data_uri: null,
  doc: "A relay Cloudflare provisioned.",
  setting_fields: [settingField("relay_url", { type: "url" }, { is_required: true, is_secret: true })],
};
const LOCAL_ADAPTER: RelayAdapter = {
  kind: "local",
  display_name: "Local relay",
  display_icon_data_uri: null,
  doc: "The machine's own relay.",
  setting_fields: [settingField("port", { type: "number" })],
};
/** An adapter declaring one setting of each field type the catalog serves. */
const EVERY_FIELD_TYPE_ADAPTER: RelayAdapter = {
  kind: "every-field-type",
  display_name: null,
  display_icon_data_uri: null,
  doc: "An adapter of every field type.",
  setting_fields: [
    settingField("api_key", { type: "string" }, { is_secret: true }),
    settingField("fallback_region", { type: "select", options: ["us", "eu"] }),
    settingField("records", { type: "boolean" }, { default_value: false }),
    settingField("region", { type: "select", options: ["us", "eu"] }, { is_required: true }),
    settingField("relay_url", { type: "url" }, { default_value: "https://relay.example" }),
    settingField("tags", { type: "string_list" }, { default_value: [] }),
    settingField("verifies", { type: "boolean" }, { is_required: true }),
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
const EVERY_FIELD_TYPE_RELAY: ListedRelay = {
  relay_id: "every-field-type-1",
  adapter: "every-field-type",
  built_in: false,
  settings: { fallback_region: "eu", records: true, region: "us", tags: ["studio", "desk"], verifies: false },
  secrets: { api_key: "set" },
  connection_state: { state: "joined" },
};

/** Every row of `form`, the required ones first, as the form shows them. */
function allRowsOf(form: { requiredRows: readonly RelaySettingFormRow[]; additionalOptionRows: readonly RelaySettingFormRow[] }) {
  return [...form.requiredRows, ...form.additionalOptionRows];
}

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

describe("a relay setting's value in words", () => {
  it("joins a list by commas and writes a number or true or false as JSON does", () => {
    expect([relaySettingValueWords(["studio", "desk"]), relaySettingValueWords(14447), relaySettingValueWords(true), relaySettingValueWords(null)]).toEqual([
      "studio, desk",
      "14447",
      "true",
      "",
    ]);
  });
});

describe("the settings form", () => {
  it("draws the required settings first, each group in the catalog's order", () => {
    expect(relaySettingsFormFields(EVERY_FIELD_TYPE_ADAPTER).map((formField) => [formField.name, formField.isRequired])).toEqual([
      ["region", true],
      ["verifies", true],
      ["api_key", false],
      ["fallback_region", false],
      ["records", false],
      ["relay_url", false],
      ["tags", false],
    ]);
  });

  it("draws each setting by its declared type, a secret masked whatever its type", () => {
    const controls = Object.fromEntries(allRowsOf(presentRelaySettingsForm(EVERY_FIELD_TYPE_ADAPTER, null, {})).map((row) => [row.formField.name, row.control]));

    expect(controls).toEqual({
      region: {
        control: "menu",
        choices: [
          { choiceKey: "option:us", option: "us", words: "us" },
          { choiceKey: "option:eu", option: "eu", words: "eu" },
        ],
        chosenChoiceKey: "",
        chosenWords: "Choose…",
        isChosenWordsAnOption: false,
      },
      verifies: { control: "switch", isOn: false },
      api_key: { control: "text_field", text: "", isMasked: true, inputMode: "text", placeholder: "Default" },
      fallback_region: {
        control: "menu",
        choices: [
          { choiceKey: "none", option: null, words: "None" },
          { choiceKey: "option:us", option: "us", words: "us" },
          { choiceKey: "option:eu", option: "eu", words: "eu" },
        ],
        chosenChoiceKey: "none",
        chosenWords: "None",
        isChosenWordsAnOption: false,
      },
      records: { control: "switch", isOn: false },
      relay_url: { control: "text_field", text: "https://relay.example", isMasked: false, inputMode: "url", placeholder: "Default" },
      tags: { control: "list_of_text_fields", listedValues: [], isMasked: false, addValueLabel: "Add value to Tags" },
    });
    expect(allRowsOf(presentRelaySettingsForm(LOCAL_ADAPTER, null, {}))[0]?.control).toEqual({
      control: "text_field",
      text: "",
      isMasked: false,
      inputMode: "decimal",
      placeholder: "Default",
    });
    expect(allRowsOf(presentRelaySettingsForm(MOQPRO_ADAPTER, null, {}))[1]?.control).toEqual({
      control: "file_text",
      text: "",
      isMasked: true,
      chosenFileName: null,
      placeholder: "Paste, or choose a file",
      chooseFileLabel: "Choose file… for Signing key",
    });
    expect(allRowsOf(presentRelaySettingsForm(CLOUDFLARE_ADAPTER, null, {}))[0]?.control).toMatchObject({ control: "text_field", isMasked: true, inputMode: "url" });
  });

  it("shows a chosen file by its name, its text the setting's value", () => {
    const form = presentRelaySettingsForm(MOQPRO_ADAPTER, null, { signing_key: { kind: "file_chosen", fileName: "pb1studio.jwk", text: '{"kty":"OKP"}' } });

    expect(allRowsOf(form)[1]?.control).toMatchObject({ control: "file_text", chosenFileName: "pb1studio.jwk", text: '{"kty":"OKP"}' });
  });
});

describe("the settings an add sends", () => {
  it("are every setting entered, a number as a number, a chosen file as its text, an empty optional one left out", () => {
    expect(relaySettingsToSendToAdd(LOCAL_ADAPTER, { port: { kind: "typed", text: " 14447 " } })).toEqual({ kind: "ready", settings: { port: 14447 } });
    expect(
      relaySettingsToSendToAdd(MOQPRO_ADAPTER, {
        project_id: { kind: "typed", text: "pb1studio" },
        signing_key: { kind: "file_chosen", fileName: "pb1studio.jwk", text: '{"kty":"OKP"}\n' },
      }),
    ).toEqual({ kind: "ready", settings: { project_id: "pb1studio", signing_key: '{"kty":"OKP"}\n' } });
    expect(relaySettingsToSendToAdd(MOQPRO_ADAPTER, { project_id: { kind: "typed", text: "pb1studio" }, signing_key: { kind: "typed", text: "eyJrdHkiOiJPS1AifQ" } })).toEqual({
      kind: "ready",
      settings: { project_id: "pb1studio", signing_key: "eyJrdHkiOiJPS1AifQ" },
    });
  });

  it("send a switch as true or false, an option as itself and a list without its empty values", () => {
    expect(
      relaySettingsToSendToAdd(EVERY_FIELD_TYPE_ADAPTER, {
        region: { kind: "chosen", option: "eu" },
        records: { kind: "switched", isOn: true },
        fallback_region: { kind: "chosen", option: null },
        tags: { kind: "listed", values: ["studio", " ", "desk"] },
      }),
    ).toEqual({ kind: "ready", settings: { region: "eu", verifies: false, records: true, tags: ["studio", "desk"] } });
  });

  it("leave an untouched optional setting to the runtime's default, its default shown in its field", () => {
    expect(relaySettingsToSendToAdd(EVERY_FIELD_TYPE_ADAPTER, { region: { kind: "chosen", option: "us" } })).toEqual({ kind: "ready", settings: { region: "us", verifies: false } });
  });

  it("wait for each required setting and a number, naming what is missing", () => {
    expect(relaySettingsToSendToAdd(MOQPRO_ADAPTER, { project_id: { kind: "typed", text: "pb1studio" } })).toEqual({
      kind: "incomplete",
      problems: { signing_key: "Required" },
      firstProblem: "Signing key is required.",
    });
    expect(relaySettingsToSendToAdd(EVERY_FIELD_TYPE_ADAPTER, {})).toEqual({ kind: "incomplete", problems: { region: "Required" }, firstProblem: "Region is required." });
    for (const notANumber of ["44 45", "0x10", "Infinity", "four"]) {
      expect(relaySettingsToSendToAdd(LOCAL_ADAPTER, { port: { kind: "typed", text: notANumber } })).toEqual({
        kind: "incomplete",
        problems: { port: "A number" },
        firstProblem: "Port must be a number.",
      });
    }
  });

  it("send any number as the runtime takes it, leaving its bounds to the runtime to refuse", () => {
    expect(relaySettingsToSendToAdd(LOCAL_ADAPTER, { port: { kind: "typed", text: "70000" } })).toEqual({ kind: "ready", settings: { port: 70000 } });
    expect(relaySettingsToSendToAdd(LOCAL_ADAPTER, { port: { kind: "typed", text: "44.5" } })).toEqual({ kind: "ready", settings: { port: 44.5 } });
  });
});

describe("the settings a configure sends", () => {
  it("are only the settings changed, a default asked for as null and a secret entered replacing the one held", () => {
    expect(relaySettingsToSendToConfigure(MOQPRO_ADAPTER, MOQPRO_RELAY, {})).toEqual({ kind: "no_change" });
    expect(relaySettingsToSendToConfigure(MOQPRO_ADAPTER, MOQPRO_RELAY, { project_id: { kind: "typed", text: "pb1studio" } })).toEqual({ kind: "no_change" });
    expect(
      relaySettingsToSendToConfigure(MOQPRO_ADAPTER, MOQPRO_RELAY, {
        project_id: { kind: "typed", text: "pb2studio" },
        signing_key: { kind: "file_chosen", fileName: "pb2studio.jwk", text: "a-new-key" },
      }),
    ).toEqual({ kind: "ready", settings: { project_id: "pb2studio", signing_key: "a-new-key" } });
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
    expect(relaySettingsToSendToConfigure(LOCAL_ADAPTER, EVERY_INTERFACE, { port: { kind: "typed", text: "" } })).toEqual({ kind: "ready", settings: { port: null } });
  });

  it("return an optional select to its default when None is chosen, and send a switch or a list only when it changed", () => {
    expect(
      relaySettingsToSendToConfigure(EVERY_FIELD_TYPE_ADAPTER, EVERY_FIELD_TYPE_RELAY, {
        fallback_region: { kind: "chosen", option: null },
        records: { kind: "switched", isOn: true },
        tags: { kind: "listed", values: ["studio", "desk"] },
      }),
    ).toEqual({ kind: "ready", settings: { fallback_region: null } });
    expect(
      relaySettingsToSendToConfigure(EVERY_FIELD_TYPE_ADAPTER, EVERY_FIELD_TYPE_RELAY, {
        verifies: { kind: "switched", isOn: true },
        tags: { kind: "listed", values: ["studio"] },
        relay_url: { kind: "typed", text: "https://relay.example" },
      }),
    ).toEqual({ kind: "ready", settings: { verifies: true, tags: ["studio"] } });
  });

  it("ask the runtime for a setting's default only while the relay holds a value for it", () => {
    expect(relaySettingsToSendToConfigure(EVERY_FIELD_TYPE_ADAPTER, EVERY_FIELD_TYPE_RELAY, { relay_url: { kind: "use_default" }, tags: { kind: "use_default" } })).toEqual({
      kind: "ready",
      settings: { tags: null },
    });
  });
});

describe("the form's rows", () => {
  it("say Required under each required setting and offer no placeholder for one", () => {
    const form = presentRelaySettingsForm(MOQPRO_ADAPTER, null, {});

    expect(form.requiredRows.map((row) => [row.formField.name, row.requiredWords])).toEqual([
      ["project_id", "Required"],
      ["signing_key", "Required"],
    ]);
    expect(form.additionalOptionRows).toEqual([]);
  });

  it("show the relay's values before an edit, a secret empty with the runtime's set or not set beside it, and Use default only off the default", () => {
    const rows = allRowsOf(presentRelaySettingsForm(EVERY_FIELD_TYPE_ADAPTER, EVERY_FIELD_TYPE_RELAY, {}));

    expect(rows.map((row) => [row.formField.name, row.heldSecretWords, row.offersUseDefault])).toEqual([
      ["region", null, false],
      ["verifies", null, false],
      ["api_key", "Set", true],
      ["fallback_region", null, true],
      ["records", null, true],
      ["relay_url", null, false],
      ["tags", null, true],
    ]);
    expect(rows.map((row) => row.control)).toMatchObject([
      { chosenWords: "us", isChosenWordsAnOption: true },
      { isOn: false },
      { text: "", isMasked: true },
      { chosenWords: "eu", isChosenWordsAnOption: true },
      { isOn: true },
      { text: "https://relay.example" },
      {
        listedValues: [
          { text: "studio", label: "Tags 1", removeLabel: "Remove Tags 1" },
          { text: "desk", label: "Tags 2", removeLabel: "Remove Tags 2" },
        ],
      },
    ]);
    expect(allRowsOf(presentRelaySettingsForm(MOQPRO_ADAPTER, { ...MOQPRO_RELAY, secrets: { signing_key: "unset" } }, {}))[1]?.heldSecretWords).toBe("Not set");
    expect(allRowsOf(presentRelaySettingsForm(LOCAL_ADAPTER, EVERY_INTERFACE, {}))[0]).toMatchObject({ offersUseDefault: true, useDefaultLabel: "Use the default Port" });
  });

  it("offer no Use default for a setting the relay lists at the catalog's default", () => {
    const relayAtItsDefaults: ListedRelay = { ...EVERY_FIELD_TYPE_RELAY, settings: { ...EVERY_FIELD_TYPE_RELAY.settings, records: false, tags: [], relay_url: "https://relay.example" } };
    const rows = allRowsOf(presentRelaySettingsForm(EVERY_FIELD_TYPE_ADAPTER, relayAtItsDefaults, {}));

    expect(rows.filter((row) => ["records", "tags", "relay_url"].includes(row.formField.name)).map((row) => row.offersUseDefault)).toEqual([false, false, false]);
  });

  it("offer no Use default for an optional secret the runtime holds none of, and send nothing for one", () => {
    const relayHoldingNoApiKey: ListedRelay = { ...EVERY_FIELD_TYPE_RELAY, secrets: { api_key: "unset" } };

    expect(allRowsOf(presentRelaySettingsForm(EVERY_FIELD_TYPE_ADAPTER, relayHoldingNoApiKey, {})).find((row) => row.formField.name === "api_key")).toMatchObject({
      heldSecretWords: "Not set",
      offersUseDefault: false,
    });
    expect(relaySettingsToSendToConfigure(EVERY_FIELD_TYPE_ADAPTER, relayHoldingNoApiKey, { api_key: { kind: "use_default" } })).toEqual({ kind: "no_change" });
  });

  it("show a setting's default once Use default is pressed", () => {
    const rows = allRowsOf(presentRelaySettingsForm(EVERY_FIELD_TYPE_ADAPTER, EVERY_FIELD_TYPE_RELAY, { records: { kind: "use_default" }, tags: { kind: "use_default" } }));

    expect(rows.find((row) => row.formField.name === "records")).toMatchObject({ control: { isOn: false }, offersUseDefault: false });
    expect(rows.find((row) => row.formField.name === "tags")).toMatchObject({ control: { listedValues: [] }, offersUseDefault: false });
  });

  it("name what is wrong only with a setting the person has entered something into, saying Required once", () => {
    const form = presentRelaySettingsForm(LOCAL_ADAPTER, null, { port: { kind: "typed", text: "four" } });
    expect(allRowsOf(form)[0]?.problem).toBe("A number");
    expect(form.sendUnavailableBecause).toBe("Port must be a number.");
    expect(allRowsOf(presentRelaySettingsForm(MOQPRO_ADAPTER, null, {})).map((row) => row.problem)).toEqual([null, null]);
    expect(allRowsOf(presentRelaySettingsForm(MOQPRO_ADAPTER, null, { project_id: { kind: "typed", text: "" } }))[0]).toMatchObject({ requiredWords: null, problem: "Required" });
  });

  it("word the dialog for adding or configuring", () => {
    expect(presentRelaySettingsForm(MOQPRO_ADAPTER, MOQPRO_RELAY, {}).dialogWords).toEqual({
      title: "Configure relay",
      sendWords: "Save",
      sendingWords: "Saving…",
      refusalLead: "The runtime didn't change the relay:",
    });
    expect(presentRelaySettingsForm(MOQPRO_ADAPTER, null, {}).dialogWords.title).toBe("Add relay");
  });
});

describe("a chosen file that could not be read", () => {
  it("is said in the browser's words", () => {
    expect(relaySettingFileUnreadableSentence("NotReadableError: the file was moved")).toBe("The file couldn't be read: NotReadableError: the file was moved");
  });
});

describe("sending a form", () => {
  it("is unavailable naming why, and forgets every secret entered, a chosen file's text with it, once the runtime answers", () => {
    expect(relaySettingsSendUnavailableBecause({ kind: "no_change" })).toBe("Nothing has changed.");
    expect(relaySettingsSendUnavailableBecause({ kind: "incomplete", problems: {}, firstProblem: "Signing key is required." })).toBe("Signing key is required.");
    expect(relaySettingsSendUnavailableBecause({ kind: "ready", settings: {} })).toBeNull();
    expect(
      relaySettingsDraftWithoutEnteredSecrets(MOQPRO_ADAPTER, {
        project_id: { kind: "typed", text: "desk" },
        signing_key: { kind: "file_chosen", fileName: "pb1studio.jwk", text: "typed-in-the-test" },
      }),
    ).toEqual({ project_id: { kind: "typed", text: "desk" } });
  });
});
