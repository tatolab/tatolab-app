import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { ListedRelay, RelayAdapter } from "../../shared/tatolab_backend_contract";
import { describeBackendRejection } from "../backend/tatolab_backend";
import { ActionButton } from "../design_system/action_button";
import { ConfirmationDialog } from "../design_system/confirmation_dialog";
import { FormDialog, FormDialogFooter, FormDialogRow, FormDialogRows } from "../design_system/form_dialog";
import { IconButtonMenu, MenuItem, MoreActionsMenu } from "../design_system/menus";
import { PendingActionWords } from "../design_system/pending_action_words";
import { RefusalLine } from "../design_system/refusal_line";
import { SettingsGroup, SettingsMachineWords, SettingsRow, SettingsSectionExplanation } from "../design_system/settings_rows";
import { StateWords, type StateWordsEmphasis } from "../design_system/stream_state_words";
import { TextField } from "../design_system/text_field";
import {
  presentRelaySettingsForm,
  relaySettingsDraftWithoutTypedSecrets,
  type RelaySettingFormRow,
  type RelaySettingsDraft,
} from "../presentation/relay_settings_form";
import {
  presentRelayRemovalConfirmation,
  presentRelaysSection,
  relaySettingsDialogSubjectOf,
  runtimeWordsSegmentsOf,
  type HostedRelayRow,
  type LocalRelayListenerRow,
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

/** One setting's field in a relay's form: its value, or for a held secret whether it is set and Replace…; Use default for an optional one. */
function RelaySettingRow({
  row,
  onTyped,
  onReplaceTheSecret,
  onUseItsDefault,
}: {
  row: RelaySettingFormRow;
  onTyped: (text: string) => void;
  onReplaceTheSecret: () => void;
  onUseItsDefault: () => void;
}) {
  const { formField } = row;
  const fieldId = `relay-setting-${formField.name}`;
  const describedById = `${fieldId}-description`;
  return (
    <FormDialogRow
      label={formField.label}
      labelFor={row.showsTheField ? fieldId : undefined}
      data-relay-setting={formField.name}
      below={
        <div id={describedById} className="mt-1 flex flex-col gap-1 text-xs text-fg-3">
          {formField.description !== null && (
            <p className="select-text">
              <RuntimeWords words={formField.description} />
            </p>
          )}
          {row.requiredWords !== null && <p>{row.requiredWords}</p>}
          {formField.input === "secret" && <p>Kept by the runtime and never shown again.</p>}
          {row.problem !== null && <p className="text-danger-text">{row.problem}</p>}
        </div>
      }
    >
      {!row.showsTheField ? (
        <>
          <span className="text-fg-2" data-relay-secret-presence={row.heldSecretWords ?? undefined}>
            {row.heldSecretWords}
          </span>
          <ActionButton appearance="quiet" label={row.replaceLabel} onPressed={onReplaceTheSecret} data-relay-action="replace-secret">
            {row.replaceWords}
          </ActionButton>
        </>
      ) : (
        <>
          {row.offersUseDefault && (
            <ActionButton appearance="quiet" onPressed={onUseItsDefault} data-relay-action="use-default">
              Use default
            </ActionButton>
          )}
          <TextField
            id={fieldId}
            label={formField.label}
            text={row.shownText}
            onTextChanged={onTyped}
            isMachineWord
            isSecret={formField.input === "secret"}
            isRequired={row.requiredWords !== null}
            isRefused={row.problem !== null}
            placeholder={row.placeholder ?? undefined}
            inputMode={row.inputMode}
            describedBy={describedById}
            className="w-64"
            data-relay-setting-field={formField.name}
          />
        </>
      )}
    </FormDialogRow>
  );
}

/**
 * Adding a relay of one adapter, or configuring one relay: a field for each setting its adapter's schema names, the
 * runtime's refusal in its own words, and every secret typed forgotten once the runtime has answered, whatever it answered.
 */
function RelaySettingsDialog({ adapter, relay, onClose }: { adapter: RelayAdapter; relay: ListedRelay | null; onClose: () => void }) {
  const { relayReadings } = useTatolabWindowEnvironment();
  const [draft, setDraft] = useState<RelaySettingsDraft>({});
  const [secretsBeingReplaced, setSecretsBeingReplaced] = useState<ReadonlySet<string>>(new Set());
  const [isSending, setIsSending] = useState(false);
  const [refusal, setRefusal] = useState<BackendActionRefusal | null>(null);
  const { rows: formRows, settingsToSend, sendUnavailableBecause } = presentRelaySettingsForm(adapter, relay, draft, secretsBeingReplaced);
  const forgetEverySecretTyped = () => {
    setDraft((draftNow) => relaySettingsDraftWithoutTypedSecrets(adapter, draftNow));
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
  return (
    <FormDialog
      isOpen
      onOpenChange={(isOpen) => {
        if (!isOpen && !isSending) onClose();
      }}
      title={relay === null ? "Add relay" : "Configure relay"}
      description={
        <>
          <SettingsMachineWords>{relay === null ? adapter.kind : relay.relay_id}</SettingsMachineWords> · <RuntimeWords words={adapter.doc} />
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
      {formRows.length === 0 ? (
        <p className="text-fg-3">This adapter takes no settings.</p>
      ) : (
        <FormDialogRows>
          {formRows.map((row) => (
            <RelaySettingRow
              key={row.formField.name}
              row={row}
              onTyped={(text) => setDraft((draftNow) => ({ ...draftNow, [row.formField.name]: { kind: "typed", text } }))}
              onReplaceTheSecret={() => setSecretsBeingReplaced((replacedNow) => new Set([...replacedNow, row.formField.name]))}
              onUseItsDefault={() => setDraft((draftNow) => ({ ...draftNow, [row.formField.name]: { kind: "use_default" } }))}
            />
          ))}
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
                  isDisabled={choice.unavailableBecause !== null}
                  onChosen={() => setSettingsDialog({ kind: "add", adapter: choice.adapter })}
                  data-relay-adapter-choice={choice.adapter.kind}
                >
                  <span className="flex flex-col">
                    <SettingsMachineWords tone="of_the_words_around_it">{choice.adapter.kind}</SettingsMachineWords>
                    {choice.unavailableBecause !== null && <span className="text-xs text-fg-3">{choice.unavailableBecause}</span>}
                  </span>
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
              label={<SettingsMachineWords>{row.relay.relay_id}</SettingsMachineWords>}
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
