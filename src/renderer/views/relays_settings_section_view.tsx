import { Plus, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { ListedRelay, RelayAdapter, RelaysDescription } from "../../shared/tatolab_backend_contract";
import { describeBackendRejection } from "../backend/tatolab_backend";
import { ActionButton } from "../design_system/action_button";
import { ConfirmationDialog } from "../design_system/confirmation_dialog";
import { FormDialog, FormDialogFooter, FormDialogRow, FormDialogRows } from "../design_system/form_dialog";
import { IconButtonMenu, MenuItem, MoreActionsMenu } from "../design_system/menus";
import { PendingActionWords } from "../design_system/pending_action_words";
import { RefusalLine } from "../design_system/refusal_line";
import { SettingsGroup, SettingsRow } from "../design_system/settings_rows";
import { StateWords, type StateWordsEmphasis } from "../design_system/stream_state_words";
import { TextField } from "../design_system/text_field";
import {
  relaySettingShownText,
  relaySettingsFormFields,
  relaySettingsToSendToAdd,
  relaySettingsToSendToConfigure,
  type RelaySettingFormField,
  type RelaySettingsDraft,
} from "../presentation/relay_settings_form";
import { presentRelaysSection, type RelayConnectionPresentation, type RelaysReading } from "../presentation/relays_presentation";
import { presentRuntimeStatus, type StatusTone } from "../presentation/runtime_presentation";
import type { BackendActionRefusal } from "./action_through_the_backend";
import { useRelaysReading, useTatolabStatus, useTatolabWindowEnvironment } from "./tatolab_window_context";

/** How each state tone reads as state words. */
const STATE_WORDS_EMPHASIS_OF_THE_TONE: Record<StatusTone, StateWordsEmphasis> = {
  ok: "plain",
  progress: "starting",
  idle: "quiet",
  warning: "warning",
  error: "failure",
};

/** The dialog Settings › Relays has open: adding a relay of one adapter, configuring one relay, or asking before removing one. */
type RelayDialog = { kind: "add"; adapter: RelayAdapter } | { kind: "configure"; relayId: string } | { kind: "remove"; relayId: string };

function MachineWords({ children }: { children: ReactNode }) {
  return <code className="font-mono text-xs text-fg-2 select-text">{children}</code>;
}

function RelayConnectionWords({ connection, relay }: { connection: RelayConnectionPresentation; relay: ListedRelay }) {
  return (
    <span className="text-xs" data-relay-connection-state={relay.connection_state.state}>
      <StateWords emphasis={STATE_WORDS_EMPHASIS_OF_THE_TONE[connection.tone]} words={connection.words} />
    </span>
  );
}

/** The runtime's reason beside a relay's state, in its own words. */
function RelayConnectionReason({ connection }: { connection: RelayConnectionPresentation }) {
  return connection.reason === null ? null : <RefusalLine lead={connection.reason.lead} words={connection.reason.words} tone="warning" />;
}

/** The latest relays the window read, the last ones before a refused read included; `null` before any. */
function relaysDescriptionOf(reading: RelaysReading): RelaysDescription | null {
  if (reading.kind === "read") return reading.description;
  return reading.kind === "refused" ? reading.lastDescription : null;
}

/** One setting's field in a relay's form: its value, or for a held secret whether it is set and Replace…; Use default for an optional one. */
function RelaySettingRow({
  formField,
  shownText,
  heldSecret,
  isReplacingTheSecret,
  isAtItsDefault,
  problem,
  onTyped,
  onReplaceTheSecret,
  onUseItsDefault,
}: {
  formField: RelaySettingFormField;
  shownText: string;
  /** A secret the relay already holds, `set` or `unset`; `null` while adding, or for a setting that is no secret. */
  heldSecret: "set" | "unset" | null;
  isReplacingTheSecret: boolean;
  isAtItsDefault: boolean;
  problem: string | null;
  onTyped: (text: string) => void;
  onReplaceTheSecret: () => void;
  onUseItsDefault: (() => void) | null;
}) {
  const fieldId = `relay-setting-${formField.name}`;
  const describedById = `${fieldId}-description`;
  const showsTheField = heldSecret === null || isReplacingTheSecret;
  return (
    <FormDialogRow
      label={formField.label}
      labelFor={showsTheField ? fieldId : undefined}
      data-relay-setting={formField.name}
      below={
        <div id={describedById} className="mt-1 flex flex-col gap-1 text-xs text-fg-3">
          {formField.description !== null && <p className="select-text">{formField.description}</p>}
          {formField.input === "secret" && <p>Kept by the runtime and never shown again.</p>}
          {problem !== null && <p className="text-danger-text">{problem}</p>}
        </div>
      }
    >
      {!showsTheField ? (
        <>
          <span className="text-fg-2" data-relay-secret-presence={heldSecret}>
            {heldSecret === "set" ? "Set" : "Not set"}
          </span>
          <ActionButton appearance="quiet" onPressed={onReplaceTheSecret} data-relay-action="replace-secret">
            {heldSecret === "set" ? "Replace…" : "Set…"}
          </ActionButton>
        </>
      ) : (
        <>
          {onUseItsDefault !== null && !isAtItsDefault && (
            <ActionButton appearance="quiet" onPressed={onUseItsDefault} data-relay-action="use-default">
              Use default
            </ActionButton>
          )}
          <TextField
            id={fieldId}
            label={formField.label}
            text={shownText}
            onTextChanged={onTyped}
            isMachineWord
            isSecret={formField.input === "secret"}
            isRefused={problem !== null}
            placeholder={formField.isRequired ? undefined : "Default"}
            describedBy={describedById}
            className="w-72"
            data-relay-setting-field={formField.name}
          />
        </>
      )}
    </FormDialogRow>
  );
}

/**
 * Adding a relay of one adapter, or configuring one relay: a field for each setting its adapter's schema names, the
 * runtime's refusal in its own words, and every secret typed cleared once the runtime has answered, whatever it answered.
 */
function RelaySettingsDialog({ adapter, relay, onClose }: { adapter: RelayAdapter; relay: ListedRelay | null; onClose: () => void }) {
  const { relayReadings } = useTatolabWindowEnvironment();
  const [draft, setDraft] = useState<RelaySettingsDraft>({});
  const [secretsBeingReplaced, setSecretsBeingReplaced] = useState<ReadonlySet<string>>(new Set());
  const [isSending, setIsSending] = useState(false);
  const [refusal, setRefusal] = useState<BackendActionRefusal | null>(null);
  const formFields = relaySettingsFormFields(adapter);
  const settingsToSend = relay === null ? relaySettingsToSendToAdd(adapter, draft) : relaySettingsToSendToConfigure(adapter, relay, draft);
  const forgetEverySecretTyped = () => {
    setDraft((draftNow) => Object.fromEntries(Object.entries(draftNow).filter(([settingName]) => !formFields.some((formField) => formField.name === settingName && formField.input === "secret"))));
    setSecretsBeingReplaced(new Set());
  };
  const send = () => {
    if (settingsToSend.kind !== "ready") return;
    setRefusal(null);
    setIsSending(true);
    const relayChange =
      relay === null ? relayReadings.addRelay(adapter.kind, settingsToSend.settings) : relayReadings.configureRelay(relay.relay_id, settingsToSend.settings);
    relayChange.then(
      () => {
        forgetEverySecretTyped();
        onClose();
      },
      (rejection: unknown) => {
        forgetEverySecretTyped();
        setIsSending(false);
        setRefusal({ lead: relay === null ? "The runtime didn't add the relay:" : "The runtime didn't change the relay:", words: describeBackendRejection(rejection) });
      },
    );
  };
  const sendUnavailableBecause =
    settingsToSend.kind === "incomplete" ? settingsToSend.firstProblem : settingsToSend.kind === "no_change" ? "Nothing has changed." : null;
  return (
    <FormDialog
      isOpen
      onOpenChange={(isOpen) => {
        if (!isOpen && !isSending) onClose();
      }}
      title={relay === null ? "Add relay" : "Configure relay"}
      description={
        <>
          <MachineWords>{relay === null ? adapter.kind : relay.relay_id}</MachineWords> · {adapter.doc}
        </>
      }
      data-relay-dialog={relay === null ? `add:${adapter.kind}` : `configure:${relay.relay_id}`}
      footer={
        <FormDialogFooter>
          <div className="ml-auto flex items-center gap-2">
            <ActionButton appearance="quiet" isDisabled={isSending} onPressed={onClose}>
              Cancel
            </ActionButton>
            {isSending ? (
              <PendingActionWords words={relay === null ? "Adding…" : "Saving…"} />
            ) : (
              <ActionButton
                appearance="primary"
                isDisabled={sendUnavailableBecause !== null}
                tooltip={sendUnavailableBecause ?? undefined}
                onPressed={send}
                data-relay-action={relay === null ? "add" : "save"}
              >
                {relay === null ? "Add relay" : "Save"}
              </ActionButton>
            )}
          </div>
        </FormDialogFooter>
      }
    >
      {formFields.length === 0 ? (
        <p className="text-fg-3">This adapter takes no settings.</p>
      ) : (
        <FormDialogRows>
          {formFields.map((formField) => {
            const edit = draft[formField.name];
            const heldSecret = relay === null || formField.input !== "secret" ? null : (relay.secrets[formField.name] ?? "unset");
            const textBeforeAnEdit = relay === null || formField.input === "secret" ? "" : relaySettingShownText(relay, formField.name);
            const isAtItsDefault = edit?.kind === "use_default" || (edit === undefined && textBeforeAnEdit === "" && formField.input !== "secret");
            return (
              <RelaySettingRow
                key={formField.name}
                formField={formField}
                shownText={edit === undefined ? textBeforeAnEdit : edit.kind === "typed" ? edit.text : ""}
                heldSecret={heldSecret}
                isReplacingTheSecret={secretsBeingReplaced.has(formField.name)}
                isAtItsDefault={isAtItsDefault}
                problem={edit !== undefined && settingsToSend.kind === "incomplete" ? (settingsToSend.problems[formField.name] ?? null) : null}
                onTyped={(text) => setDraft((draftNow) => ({ ...draftNow, [formField.name]: { kind: "typed", text } }))}
                onReplaceTheSecret={() => setSecretsBeingReplaced((replacedNow) => new Set([...replacedNow, formField.name]))}
                onUseItsDefault={
                  relay !== null && formField.offersItsDefault ? () => setDraft((draftNow) => ({ ...draftNow, [formField.name]: { kind: "use_default" } })) : null
                }
              />
            );
          })}
        </FormDialogRows>
      )}
      {refusal !== null && (
        <div className="mt-4" data-relay-dialog-refusal="">
          <RefusalLine lead={refusal.lead} words={refusal.words} />
        </div>
      )}
    </FormDialog>
  );
}

/** Settings › Relays: the local relay's listeners, every relay added beside them, and adding, configuring and removing one. */
export function RelaysSettingsSection() {
  const { relayReadings } = useTatolabWindowEnvironment();
  const status = useTatolabStatus();
  const reading = useRelaysReading();
  const section = presentRelaysSection(presentRuntimeStatus(status).displayState === "running", reading);
  const [openDialog, setOpenDialog] = useState<RelayDialog | null>(null);
  const [relayBeingRemoved, setRelayBeingRemoved] = useState<string | null>(null);
  /** The relay the remove question names, kept until the question has finished closing so its words stay through the animation. */
  const [relayTheRemoveQuestionNames, setRelayTheRemoveQuestionNames] = useState<string | null>(null);
  const [removeRefusal, setRemoveRefusal] = useState<{ relayId: string; words: string } | null>(null);
  const description = relaysDescriptionOf(reading);
  const adapterOf = (relay: ListedRelay): RelayAdapter | null => description?.adapters.find((adapter) => adapter.kind === relay.adapter) ?? null;
  const relayNamed = (relayId: string): ListedRelay | null => description?.relays.find((relay) => relay.relay_id === relayId) ?? null;

  const explanation = (
    <p className="text-fg-3">Where this machine serves its exposed outputs. A private output reaches only the loopback listener; a public one reaches every relay here.</p>
  );
  if (section.kind === "runtime_not_running") {
    return (
      <>
        {explanation}
        <p className="text-fg-2" data-relays-section="runtime-not-running">
          {section.words}
        </p>
      </>
    );
  }
  if (section.kind === "reading") {
    return (
      <>
        {explanation}
        <PendingActionWords words="Reading the relays…" />
      </>
    );
  }
  if (section.kind === "not_listed") {
    return (
      <>
        {explanation}
        <RefusalLine lead="The runtime didn't list its relays:" words={section.refusal} />
      </>
    );
  }

  const configureButton = (relay: ListedRelay) => {
    const adapter = adapterOf(relay);
    return (
      <ActionButton
        isDisabled={adapter === null}
        tooltip={adapter === null ? `The runtime's catalog names no adapter ${relay.adapter}.` : undefined}
        onPressed={() => setOpenDialog({ kind: "configure", relayId: relay.relay_id })}
        data-relay-action="configure"
      >
        Configure…
      </ActionButton>
    );
  };
  const dialogRelay = openDialog !== null && openDialog.kind !== "add" ? relayNamed(openDialog.relayId) : null;
  const dialogAdapter = openDialog?.kind === "add" ? openDialog.adapter : dialogRelay === null ? null : adapterOf(dialogRelay);
  const removeTheRelay = (relayId: string) => {
    setOpenDialog(null);
    setRemoveRefusal(null);
    setRelayBeingRemoved(relayId);
    relayReadings
      .removeRelay(relayId)
      .catch((rejection: unknown) => setRemoveRefusal({ relayId, words: describeBackendRejection(rejection) }))
      .finally(() => setRelayBeingRemoved(null));
  };

  return (
    <>
      {explanation}
      {section.lastReadingRefusal !== null && <RefusalLine lead="The runtime didn't list its relays just now:" words={section.lastReadingRefusal} tone="warning" />}
      <SettingsGroup title="Local relay" description="Built into the runtime and always joined. Only its ports change." data-relays-group="local">
        {section.localRelayListenerRows.map((row) => (
          <SettingsRow
            key={row.relay.relay_id}
            label={row.label}
            description={
              <>
                {row.servesWords !== null && <span className="block">{row.servesWords}</span>}
                <span className="tabular" data-relay-port="">
                  {row.portWords}
                </span>
              </>
            }
            data-relay-row={row.relay.relay_id}
            control={() => (
              <>
                <RelayConnectionWords connection={row.connection} relay={row.relay} />
                {configureButton(row.relay)}
              </>
            )}
          >
            <RelayConnectionReason connection={row.connection} />
          </SettingsRow>
        ))}
      </SettingsGroup>
      <SettingsGroup
        title="Added relays"
        description="Joined again at every start. Public outputs reach each one."
        data-relays-group="added"
        actions={
          section.adapterChoices.length === 0 ? undefined : (
            <IconButtonMenu icon={Plus} label="Add a relay" size="compact" data-relay-action="add-menu">
              {section.adapterChoices.map((choice) => (
                <MenuItem
                  key={choice.adapter.kind}
                  isDisabled={choice.unavailableBecause !== null}
                  onChosen={() => setOpenDialog({ kind: "add", adapter: choice.adapter })}
                  data-relay-adapter-choice={choice.adapter.kind}
                >
                  <span className="flex flex-col">
                    <span className="font-mono text-xs">{choice.adapter.kind}</span>
                    {choice.unavailableBecause !== null && <span className="text-xs text-fg-3">{choice.unavailableBecause}</span>}
                  </span>
                </MenuItem>
              ))}
            </IconButtonMenu>
          )
        }
      >
        {section.hostedRelayRows.length === 0 ? (
          <SettingsRow
            label="No relays added"
            description={
              section.adapterChoices.length === 0
                ? "The runtime offers no relay adapter to add one through."
                : "Add one with + to serve public outputs beyond this machine's own network."
            }
            data-relay-row=""
          />
        ) : (
          section.hostedRelayRows.map((row) => (
            <SettingsRow
              key={row.relay.relay_id}
              label={<MachineWords>{row.relay.relay_id}</MachineWords>}
              description={row.settingsWords.length === 0 ? undefined : row.settingsWords.join(" · ")}
              refusal={removeRefusal?.relayId === row.relay.relay_id ? { lead: "Remove was refused:", words: removeRefusal.words } : null}
              data-relay-row={row.relay.relay_id}
              control={() =>
                relayBeingRemoved === row.relay.relay_id ? (
                  <PendingActionWords words="Removing…" />
                ) : (
                  <>
                    <RelayConnectionWords connection={row.connection} relay={row.relay} />
                    {configureButton(row.relay)}
                    <MoreActionsMenu label={`More for ${row.relay.relay_id}`} data-relay-action="more">
                      <MenuItem
                        icon={Trash2}
                        isDestructive
                        onChosen={() => {
                          setRelayTheRemoveQuestionNames(row.relay.relay_id);
                          setOpenDialog({ kind: "remove", relayId: row.relay.relay_id });
                        }}
                        data-relay-action="remove"
                      >
                        Remove relay…
                      </MenuItem>
                    </MoreActionsMenu>
                  </>
                )
              }
            >
              <RelayConnectionReason connection={row.connection} />
            </SettingsRow>
          ))
        )}
      </SettingsGroup>
      {openDialog !== null && openDialog.kind !== "remove" && dialogAdapter !== null && (
        <RelaySettingsDialog
          key={openDialog.kind === "add" ? `add:${openDialog.adapter.kind}` : `configure:${openDialog.relayId}`}
          adapter={dialogAdapter}
          relay={openDialog.kind === "configure" ? dialogRelay : null}
          onClose={() => setOpenDialog(null)}
        />
      )}
      <ConfirmationDialog
        isOpen={openDialog?.kind === "remove"}
        onOpenChange={(isOpen) => {
          if (!isOpen) setOpenDialog(null);
        }}
        onClosedCompletely={() => setRelayTheRemoveQuestionNames(null)}
        question={
          relayTheRemoveQuestionNames !== null
            ? {
                title: `Remove ${relayTheRemoveQuestionNames}?`,
                explanation: "The runtime leaves this relay and forgets it and its secrets. Public outputs stop reaching it.",
                confirmWords: "Remove relay",
              }
            : null
        }
        isDestructive
        onConfirmed={() => {
          if (openDialog?.kind === "remove") removeTheRelay(openDialog.relayId);
        }}
        data-relay-dialog="remove"
        confirmDataAttributes={{ "data-relay-action": "confirm-remove" }}
      />
    </>
  );
}
