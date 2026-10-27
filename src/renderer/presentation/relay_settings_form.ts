import type { ListedRelay, RelayAdapter, RelaySecretPresence, RelaySettingField, RelaySettingsByName, RelaySettingValue } from "../../shared/tatolab_backend_contract";

/** Words spelled their own way inside a setting's name. */
const WORDS_SPELLED_THEIR_OWN_WAY_IN_A_SETTING_NAME: Readonly<Record<string, string>> = { ipv4: "IPv4", ipv6: "IPv6" };

/** Words that read in capitals inside a setting's name. */
const INITIALISMS_IN_A_SETTING_NAME = new Set(["api", "id", "jwk", "jwt", "tls", "uri", "url", "http", "https", "quic"]);

/** A setting's name as the form labels it: `relay_url` as "Relay URL". */
export function relaySettingLabel(settingName: string): string {
  return settingName
    .split("_")
    .filter((word) => word !== "")
    .map((word, wordIndex) => {
      const spelledItsOwnWay = WORDS_SPELLED_THEIR_OWN_WAY_IN_A_SETTING_NAME[word];
      if (spelledItsOwnWay !== undefined) return spelledItsOwnWay;
      if (INITIALISMS_IN_A_SETTING_NAME.has(word)) return word.toUpperCase();
      if (word.endsWith("s") && INITIALISMS_IN_A_SETTING_NAME.has(word.slice(0, -1))) return `${word.slice(0, -1).toUpperCase()}s`;
      return wordIndex === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word;
    })
    .join(" ");
}

/** How the form takes one setting: a line of text, a whole number, a secret (masked and never filled in), one of a list of choices, a switch, or text one item per line. */
export type RelaySettingInput = "text" | "whole_number" | "secret" | "choice" | "true_or_false" | "text_lines";

/** The input that draws `settingField`, as its schema types it, a secret always masked. */
function relaySettingInputOf(settingField: RelaySettingField): RelaySettingInput {
  if (settingField.is_secret) return "secret";
  switch (settingField.value_kind.kind) {
    case "whole_number":
      return "whole_number";
    case "one_of":
      return "choice";
    case "true_or_false":
      return "true_or_false";
    case "text_list":
      return "text_lines";
    case "text":
    case "not_drawable":
      return "text";
  }
}

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
      input: relaySettingInputOf(settingField),
      isRequired: settingField.is_required,
      offersItsDefault: !settingField.is_required && settingField.accepts_null,
      settingField,
    }),
  );
  return [...formFields.filter((formField) => formField.isRequired), ...formFields.filter((formField) => !formField.isRequired)];
}

/** What the person did to one setting in a form: typed into it, read it from a file, chose one of its choices, switched it, or asked for its default. A setting they left alone is absent. */
export type RelaySettingEdit =
  | { kind: "typed"; text: string }
  | { kind: "read_from_a_file"; text: string; fileName: string }
  | { kind: "chosen"; choice: string }
  | { kind: "switched"; isOn: boolean }
  | { kind: "use_default" };

/** Every setting the person changed in a form, by name. */
export type RelaySettingsDraft = Readonly<Record<string, RelaySettingEdit>>;

/** What a form would send: the settings, nothing because nothing changed, or why it cannot yet, each setting's problem by name. */
export type RelaySettingsToSend =
  | { kind: "ready"; settings: RelaySettingsByName }
  | { kind: "no_change" }
  | { kind: "incomplete"; problems: Record<string, string>; firstProblem: string };

/** What `edit` of `formField` sends, or the problem with it; empty text, or text lines holding no item, sends nothing. */
function editedSettingValue(
  formField: RelaySettingFormField,
  edit: Exclude<RelaySettingEdit, { kind: "use_default" }>,
): { kind: "value"; value: RelaySettingValue } | { kind: "empty" } | { kind: "problem"; problem: string; sentence: string } {
  if (edit.kind === "read_from_a_file") return { kind: "value", value: edit.text };
  if (edit.kind === "chosen") return { kind: "value", value: edit.choice };
  if (edit.kind === "switched") return { kind: "value", value: edit.isOn };
  const valueKind = formField.settingField.value_kind;
  if (formField.input === "text_lines") {
    const listedTexts = edit.text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "");
    return listedTexts.length === 0 ? { kind: "empty" } : { kind: "value", value: listedTexts };
  }
  const trimmedText = valueKind.kind === "whole_number" ? edit.text.trim() : edit.text;
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

