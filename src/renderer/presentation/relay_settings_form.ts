import type { ListedRelay, RelayAdapter, RelaySettingField, RelaySettingsByName } from "../../shared/tatolab_backend_contract";

/** Words that read in capitals inside a setting's name. */
const INITIALISMS_IN_A_SETTING_NAME = new Set(["api", "id", "jwk", "jwt", "tls", "uri", "url", "http", "https", "quic"]);

/** A setting's name as the form labels it: `relay_url` as "Relay URL". */
export function relaySettingLabel(settingName: string): string {
  return settingName
    .split("_")
    .filter((word) => word !== "")
    .map((word, wordIndex) => {
      if (INITIALISMS_IN_A_SETTING_NAME.has(word)) return word.toUpperCase();
      return wordIndex === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word;
    })
    .join(" ");
}

/** How the form takes one setting: a line of text, a whole number, or a secret, masked and never filled in. */
export type RelaySettingInput = "text" | "whole_number" | "secret";

/** One setting as the add and configure forms draw it. */
export interface RelaySettingFormField {
  name: string;
  label: string;
  description: string | null;
  input: RelaySettingInput;
  isRequired: boolean;
  /** An optional setting `null` returns to its default, which "Use default" asks for. */
  offersItsDefault: boolean;
  settingField: RelaySettingField;
}

/** `adapter`'s settings as its forms draw them, the required ones first, each group in the schema's order. */
export function relaySettingsFormFields(adapter: RelayAdapter): RelaySettingFormField[] {
  const formFields = adapter.setting_fields.map(
    (settingField): RelaySettingFormField => ({
      name: settingField.name,
      label: relaySettingLabel(settingField.name),
      description: settingField.description,
      input: settingField.is_secret ? "secret" : settingField.value_kind.kind === "whole_number" ? "whole_number" : "text",
      isRequired: settingField.is_required,
      offersItsDefault: !settingField.is_required && settingField.accepts_null,
      settingField,
    }),
  );
  return [...formFields.filter((formField) => formField.isRequired), ...formFields.filter((formField) => !formField.isRequired)];
}

/** What the person did to one setting in a form: typed into it, or asked for its default. A setting they left alone is absent. */
export type RelaySettingEdit = { kind: "typed"; text: string } | { kind: "use_default" };

/** Every setting the person changed in a form, by name. */
export type RelaySettingsDraft = Readonly<Record<string, RelaySettingEdit>>;

/** What a form would send: the settings, nothing because nothing changed, or why it cannot yet, each setting's problem by name. */
export type RelaySettingsToSend =
  | { kind: "ready"; settings: RelaySettingsByName }
  | { kind: "no_change" }
  | { kind: "incomplete"; problems: Record<string, string>; firstProblem: string };

/** What `text` typed into `formField` sends, or the problem with it; empty text sends nothing. */
function typedSettingValue(formField: RelaySettingFormField, text: string): { kind: "value"; value: string | number } | { kind: "empty" } | { kind: "problem"; problem: string; sentence: string } {
  const valueKind = formField.settingField.value_kind;
  const trimmedText = valueKind.kind === "whole_number" ? text.trim() : text;
  if (trimmedText.trim() === "") return { kind: "empty" };
  if (valueKind.kind !== "whole_number") return { kind: "value", value: trimmedText };
  const wholeNumber = /^-?\d+$/.test(trimmedText) ? Number(trimmedText) : Number.NaN;
  const isWithinItsBounds =
    Number.isSafeInteger(wholeNumber) && (valueKind.minimum === null || wholeNumber >= valueKind.minimum) && (valueKind.maximum === null || wholeNumber <= valueKind.maximum);
  if (isWithinItsBounds) return { kind: "value", value: wholeNumber };
  const bounds =
    valueKind.minimum !== null && valueKind.maximum !== null
      ? ` from ${valueKind.minimum} to ${valueKind.maximum}`
      : valueKind.minimum !== null
        ? ` from ${valueKind.minimum}`
        : valueKind.maximum !== null
          ? ` up to ${valueKind.maximum}`
          : "";
  return { kind: "problem", problem: `A whole number${bounds}`, sentence: `${formField.label} must be a whole number${bounds}.` };
}

const REQUIRED_PROBLEM = "Required";

function settingsToSendFrom(settings: RelaySettingsByName, problems: { name: string; problem: string; sentence: string }[], ifNothingIsSent: RelaySettingsToSend): RelaySettingsToSend {
  const [firstProblem] = problems;
  if (firstProblem !== undefined) {
    return { kind: "incomplete", problems: Object.fromEntries(problems.map(({ name, problem }) => [name, problem])), firstProblem: firstProblem.sentence };
  }
  return Object.keys(settings).length === 0 ? ifNothingIsSent : { kind: "ready", settings };
}

/** The settings adding a relay of `adapter` sends from `draft`: every setting typed, an empty optional one left out. */
export function relaySettingsToSendToAdd(adapter: RelayAdapter, draft: RelaySettingsDraft): RelaySettingsToSend {
  const settings: RelaySettingsByName = {};
  const problems: { name: string; problem: string; sentence: string }[] = [];
  for (const formField of relaySettingsFormFields(adapter)) {
    const edit = draft[formField.name];
    const typed = edit?.kind === "typed" ? typedSettingValue(formField, edit.text) : { kind: "empty" as const };
    if (typed.kind === "value") settings[formField.name] = typed.value;
    else if (typed.kind === "problem") problems.push({ name: formField.name, problem: typed.problem, sentence: typed.sentence });
    else if (formField.isRequired) problems.push({ name: formField.name, problem: REQUIRED_PROBLEM, sentence: `${formField.label} is required.` });
  }
  return settingsToSendFrom(settings, problems, { kind: "ready", settings });
}

/** A non-secret setting's value as its field shows it, or empty while the relay lists none for it. */
export function relaySettingShownText(relay: ListedRelay, settingName: string): string {
  const settingValue = relay.settings[settingName];
  return settingValue === undefined || settingValue === null ? "" : String(settingValue);
}

/**
 * The settings configuring `relay` sends from `draft`: only those changed, `null` for one returned to its default and a
 * secret typed again replacing the one held; a secret whose replacement is left empty keeps the one held.
 */
export function relaySettingsToSendToConfigure(adapter: RelayAdapter, relay: ListedRelay, draft: RelaySettingsDraft): RelaySettingsToSend {
  const settings: RelaySettingsByName = {};
  const problems: { name: string; problem: string; sentence: string }[] = [];
  for (const formField of relaySettingsFormFields(adapter)) {
    const edit = draft[formField.name];
    if (edit === undefined) continue;
    if (edit.kind === "use_default") {
      if (relay.settings[formField.name] !== undefined || formField.input === "secret") settings[formField.name] = null;
      continue;
    }
    const typed = typedSettingValue(formField, edit.text);
    if (typed.kind === "problem") {
      problems.push({ name: formField.name, problem: typed.problem, sentence: typed.sentence });
    } else if (typed.kind === "value") {
      if (formField.input === "secret" || String(typed.value) !== relaySettingShownText(relay, formField.name)) settings[formField.name] = typed.value;
    } else if (formField.input !== "secret" && relaySettingShownText(relay, formField.name) !== "") {
      if (formField.isRequired) problems.push({ name: formField.name, problem: REQUIRED_PROBLEM, sentence: `${formField.label} is required.` });
      else settings[formField.name] = null;
    }
  }
  return settingsToSendFrom(settings, problems, { kind: "no_change" });
}
