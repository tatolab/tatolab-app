import { Plus, Trash2, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import type { ListedRelay, RelayAdapter } from "../../shared/tatolab_backend_contract";
import { describeBackendRejection } from "../backend/tatolab_backend";
import { ActionButton } from "../design_system/action_button";
import { ConfirmationDialog } from "../design_system/confirmation_dialog";
import { FileTextChooserButton } from "../design_system/file_text_chooser_button";
import { FormDialog, FormDialogFooter, FormDialogRow, FormDialogRows, FormDialogRowsSection } from "../design_system/form_dialog";
import { IconButton } from "../design_system/icon_button";
import { FieldMenu, IconButtonMenu, MenuItem, MenuSingleChoiceGroup, MoreActionsMenu } from "../design_system/menus";
import { MultiLineTextField } from "../design_system/multi_line_text_field";
import { PendingActionWords } from "../design_system/pending_action_words";
import { RefusalLine } from "../design_system/refusal_line";
import { ServedLogoSlot, type ServedLogoSlotSize } from "../design_system/served_logo_slot";
import { SettingsGroup, SettingsMachineWords, SettingsRow, SettingsSectionExplanation } from "../design_system/settings_rows";
import { StateWords, type StateWordsEmphasis } from "../design_system/stream_state_words";
import { TextField } from "../design_system/text_field";
import { ToggleSwitch } from "../design_system/toggle_switch";
import {
  presentRelaySettingsForm,
  relaySettingsDraftWithoutTypedSecrets,
  type RelaySettingEdit,
  type RelaySettingFormRow,
  type RelaySettingsDraft,
} from "../presentation/relay_settings_form";
import {
  presentRelayAdapterNaming,
  presentRelayRemovalConfirmation,
  presentRelaysSection,
  relaySettingsDialogSubjectOf,
  runtimeWordsSegmentsOf,
  type HostedRelayRow,
  type LocalRelayListenerRow,
  type RelayAdapterNaming,
  type RelayConnectionPresentation,
} from "../presentation/relays_presentation";
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

/** The dialog Settings › Relays has open: adding a relay of one adapter, or configuring one relay. */
type RelaySettingsDialogOpen = { kind: "add"; adapter: RelayAdapter } | { kind: "configure"; relayId: string };

/** The runtime's words with each of its backtick code spans typeset as code; every word goes in as text. */
function RuntimeWords({ words }: { words: string }) {
  return runtimeWordsSegmentsOf(words).map((segment, segmentIndex) =>
    segment.kind === "code" ? (
      <SettingsMachineWords key={segmentIndex} tone="of_the_words_around_it">
        {segment.words}
      </SettingsMachineWords>
    ) : (
      segment.words
    ),
  );
}

/** An adapter's name as its catalog serves it, or its kind in machine words from a runtime that serves none. */
function RelayAdapterName({ adapterNaming }: { adapterNaming: RelayAdapterNaming }) {
  return adapterNaming.isTheAdapterKind ? <SettingsMachineWords tone="of_the_words_around_it">{adapterNaming.words}</SettingsMachineWords> : adapterNaming.words;
}

/** An adapter's logo in its square slot, for a leading slot; nothing when its catalog serves none, so no slot is drawn. */
function relayAdapterLogoOf(adapterNaming: RelayAdapterNaming, size: ServedLogoSlotSize): ReactNode {
  return adapterNaming.iconDataUri === null ? undefined : <ServedLogoSlot logoDataUri={adapterNaming.iconDataUri} size={size} />;
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
  return connection.why === null ? null : <RefusalLine lead="Why:" words={connection.why} tone="warning" />;
}

function ConfigureRelayButton({ row, onPressed }: { row: LocalRelayListenerRow | HostedRelayRow; onPressed: () => void }) {
  return (
    <ActionButton
      label={row.configureLabel}
      isDisabled={row.configureUnavailableBecause !== null}
      tooltip={row.configureUnavailableBecause ?? undefined}
      onPressed={onPressed}
      data-relay-action="configure"
    >
      Configure…
    </ActionButton>
  );
}

/** The control of a setting's row, drawn by the setting's type, each change handed on as the person's edit. */
function RelaySettingControlOfTheRow({
  row,
  fieldId,
  labelId,
  describedById,
  onEdited,
  onFileUnreadable,
}: {
  row: RelaySettingFormRow;
  fieldId: string;
  labelId: string;
  describedById: string;
  onEdited: (edit: RelaySettingEdit) => void;
  onFileUnreadable: (whyUnreadable: string) => void;
}) {
  const { formField, control } = row;
  const isRefused = row.problem !== null;
  switch (control.control) {
    case "text_field":
      return (
        <TextField
          id={fieldId}
          label={formField.label}
          text={control.text}
          onTextChanged={(text) => onEdited({ kind: "typed", text })}
          isMachineWord
          isMasked={control.isMasked}
          isRequired={formField.isRequired}
          isRefused={isRefused}
          placeholder={control.placeholder ?? undefined}
          inputMode={control.inputMode}
          describedBy={describedById}
          className="w-64"
          data-relay-setting-field={formField.name}
        />
      );
    case "file_text":
      return (
        <div className="flex flex-col items-end gap-1.5">
          {control.isMasked ? (
            <TextField
              id={fieldId}
              label={formField.label}
              text={control.text}
              onTextChanged={(text) => onEdited({ kind: "typed", text })}
              isMachineWord
              isMasked
              isRequired={formField.isRequired}
              isRefused={isRefused}
              placeholder={control.placeholder ?? "Paste, or choose a file"}
              describedBy={describedById}
              className="w-64"
              data-relay-setting-field={formField.name}
            />
          ) : (
            <MultiLineTextField
              id={fieldId}
              label={formField.label}
              text={control.text}
              onTextChanged={(text) => onEdited({ kind: "typed", text })}
              isMachineWord
              isRequired={formField.isRequired}
              isRefused={isRefused}
              placeholder={control.placeholder ?? "Paste, or choose a file"}
              describedBy={describedById}
              className="w-64"
              data-relay-setting-field={formField.name}
            />
          )}
          <FileTextChooserButton
            label={`Choose the ${formField.label} file`}
            onFileTextChosen={(fileName, text) => onEdited({ kind: "file_chosen", fileName, text })}
            onFileUnreadable={onFileUnreadable}
            data-relay-action="choose-file"
          />
        </div>
      );
    case "switch":
      return (
        <ToggleSwitch
          isOn={control.isOn}
          onSwitched={(isOn) => onEdited({ kind: "switched", isOn })}
          labelledBy={labelId}
          describedBy={describedById}
          data-relay-setting-field={formField.name}
        />
      );
    case "menu":
      return (
        <FieldMenu label={`${formField.label}: ${control.chosenWords}`} words={<span className="font-mono">{control.chosenWords}</span>} data-relay-setting-field={formField.name}>
          <MenuSingleChoiceGroup
            choices={control.choices.map((choice) => ({ choice: choice.choiceKey, label: <span className={choice.option === null ? undefined : "font-mono"}>{choice.words}</span> }))}
            chosen={control.chosenChoiceKey}
            onChosen={(choiceKey) => onEdited({ kind: "chosen", option: control.choices.find((choice) => choice.choiceKey === choiceKey)?.option ?? null })}
            dataAttributeOfEachChoice="data-relay-setting-choice"
          />
        </FieldMenu>
      );
    case "list_of_text_fields": {
      const valueFieldId = (valueIndex: number) => `${fieldId}-${valueIndex}`;
      const listWith = (values: readonly string[]) => onEdited({ kind: "listed", values });
      return (
        <div className="flex flex-col items-end gap-1.5" data-relay-setting-field={formField.name}>
          {control.values.map((listedValue, valueIndex) => (
            <div key={valueIndex} className="flex items-center gap-1">
              <TextField
                id={valueFieldId(valueIndex)}
                label={`${formField.label} ${valueIndex + 1}`}
                text={listedValue}
                onTextChanged={(text) => listWith(control.values.map((otherValue, otherIndex) => (otherIndex === valueIndex ? text : otherValue)))}
                isMachineWord
                isMasked={control.isMasked}
                isRefused={isRefused}
                describedBy={describedById}
                className="w-56"
              />
              <IconButton
                icon={X}
                label={`Remove ${formField.label} ${valueIndex + 1}`}
                size="compact"
                onPressed={() => listWith(control.values.filter((_, otherIndex) => otherIndex !== valueIndex))}
                data-relay-action="remove-value"
              />
            </div>
          ))}
          <ActionButton
            appearance="quiet"
            size="small"
            icon={Plus}
            label={`Add a ${formField.label} value`}
            onPressed={() => {
              listWith([...control.values, ""]);
              // The new field is drawn on the next frame; focus moves into it, not to the page.
              requestAnimationFrame(() => document.getElementById(valueFieldId(control.values.length))?.focus());
            }}
            data-relay-action="add-value"
          >
            Add value
          </ActionButton>
        </div>
      );
    }
  }
}

/** One setting's row in a relay's form: its control by type, the runtime's set or not set beside a secret it holds, and Use default for an optional one. */
function RelaySettingRow({ row, onEdited }: { row: RelaySettingFormRow; onEdited: (edit: RelaySettingEdit) => void }) {
  const { formField } = row;
  const [whyTheFileIsUnreadable, setWhyTheFileIsUnreadable] = useState<string | null>(null);
  const fieldId = `relay-setting-${formField.name}`;
  const labelId = `${fieldId}-label`;
  const describedById = `${fieldId}-description`;
  const labelsItsControl = row.control.control === "text_field" || row.control.control === "file_text";
  return (
    <FormDialogRow
      label={formField.label}
      labelFor={labelsItsControl ? fieldId : undefined}
      labelId={labelId}
      data-relay-setting={formField.name}
      below={
        <div id={describedById} className="mt-1 flex flex-col gap-1 text-xs text-fg-3">
          {formField.doc !== null && (
            <p className="select-text">
              <RuntimeWords words={formField.doc} />
            </p>
          )}
          {row.control.control === "file_text" && row.control.chosenFileName !== null && (
            <p data-relay-chosen-file="">
              From <SettingsMachineWords tone="of_the_words_around_it">{row.control.chosenFileName}</SettingsMachineWords>
            </p>
          )}
          {row.requiredWords !== null && <p>{row.requiredWords}</p>}
          {row.problem !== null && <p className="text-danger-text">{row.problem}</p>}
          {whyTheFileIsUnreadable !== null && <p className="text-danger-text">The file couldn't be read: {whyTheFileIsUnreadable}</p>}
        </div>
      }
    >
      {row.heldSecretWords !== null && (
        <span className="text-fg-2" data-relay-secret-presence={row.heldSecretWords}>
          {row.heldSecretWords}
        </span>
      )}
      {row.offersUseDefault && (
        <ActionButton
          appearance="quiet"
          label={row.useDefaultLabel}
          onPressed={() => {
            onEdited({ kind: "use_default" });
            // The button goes once pressed; focus moves to the control it returned to its default, not to the page.
            document.getElementById(fieldId)?.focus();
          }}
          data-relay-action="use-default"
        >
          Use default
        </ActionButton>
      )}
      <RelaySettingControlOfTheRow
        row={row}
        fieldId={fieldId}
        labelId={labelId}
        describedById={describedById}
        onEdited={(edit) => {
          setWhyTheFileIsUnreadable(null);
          onEdited(edit);
        }}
        onFileUnreadable={setWhyTheFileIsUnreadable}
      />
    </FormDialogRow>
  );
}

/**
 * Adding a relay of one adapter, or configuring one relay: a control for each setting its adapter's catalog entry lists, the
 * runtime's refusal in its own words, and every secret entered forgotten once the runtime has answered, whatever it answered.
 */
function RelaySettingsDialog({ adapter, relay, onClose }: { adapter: RelayAdapter; relay: ListedRelay | null; onClose: () => void }) {
  const { relayReadings } = useTatolabWindowEnvironment();
  const [draft, setDraft] = useState<RelaySettingsDraft>({});
  const [isSending, setIsSending] = useState(false);
  const [refusal, setRefusal] = useState<BackendActionRefusal | null>(null);
  const { dialogWords, requiredRows, additionalOptionRows, settingsToSend, sendUnavailableBecause } = presentRelaySettingsForm(adapter, relay, draft);
  const adapterNaming = presentRelayAdapterNaming(adapter);
  const forgetEverySecretTyped = () => setDraft((draftNow) => relaySettingsDraftWithoutTypedSecrets(adapter, draftNow));
  const relaySettingRowOf = (row: RelaySettingFormRow) => (
    <RelaySettingRow
      key={row.formField.name}
      row={row}
      onEdited={(edit) => setDraft((draftNow) => ({ ...draftNow, [row.formField.name]: edit }))}
    />
  );
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
        setRefusal({ lead: dialogWords.refusalLead, words: describeBackendRejection(rejection) });
      },
    );
  };
  return (
    <FormDialog
      isOpen
      onOpenChange={(isOpen) => {
        if (!isOpen && !isSending) onClose();
      }}
      title={dialogWords.title}
      description={
        <>
          <span className="mt-1.5 mb-1 flex items-center gap-2">
            {relayAdapterLogoOf(adapterNaming, "in_a_row")}
            <span className="text-fg" data-relay-dialog-adapter-name="">
              <RelayAdapterName adapterNaming={adapterNaming} />
            </span>
            {relay !== null && <SettingsMachineWords>{relay.relay_id}</SettingsMachineWords>}
          </span>
          <RuntimeWords words={adapter.doc} />
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
              <PendingActionWords words={dialogWords.sendingWords} />
            ) : (
              <ActionButton
                appearance="primary"
                isDisabled={sendUnavailableBecause !== null}
                tooltip={sendUnavailableBecause ?? undefined}
                onPressed={send}
                data-relay-action={relay === null ? "add" : "save"}
              >
                {dialogWords.sendWords}
              </ActionButton>
            )}
          </div>
        </FormDialogFooter>
      }
    >
      {requiredRows.length + additionalOptionRows.length === 0 ? (
        <p className="text-fg-3">This adapter takes no settings.</p>
      ) : (
        <>
          {requiredRows.length > 0 && <FormDialogRows>{requiredRows.map(relaySettingRowOf)}</FormDialogRows>}
          {additionalOptionRows.length > 0 && (
            <FormDialogRowsSection title="Additional options" data-relay-additional-options="">
              {additionalOptionRows.map(relaySettingRowOf)}
            </FormDialogRowsSection>
          )}
        </>
      )}
      {refusal !== null && (
        <div className="mt-4" data-relay-dialog-refusal="">
          <RefusalLine lead={refusal.lead} words={refusal.words} />
        </div>
      )}
    </FormDialog>
  );
}

