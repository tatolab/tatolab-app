import type { ListedRelay, RelayAdapter, RelaySettingField, RelaySettingFieldType, RelaySettingsByName, RelaySettingValue } from "../../shared/tatolab_backend_contract";

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

/** A setting's value in words: a list of text joined by commas, a number or true or false as JSON writes it, nothing for `null`. */
export function relaySettingValueWords(settingValue: RelaySettingValue): string {
  if (settingValue === null) return "";
  if (typeof settingValue === "object") return settingValue.join(", ");
  return String(settingValue);
}

/** One setting as the add and configure forms draw it. */
export interface RelaySettingFormField {
  name: string;
  label: string;
  /** What the catalog says of it; `null` when it says nothing. */
  doc: string | null;
  fieldType: RelaySettingFieldType;
  isRequired: boolean;
  isSecret: boolean;
  settingField: RelaySettingField;
}

/** `adapter`'s settings as its forms draw them, the required ones first, each group in the catalog's order. */
export function relaySettingsFormFields(adapter: RelayAdapter): RelaySettingFormField[] {
  const formFields = adapter.setting_fields.map(
    (settingField): RelaySettingFormField => ({
      name: settingField.name,
      label: relaySettingLabel(settingField.name),
      doc: settingField.doc === "" ? null : settingField.doc,
      fieldType: settingField.field_type,
      isRequired: settingField.is_required,
      isSecret: settingField.is_secret,
      settingField,
    }),
  );
  return [...formFields.filter((formField) => formField.isRequired), ...formFields.filter((formField) => !formField.isRequired)];
}

/**
 * What the person did to one setting in a form: typed or pasted into it, chose a file whose text it takes, switched it,
 * chose one of its options or none, listed its values, or asked for its default. A setting they left alone is absent.
 */
export type RelaySettingEdit =
  | { kind: "typed"; text: string }
  | { kind: "file_chosen"; fileName: string; text: string }
  | { kind: "switched"; isOn: boolean }
  | { kind: "chosen"; option: string | null }
  | { kind: "listed"; values: readonly string[] }
  | { kind: "use_default" };

/** Every setting the person changed in a form, by name. */
export type RelaySettingsDraft = Readonly<Record<string, RelaySettingEdit>>;

/** What a form would send: the settings, nothing because nothing changed, or why it cannot yet, each setting's problem by name. */
export type RelaySettingsToSend =
  | { kind: "ready"; settings: RelaySettingsByName }
  | { kind: "no_change" }
  | { kind: "incomplete"; problems: Record<string, string>; firstProblem: string };

/** A number as JSON writes one, which the runtime takes as a number, not as text. */
const A_NUMBER_AS_JSON_WRITES_IT = /^-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/;

type EditedSettingValue = { kind: "value"; value: Exclude<RelaySettingValue, null> } | { kind: "empty" } | { kind: "problem"; problem: string; sentence: string };

/** What `edit` of `formField` sends, or the problem with it; empty text, no option and no listed value send nothing. */
function editedSettingValue(formField: RelaySettingFormField, edit: Exclude<RelaySettingEdit, { kind: "use_default" }>): EditedSettingValue {
  switch (edit.kind) {
    case "typed":
    case "file_chosen": {
      if (edit.text.trim() === "") return { kind: "empty" };
      if (formField.fieldType.type !== "number") return { kind: "value", value: edit.text };
      const typedNumber = edit.text.trim();
      if (A_NUMBER_AS_JSON_WRITES_IT.test(typedNumber) && Number.isFinite(Number(typedNumber))) return { kind: "value", value: Number(typedNumber) };
      return { kind: "problem", problem: "A number", sentence: `${formField.label} must be a number.` };
    }
    case "switched":
      return { kind: "value", value: edit.isOn };
    case "chosen":
      return edit.option === null ? { kind: "empty" } : { kind: "value", value: edit.option };
    case "listed": {
      const listedValues = edit.values.filter((listedValue) => listedValue.trim() !== "");
      return listedValues.length === 0 ? { kind: "empty" } : { kind: "value", value: listedValues };
    }
  }
}

