import type { ListedRelay, RelayAdapter, RelaySecretPresence, RelaySettingField, RelaySettingsByName } from "../../shared/tatolab_backend_contract";

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
  /** Said under a setting the runtime requires, so the form says what it waits for before anything is typed; left out while the setting's problem already says it. */
  requiredWords: "Required" | null;
  /** What its empty field reads, "Default" for an optional setting. */
  placeholder: string | null;
  inputMode: "text" | "numeric";
  /** What is wrong with what was typed, once something was. */
  problem: string | null;
}

/** The form adding a relay of `adapter`, or configuring `relay`: its rows, what it would send, and why it cannot send yet. */
export interface RelaySettingsFormPresentation {
  /** The dialog's title, its send button's words while ready and while the runtime answers, and the lead of the runtime's refusal. */
  dialogWords: { title: string; sendWords: string; sendingWords: string; refusalLead: string };
  rows: RelaySettingFormRow[];
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
    const textBeforeAnEdit = relay === null || formField.input === "secret" ? "" : relaySettingShownText(relay, formField.name);
    const isAtItsDefault = edit?.kind === "use_default" || (edit === undefined && textBeforeAnEdit === "" && formField.input !== "secret");
    const problem = edit !== undefined && settingsToSend.kind === "incomplete" ? (settingsToSend.problems[formField.name] ?? null) : null;
    const isBeingReplaced = heldSecret !== null && secretsBeingReplaced.has(formField.name);
    return {
      formField,
      shownText: edit === undefined ? textBeforeAnEdit : edit.kind === "typed" ? edit.text : "",
      heldSecret,
      heldSecretWords: heldSecret === null ? null : heldSecret === "set" ? "Set" : "Not set",
      showsTheField: heldSecret === null || isBeingReplaced,
      takesFocusWhenShown: isBeingReplaced,
      replaceWords: heldSecret === "set" ? "Replace…" : "Set…",
      replaceLabel: `${heldSecret === "set" ? "Replace" : "Set"} ${formField.label}`,
      offersUseDefault: relay !== null && formField.offersItsDefault && !isAtItsDefault,
      useDefaultLabel: `Use the default ${formField.label}`,
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
  return { dialogWords, rows, settingsToSend, sendUnavailableBecause: relaySettingsSendUnavailableBecause(settingsToSend) };
}