const RELAYS_SECTION_EXPLANATION =
  "Where this machine serves its exposed outputs. A private output reaches only the loopback listener; a public one reaches every relay here.";

/** Settings › Relays: the local relay's listeners, every relay added beside them, and adding, configuring and removing one. */
export function RelaysSettingsSection() {
  const { relayReadings } = useTatolabWindowEnvironment();
  const status = useTatolabStatus();
  const reading = useRelaysReading();
  const section = presentRelaysSection(presentRuntimeStatus(status).displayState === "running", reading);
  const [settingsDialog, setSettingsDialog] = useState<RelaySettingsDialogOpen | null>(null);
  const [isTheRemoveQuestionOpen, setIsTheRemoveQuestionOpen] = useState(false);
  /** The relay the remove question names, kept until the question has finished closing so its words stay through the animation. */
  const [relayTheRemoveQuestionNames, setRelayTheRemoveQuestionNames] = useState<string | null>(null);
  const [relayBeingRemoved, setRelayBeingRemoved] = useState<string | null>(null);
  const [removeRefusal, setRemoveRefusal] = useState<{ relayId: string; words: string } | null>(null);
  const isListed = section.kind === "listed";
  useEffect(() => {
    if (isListed) return;
    setSettingsDialog(null);
    setIsTheRemoveQuestionOpen(false);
  }, [isListed]);
  const configureSubject = settingsDialog?.kind === "configure" ? relaySettingsDialogSubjectOf(section, settingsDialog.relayId) : null;
  const isConfiguringARelayNoLongerListed = isListed && settingsDialog?.kind === "configure" && configureSubject === null;
  useEffect(() => {
    if (isConfiguringARelayNoLongerListed) setSettingsDialog(null);
  }, [isConfiguringARelayNoLongerListed]);

  if (section.kind !== "listed") {
    return (
      <>
        <SettingsSectionExplanation>{RELAYS_SECTION_EXPLANATION}</SettingsSectionExplanation>
        {section.kind === "runtime_not_running" ? (
          <p className="text-fg-2" data-relays-section="runtime-not-running">
            {section.words}
          </p>
        ) : section.kind === "reading" ? (
          <PendingActionWords words="Reading the relays…" />
        ) : (
          <RefusalLine lead="The runtime didn't list its relays:" words={section.refusal} />
        )}
      </>
    );
  }

  const removalConfirmation = relayTheRemoveQuestionNames === null ? null : presentRelayRemovalConfirmation(relayTheRemoveQuestionNames);
  const askToRemove = (relayId: string) => {
    setRelayTheRemoveQuestionNames(relayId);
    setIsTheRemoveQuestionOpen(true);
  };
  const removeTheRelay = (relayId: string) => {
    setIsTheRemoveQuestionOpen(false);
    setRemoveRefusal(null);
    setRelayBeingRemoved(relayId);
    relayReadings
      .removeRelay(relayId)
      .catch((rejection: unknown) => setRemoveRefusal({ relayId, words: describeBackendRejection(rejection) }))
      .finally(() => setRelayBeingRemoved(null));
  };

  return (
    <>
      <SettingsSectionExplanation>{RELAYS_SECTION_EXPLANATION}</SettingsSectionExplanation>
      {section.lastReadingRefusal !== null && <RefusalLine lead="The runtime didn't list its relays just now:" words={section.lastReadingRefusal} tone="warning" />}
      <SettingsGroup title="Local relay" description="Built into the runtime and always joined. Only its ports change." data-relays-group="local">
        {section.localRelayListenerRows.map((row) => (
          <SettingsRow
            key={row.relay.relay_id}
            leading={relayAdapterLogoOf(row.adapterNaming, "in_a_row")}
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
                <ConfigureRelayButton row={row} onPressed={() => setSettingsDialog({ kind: "configure", relayId: row.relay.relay_id })} />
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
                  onChosen={() => setSettingsDialog({ kind: "add", adapter: choice.adapter })}
                  leading={relayAdapterLogoOf(choice.adapterNaming, "in_a_menu")}
                  data-relay-adapter-choice={choice.adapter.kind}
                >
                  <RelayAdapterName adapterNaming={choice.adapterNaming} />
                </MenuItem>
              ))}
            </IconButtonMenu>
          )
        }
      >
        {section.hostedRelayRows.length === 0 ? (
          <SettingsRow label="No relays added" description={section.noAddedRelayWords} data-relay-row="" />
        ) : (
          section.hostedRelayRows.map((row) => (
            <SettingsRow
              key={row.relay.relay_id}
              leading={relayAdapterLogoOf(row.adapterNaming, "in_a_row")}
              label={
                row.adapterNameBesideTheId === null ? (
                  <SettingsMachineWords>{row.relay.relay_id}</SettingsMachineWords>
                ) : (
                  <span className="flex items-baseline gap-2">
                    <span data-relay-adapter-name="">{row.adapterNameBesideTheId}</span>
                    <SettingsMachineWords>{row.relay.relay_id}</SettingsMachineWords>
                  </span>
                )
              }
              description={row.settingsWords ?? undefined}
              refusal={removeRefusal?.relayId === row.relay.relay_id ? { lead: "Remove was refused:", words: removeRefusal.words } : null}
              data-relay-row={row.relay.relay_id}
              control={() =>
                relayBeingRemoved === row.relay.relay_id ? (
                  <PendingActionWords words="Removing…" />
                ) : (
                  <>
                    <RelayConnectionWords connection={row.connection} relay={row.relay} />
                    <ConfigureRelayButton row={row} onPressed={() => setSettingsDialog({ kind: "configure", relayId: row.relay.relay_id })} />
                    <MoreActionsMenu label={`More for ${row.relay.relay_id}`} data-relay-action="more">
                      <MenuItem icon={Trash2} isDestructive onChosen={() => askToRemove(row.relay.relay_id)} data-relay-action="remove">
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
      {settingsDialog?.kind === "add" && (
        <RelaySettingsDialog key={`add:${settingsDialog.adapter.kind}`} adapter={settingsDialog.adapter} relay={null} onClose={() => setSettingsDialog(null)} />
      )}
      {configureSubject !== null && (
        <RelaySettingsDialog
          key={`configure:${configureSubject.relay.relay_id}`}
          adapter={configureSubject.adapter}
          relay={configureSubject.relay}
          onClose={() => setSettingsDialog(null)}
        />
      )}
      <ConfirmationDialog
        isOpen={isTheRemoveQuestionOpen}
        onOpenChange={setIsTheRemoveQuestionOpen}
        onClosedCompletely={() => setRelayTheRemoveQuestionNames(null)}
        question={removalConfirmation === null ? null : { ...removalConfirmation, confirmWords: "Remove relay" }}
        isDestructive
        onConfirmed={() => {
          if (relayTheRemoveQuestionNames !== null) removeTheRelay(relayTheRemoveQuestionNames);
        }}
        data-relay-dialog="remove"
        confirmDataAttributes={{ "data-relay-action": "confirm-remove" }}
      />
    </>
  );
}