/** The value `relay` holds for a non-secret setting, as `list_relays` lists it; `null` while it lists none. */
function listedSettingValue(relay: ListedRelay, settingName: string): RelaySettingValue {
  return relay.settings[settingName] ?? null;
}

/** What a setting holds before any edit: the relay's value, or the catalog's default while the relay lists none; nothing for a secret, whose value the runtime never lists. */
function settingValueBeforeAnEdit(formField: RelaySettingFormField, relay: ListedRelay | null): RelaySettingValue {
  if (relay !== null && formField.isSecret) return null;
  const listedValue = relay === null ? null : listedSettingValue(relay, formField.name);
  return listedValue ?? formField.settingField.default_value;
}

function isTheSameSettingValue(settingValue: RelaySettingValue, otherSettingValue: RelaySettingValue): boolean {
  return JSON.stringify(settingValue) === JSON.stringify(otherSettingValue);
}

const REQUIRED_PROBLEM = "Required";

type SettingProblem = { name: string; problem: string; sentence: string };

function requiredProblemOf(formField: RelaySettingFormField): SettingProblem {
  return { name: formField.name, problem: REQUIRED_PROBLEM, sentence: `${formField.label} is required.` };
}

function settingsToSendFrom(settings: RelaySettingsByName, problems: readonly SettingProblem[], ifNothingIsSent: RelaySettingsToSend): RelaySettingsToSend {
  const [firstProblem] = problems;
  if (firstProblem !== undefined) {
    return { kind: "incomplete", problems: Object.fromEntries(problems.map(({ name, problem }) => [name, problem])), firstProblem: firstProblem.sentence };
  }
  return Object.keys(settings).length === 0 ? ifNothingIsSent : { kind: "ready", settings };
}

/**
 * The settings adding a relay of `adapter` sends from `draft`: every setting edited, an untouched optional one left to the
 * runtime's default, and an untouched required switch as off, as it is drawn.
 */
export function relaySettingsToSendToAdd(adapter: RelayAdapter, draft: RelaySettingsDraft): RelaySettingsToSend {
  const settings: RelaySettingsByName = {};
  const problems: SettingProblem[] = [];
  for (const formField of relaySettingsFormFields(adapter)) {
    const edit = draft[formField.name];
    if (edit === undefined || edit.kind === "use_default") {
      if (formField.isRequired && formField.fieldType.type === "boolean") settings[formField.name] = false;
      else if (formField.isRequired) problems.push(requiredProblemOf(formField));
      continue;
    }
    const edited = editedSettingValue(formField, edit);
    if (edited.kind === "value") settings[formField.name] = edited.value;
    else if (edited.kind === "problem") problems.push({ name: formField.name, problem: edited.problem, sentence: edited.sentence });
    else if (formField.isRequired) problems.push(requiredProblemOf(formField));
  }
  return settingsToSendFrom(settings, problems, { kind: "ready", settings });
}

/**
 * The settings configuring `relay` sends from `draft`: only those changed, `null` for one returned to its default and a
 * secret entered replacing the one held; a secret left empty keeps the one held, as the runtime never lists its value.
 */
export function relaySettingsToSendToConfigure(adapter: RelayAdapter, relay: ListedRelay, draft: RelaySettingsDraft): RelaySettingsToSend {
  const settings: RelaySettingsByName = {};
  const problems: SettingProblem[] = [];
  for (const formField of relaySettingsFormFields(adapter)) {
    const edit = draft[formField.name];
    if (edit === undefined) continue;
    const relayHoldsAValue = listedSettingValue(relay, formField.name) !== null || relay.secrets[formField.name] !== undefined;
    if (edit.kind === "use_default") {
      if (relayHoldsAValue) settings[formField.name] = null;
      continue;
    }
    const edited = editedSettingValue(formField, edit);
    if (edited.kind === "problem") {
      problems.push({ name: formField.name, problem: edited.problem, sentence: edited.sentence });
    } else if (edited.kind === "value") {
      if (formField.isSecret || !isTheSameSettingValue(edited.value, settingValueBeforeAnEdit(formField, relay))) settings[formField.name] = edited.value;
    } else if (!formField.isSecret && listedSettingValue(relay, formField.name) !== null) {
      if (formField.isRequired) problems.push(requiredProblemOf(formField));
      else settings[formField.name] = null;
    }
  }
  return settingsToSendFrom(settings, problems, { kind: "no_change" });
}