/** The settings adding a relay of `adapter` sends from `draft`: every setting typed, chosen or switched, an empty optional one left out, and a required switch left alone sent off. */
export function relaySettingsToSendToAdd(adapter: RelayAdapter, draft: RelaySettingsDraft): RelaySettingsToSend {
  const settings: RelaySettingsByName = {};
  const problems: { name: string; problem: string; sentence: string }[] = [];
  for (const formField of relaySettingsFormFields(adapter)) {
    const edit = draft[formField.name];
    const edited = edit === undefined || edit.kind === "use_default" ? { kind: "empty" as const } : editedSettingValue(formField, edit);
    if (edited.kind === "value") settings[formField.name] = edited.value;
    else if (edited.kind === "problem") problems.push({ name: formField.name, problem: edited.problem, sentence: edited.sentence });
    else if (formField.isRequired && formField.input === "true_or_false") settings[formField.name] = false;
    else if (formField.isRequired) problems.push({ name: formField.name, problem: REQUIRED_PROBLEM, sentence: `${formField.label} is required.` });
  }
  return settingsToSendFrom(settings, problems, { kind: "ready", settings });
}

/** A non-secret setting's value as its field shows it, a list one item per line, or empty while the relay lists none for it. */
export function relaySettingShownText(relay: ListedRelay, settingName: string): string {
  const settingValue = relay.settings[settingName];
  if (settingValue === undefined || settingValue === null) return "";
  return Array.isArray(settingValue) ? settingValue.join("\n") : String(settingValue);
}