/** Why a form cannot send yet, as the disabled Add relay or Save says it; `null` when it can. */
export function relaySettingsSendUnavailableBecause(settingsToSend: RelaySettingsToSend): string | null {
  switch (settingsToSend.kind) {
    case "ready":
      return null;
    case "no_change":
      return "Nothing has changed.";
    case "incomplete":
      return settingsToSend.firstProblem;
  }
}

/** `draft` with every secret entered into it forgotten, a chosen file's text with it, as a form leaves it once the runtime has answered. */
export function relaySettingsDraftWithoutTypedSecrets(adapter: RelayAdapter, draft: RelaySettingsDraft): RelaySettingsDraft {
  const secretNames = new Set(adapter.setting_fields.filter((settingField) => settingField.is_secret).map((settingField) => settingField.name));
  return Object.fromEntries(Object.entries(draft).filter(([settingName]) => !secretNames.has(settingName)));
}

/** One option of a `select` setting's menu, or the "None" the form offers for an optional one. */
export interface RelaySettingMenuChoice {
  /** Unique among the menu's choices, so "None" never collides with an option. */
  choiceKey: string;
  option: string | null;
  words: string;
}

/** The menu key of `option`, `null` for "None". */
function menuChoiceKeyOf(option: string | null): string {
  return option === null ? "none" : `option:${option}`;
}

/**
 * The control a setting's row draws, by its field type, with what it shows now: a text field, masked for a secret; a
 * file's text, picked or pasted; a switch; a menu of its options; or a field for each of its listed values.
 */
export type RelaySettingControl =
  | { control: "text_field"; text: string; isMasked: boolean; inputMode: "text" | "decimal" | "url"; placeholder: string | null }
  | { control: "file_text"; text: string; isMasked: boolean; chosenFileName: string | null; placeholder: string | null }
  | { control: "switch"; isOn: boolean }
  | { control: "menu"; choices: RelaySettingMenuChoice[]; chosenChoiceKey: string; chosenWords: string }
  | { control: "list_of_text_fields"; values: readonly string[]; isMasked: boolean };

/** What `formField`'s control shows: `edit`, or what the setting holds before one, its default after Use default. */
function relaySettingControlOf(formField: RelaySettingFormField, edit: RelaySettingEdit | undefined, valueBeforeAnEdit: RelaySettingValue): RelaySettingControl {
  const shownValue = edit?.kind === "use_default" ? formField.settingField.default_value : valueBeforeAnEdit;
  const placeholder = formField.isRequired ? null : "Default";
  const fieldType = formField.fieldType;
  switch (fieldType.type) {
    case "string":
    case "url":
    case "number":
      return {
        control: "text_field",
        text: edit?.kind === "typed" ? edit.text : relaySettingValueWords(shownValue),
        isMasked: formField.isSecret,
        inputMode: fieldType.type === "number" ? "decimal" : fieldType.type === "url" ? "url" : "text",
        placeholder,
      };
    case "file":
      return {
        control: "file_text",
        text: edit?.kind === "typed" || edit?.kind === "file_chosen" ? edit.text : relaySettingValueWords(shownValue),
        isMasked: formField.isSecret,
        chosenFileName: edit?.kind === "file_chosen" ? edit.fileName : null,
        placeholder,
      };
    case "boolean":
      return { control: "switch", isOn: edit?.kind === "switched" ? edit.isOn : shownValue === true };
    case "select": {
      const chosenOption = edit?.kind === "chosen" ? edit.option : typeof shownValue === "string" ? shownValue : null;
      const optionChoices = fieldType.options.map((option): RelaySettingMenuChoice => ({ choiceKey: menuChoiceKeyOf(option), option, words: option }));
      const choices = formField.isRequired ? optionChoices : [{ choiceKey: menuChoiceKeyOf(null), option: null, words: "None" }, ...optionChoices];
      return {
        control: "menu",
        choices,
        chosenChoiceKey: chosenOption === null && formField.isRequired ? "" : menuChoiceKeyOf(chosenOption),
        chosenWords: chosenOption ?? (formField.isRequired ? "Choose…" : "None"),
      };
    }
    case "string_list":
      return {
        control: "list_of_text_fields",
        values: edit?.kind === "listed" ? edit.values : shownValue !== null && typeof shownValue === "object" ? shownValue : [],
        isMasked: formField.isSecret,
      };
  }
}