/** Whether `value` is what `relay` lists for `settingName` already, a list item for item. */
function isTheValueTheRelayHolds(relay: ListedRelay, settingName: string, value: RelaySettingValue): boolean {
  return JSON.stringify(relay.settings[settingName] ?? null) === JSON.stringify(value);
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
    const edited = editedSettingValue(formField, edit);
    if (edited.kind === "problem") {
      problems.push({ name: formField.name, problem: edited.problem, sentence: edited.sentence });
    } else if (edited.kind === "value") {
      if (formField.input === "secret" || !isTheValueTheRelayHolds(relay, formField.name, edited.value)) settings[formField.name] = edited.value;
    } else if (formField.input !== "secret" && relaySettingShownText(relay, formField.name) !== "") {
      if (formField.isRequired) problems.push({ name: formField.name, problem: REQUIRED_PROBLEM, sentence: `${formField.label} is required.` });
      else if (!formField.settingField.accepts_null) problems.push({ name: formField.name, problem: "Can't be left empty", sentence: `${formField.label} can't be left empty.` });
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

/** `draft` with every secret typed into it forgotten, as a form leaves it once the runtime has answered. */
export function relaySettingsDraftWithoutTypedSecrets(adapter: RelayAdapter, draft: RelaySettingsDraft): RelaySettingsDraft {
  const secretNames = new Set(adapter.setting_fields.filter((settingField) => settingField.is_secret).map((settingField) => settingField.name));
  return Object.fromEntries(Object.entries(draft).filter(([settingName]) => !secretNames.has(settingName)));
}

/** One setting's row in an add or configure form, as the form draws it now. */
export interface RelaySettingFormRow {
  formField: RelaySettingFormField;
  /** What its field holds: what was typed, or the relay's value before any edit; never a secret's. */
  shownText: string;
  /** A secret the relay already holds, set or not, shown as `heldSecretWords` with Replace… in place of its field until Replace… is pressed; `null` while adding, or for a setting that is no secret. */
  heldSecret: RelaySecretPresence | null;
  heldSecretWords: "Set" | "Not set" | null;
  showsTheField: boolean;
  /** The field of a secret Replace… has just shown takes keyboard focus from the button it replaced. */
  takesFocusWhenShown: boolean;
  /** Replace…'s words, "Replace…" or "Set…", and its accessible name, naming the secret. */
  replaceWords: "Replace…" | "Set…";
  replaceLabel: string;
  /** Configure offers Use default for an optional setting not at its default already. */
  offersUseDefault: boolean;
  /** Use default's accessible name, naming the setting. */
  useDefaultLabel: string;
  /** Choose file…'s accessible name, naming the secret it reads from a file. */
  chooseFileLabel: string;
  /** Said under a setting the runtime requires, so the form says what it waits for before anything is typed; left out while the setting's problem already says it. */
  requiredWords: "Required" | null;
  /** What its empty field reads, "Default" for an optional setting. */
  placeholder: string | null;
  inputMode: "text" | "numeric";
  /** Whether its label names a text field, which a click on the label focuses; a choice and a switch are labelled by it instead. */
  isLabelledAsAField: boolean;
  /** A secret read from a file, as "Read from pb1studio.jwk", shown with Clear in place of its field; `null` otherwise. */
  readFromAFileWords: string | null;
  /** Choose file… beside a secret's field, its accessible name naming the secret, and its words while the app's dialog is open. */
  offersChooseFile: boolean;
  choosingFileWords: string;
  /** A choice setting's choices, the one shown chosen (picked, the relay's own, or none yet), its menu's accessible name and its words. */
  choices: readonly string[];
  chosenChoice: string | null;
  choiceFieldLabel: string;
  choiceFieldWords: string;
  /** A switch's position: as switched, as the relay lists it, or its schema's default; off when none of them says. */
  isSwitchedOn: boolean;
  /** "Default" beside a switch left at a default its schema does not state, so off is not read as what the runtime applies. */
  switchDefaultWords: "Default" | null;
  /** What is wrong with what was typed, once something was. */
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

/** The form adding a relay of `adapter` (`relay` `null`) or configuring `relay`, from `draft`, with the secrets the person chose to replace. */
export function presentRelaySettingsForm(
  adapter: RelayAdapter,
  relay: ListedRelay | null,
  draft: RelaySettingsDraft,
  secretsBeingReplaced: ReadonlySet<string>,
): RelaySettingsFormPresentation {
  const settingsToSend = relay === null ? relaySettingsToSendToAdd(adapter, draft) : relaySettingsToSendToConfigure(adapter, relay, draft);
  const rows = relaySettingsFormFields(adapter).map((formField): RelaySettingFormRow => {
    const edit = draft[formField.name];
    const heldSecret: RelaySecretPresence | null = relay === null || formField.input !== "secret" ? null : (relay.secrets[formField.name] ?? "unset");
    const isTypedInto = formField.input === "text" || formField.input === "whole_number" || formField.input === "text_lines";
    const textBeforeAnEdit = relay === null || !isTypedInto ? "" : relaySettingShownText(relay, formField.name);
    const isAtItsDefault = edit?.kind === "use_default" || (edit === undefined && formField.input !== "secret" && (relay === null || relay.settings[formField.name] === undefined || relay.settings[formField.name] === null));
    const problem = edit !== undefined && settingsToSend.kind === "incomplete" ? (settingsToSend.problems[formField.name] ?? null) : null;
    const isBeingReplaced = heldSecret !== null && secretsBeingReplaced.has(formField.name);
    const valueTheRelayHolds = relay === null ? undefined : relay.settings[formField.name];
    const valueKind = formField.settingField.value_kind;
    const chosenChoice = edit?.kind === "chosen" ? edit.choice : edit?.kind === "use_default" ? null : typeof valueTheRelayHolds === "string" ? valueTheRelayHolds : null;
    const switchedPosition = edit?.kind === "switched" ? edit.isOn : edit?.kind !== "use_default" && typeof valueTheRelayHolds === "boolean" ? valueTheRelayHolds : null;
    const defaultPosition = valueKind.kind === "true_or_false" ? valueKind.default_is_on : null;
    const readFromAFile = edit?.kind === "read_from_a_file" ? edit : null;
    const showsTheField = heldSecret === null || isBeingReplaced;
    return {
      formField,
      shownText: edit === undefined ? textBeforeAnEdit : edit.kind === "typed" ? edit.text : "",
      isLabelledAsAField: showsTheField && readFromAFile === null && formField.input !== "choice" && formField.input !== "true_or_false",
      readFromAFileWords: readFromAFile === null ? null : `Read from ${readFromAFile.fileName}`,
      offersChooseFile: formField.input === "secret" && showsTheField && readFromAFile === null,
      choosingFileWords: "Choosing…",
      choices: valueKind.kind === "one_of" ? valueKind.choices : [],
      chosenChoice,
      choiceFieldLabel: `${formField.label}: ${chosenChoice ?? (formField.isRequired ? "none chosen" : "the default")}`,
      choiceFieldWords: chosenChoice ?? (formField.isRequired ? "Choose…" : "Default"),
      isSwitchedOn: switchedPosition ?? defaultPosition ?? false,
      switchDefaultWords: formField.input === "true_or_false" && switchedPosition === null && defaultPosition === null && !formField.isRequired ? "Default" : null,
      heldSecret,
      heldSecretWords: heldSecret === null ? null : heldSecret === "set" ? "Set" : "Not set",
      showsTheField,
      takesFocusWhenShown: isBeingReplaced,
      replaceWords: heldSecret === "set" ? "Replace…" : "Set…",
      replaceLabel: `${heldSecret === "set" ? "Replace" : "Set"} ${formField.label}`,
      offersUseDefault: relay !== null && formField.offersItsDefault && !isAtItsDefault,
      useDefaultLabel: `Use the default ${formField.label}`,
      chooseFileLabel: `Choose a file holding the ${formField.label}`,
      requiredWords: formField.isRequired && problem !== REQUIRED_PROBLEM ? "Required" : null,
      placeholder: formField.isRequired ? null : "Default",
      inputMode: formField.input === "whole_number" ? "numeric" : "text",
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