/** One setting's row in an add or configure form, as the form draws it now. */
export interface RelaySettingFormRow {
  formField: RelaySettingFormField;
  control: RelaySettingControl;
  /** "Set" or "Not set" beside a secret the relay holds, as `list_relays` reports it; `null` while adding, or for a setting that is no secret. */
  heldSecretWords: "Set" | "Not set" | null;
  /** Configure offers Use default for an optional setting not at its default already. */
  offersUseDefault: boolean;
  /** Use default's accessible name, naming the setting. */
  useDefaultLabel: string;
  /** Said under a setting the runtime requires, so the form says what it waits for before anything is entered; left out while the setting's problem already says it. */
  requiredWords: "Required" | null;
  /** What is wrong with what was entered, once something was. */
  problem: string | null;
}

/** The form adding a relay of `adapter`, or configuring `relay`: its rows, what it would send, and why it cannot send yet. */
export interface RelaySettingsFormPresentation {
  /** The dialog's title, its send button's words while ready and while the runtime answers, and the lead of the runtime's refusal. */
  dialogWords: { title: string; sendWords: string; sendingWords: string; refusalLead: string };
  /** The rows of the settings the runtime requires, which the form shows first. */
  requiredRows: RelaySettingFormRow[];
  /** The rows of the optional settings, which the form shows under Additional options. */
  additionalOptionRows: RelaySettingFormRow[];
  settingsToSend: RelaySettingsToSend;
  sendUnavailableBecause: string | null;
}

/** The form adding a relay of `adapter` (`relay` `null`) or configuring `relay`, from `draft`. */
export function presentRelaySettingsForm(adapter: RelayAdapter, relay: ListedRelay | null, draft: RelaySettingsDraft): RelaySettingsFormPresentation {
  const settingsToSend = relay === null ? relaySettingsToSendToAdd(adapter, draft) : relaySettingsToSendToConfigure(adapter, relay, draft);
  const rows = relaySettingsFormFields(adapter).map((formField): RelaySettingFormRow => {
    const edit = draft[formField.name];
    const heldSecret = relay === null ? undefined : relay.secrets[formField.name];
    const relayListsAValue = relay !== null && listedSettingValue(relay, formField.name) !== null;
    const isAtItsDefault = edit?.kind === "use_default" || (edit === undefined && !relayListsAValue && heldSecret === undefined);
    const problem = edit !== undefined && settingsToSend.kind === "incomplete" ? (settingsToSend.problems[formField.name] ?? null) : null;
    return {
      formField,
      control: relaySettingControlOf(formField, edit, settingValueBeforeAnEdit(formField, relay)),
      heldSecretWords: heldSecret === undefined ? null : heldSecret === "set" ? "Set" : "Not set",
      offersUseDefault: relay !== null && !formField.isRequired && !isAtItsDefault,
      useDefaultLabel: `Use the default ${formField.label}`,
      requiredWords: formField.isRequired && problem !== REQUIRED_PROBLEM ? "Required" : null,
      problem,
    };
  });
  const dialogWords =
    relay === null
      ? { title: "Add relay", sendWords: "Add relay", sendingWords: "Adding…", refusalLead: "The runtime didn't add the relay:" }
      : { title: "Configure relay", sendWords: "Save", sendingWords: "Saving…", refusalLead: "The runtime didn't change the relay:" };
  return {
    dialogWords,
    requiredRows: rows.filter((row) => row.formField.isRequired),
    additionalOptionRows: rows.filter((row) => !row.formField.isRequired),
    settingsToSend,
    sendUnavailableBecause: relaySettingsSendUnavailableBecause(settingsToSend),
  };
}
