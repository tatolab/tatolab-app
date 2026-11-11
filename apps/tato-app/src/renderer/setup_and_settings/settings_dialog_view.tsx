import { Code, Cpu, FolderOpen, Info, RotateCw, SlidersHorizontal, SquareTerminal, type LucideIcon } from "lucide-react";
import { cn } from "cn";
import { useEffect, useState, type ReactNode } from "react";
import { describeBackendRejection } from "../backend/tatolab_backend";
import { ActionButton } from "@tatolab/tato-app-view-sdk/design_system/action_button";
import { CodeBlock, CommandLine } from "@tatolab/tato-app-view-sdk/design_system/code_block";
import { CopyIconButton } from "@tatolab/tato-app-view-sdk/design_system/copy_icon_button";
import { PendingActionWords } from "@tatolab/tato-app-view-sdk/design_system/pending_action_words";
import { RefusalLine } from "@tatolab/tato-app-view-sdk/design_system/refusal_line";
import { SectionedDialog } from "@tatolab/tato-app-view-sdk/design_system/sectioned_dialog";
import { SettingsGroup, SettingsMachineWords, SettingsRow, SettingsSectionExplanation } from "@tatolab/tato-app-view-sdk/design_system/settings_rows";
import { ToggleSwitch } from "@tatolab/tato-app-view-sdk/design_system/toggle_switch";
import { presentTatolabAppUpdate } from "../presentation/app_update_presentation";
import { presentCommandLineTool, presentPlatform } from "../presentation/platform_presentation";
import type { StatusTone } from "../presentation/runtime_presentation";
import {
  presentAboutBuild,
  presentAboutCopyright,
  presentAboutVersions,
  presentCommandLineToolVersion,
  presentOpenAtLogin,
  presentRuntimeLogFolder,
  presentRuntimeStatusRow,
  presentStreamFailureNotifications,
  DEVELOPER_MODE_DESCRIPTION,
  restartRuntimeUnavailableBecause,
  RUNTIME_LICENCE,
  SETTINGS_SECTION_GROUPS,
  TATOLAB_MCP_COMMAND,
  TATOLAB_MCP_CONFIG,
  type SettingsSection,
} from "../presentation/settings_presentation";
import { useActionThroughTheBackend, type BackendActionRefusal } from "./action_through_the_backend";
import { useRuntimeDescriptionReading, useTatolabStatus, useTatolabWindowEnvironment } from "./tatolab_window_context";

const SECTION_ICONS: Record<SettingsSection, LucideIcon> = {
  general: SlidersHorizontal,
  developer: Code,
  runtime: Cpu,
  "command-line": SquareTerminal,
  about: Info,
};

/** How long a switch the backend accepted holds its asked-for position when no status follows: the app publishes only a status that changed. */
const SWITCH_HELD_WITHOUT_A_FOLLOWING_STATUS_MILLISECONDS = 3_000;

/**
 * A switch set through the backend: it shows the asked-for position at once and holds it until the status that follows
 * the backend's answer arrives, or a status round's time passes with none; then the status is its position again. A
 * refused change goes back to the status's position, with the refusal.
 */
function useSwitchSetThroughTheBackend(
  isOnInTheStatus: boolean,
  switchItThroughTheBackend: (isOn: boolean) => Promise<void>,
  refusalLead: (isOn: boolean) => string,
): { isOn: boolean; isSwitching: boolean; refusal: BackendActionRefusal | null; onSwitched: (isOn: boolean) => void } {
  const status = useTatolabStatus();
  const [askedFor, setAskedFor] = useState<{ isOn: boolean; hasTheBackendAnswered: boolean } | null>(null);
  const [refusal, setRefusal] = useState<BackendActionRefusal | null>(null);
  useEffect(() => {
    setAskedFor((stillAskedFor) => (stillAskedFor?.hasTheBackendAnswered === true ? null : stillAskedFor));
  }, [status]);
  const hasTheBackendAnswered = askedFor?.hasTheBackendAnswered === true;
  useEffect(() => {
    if (!hasTheBackendAnswered) return;
    const settleOnTheStatusTimer = window.setTimeout(() => setAskedFor(null), SWITCH_HELD_WITHOUT_A_FOLLOWING_STATUS_MILLISECONDS);
    return () => window.clearTimeout(settleOnTheStatusTimer);
  }, [hasTheBackendAnswered]);
  const onSwitched = (isOn: boolean) => {
    setRefusal(null);
    setAskedFor({ isOn, hasTheBackendAnswered: false });
    switchItThroughTheBackend(isOn).then(
      () => setAskedFor((stillAskedFor) => stillAskedFor && { ...stillAskedFor, hasTheBackendAnswered: true }),
      (rejection: unknown) => {
        setAskedFor(null);
        setRefusal({ lead: refusalLead(isOn), words: describeBackendRejection(rejection) });
      },
    );
  };
  return { isOn: askedFor?.isOn ?? isOnInTheStatus, isSwitching: askedFor?.hasTheBackendAnswered === false, refusal, onSwitched };
}

/** A state word's colour: only a problem is coloured, in the text tones that keep 4.5:1 on every surface. */
const STATUS_WORDS_TONE_CLASS_NAMES: Record<StatusTone, string | undefined> = {
  ok: undefined,
  progress: undefined,
  idle: undefined,
  warning: "text-warn-text",
  error: "text-danger-text",
};

/** A path on its own line under a row's words, so it never breaks after them. */
function PathUnderTheWords({ children }: { children: ReactNode }) {
  return (
    <span className="block break-all">
      <SettingsMachineWords>{children}</SettingsMachineWords>
    </span>
  );
}

function GeneralSection() {
  const { backend, platform } = useTatolabWindowEnvironment();
  const status = useTatolabStatus();
  const platformPresentation = presentPlatform(platform);
  const openAtLogin = presentOpenAtLogin(status.open_at_login, platform);
  const openAtLoginSwitch = useSwitchSetThroughTheBackend(
    openAtLogin.isSwitchedOn ?? false,
    (isOn) => backend.setOpenTatolabAtLogin(isOn),
    (isOn) => `Couldn't ${isOn ? "add Tato Studio to" : "remove Tato Studio from"} your login items:`,
  );
  const streamFailureNotifications = presentStreamFailureNotifications(status.stream_failure_notifications);
  const notificationsSwitch = useSwitchSetThroughTheBackend(
    streamFailureNotifications.isSwitchedOn,
    (isOn) => backend.setStreamFailureNotifications(isOn),
    (isOn) => `Couldn't turn notifications ${isOn ? "on" : "off"}:`,
  );
  return (
    <>
      <SettingsGroup>
        <SettingsRow
          label="Open Tato Studio at login"
          description={openAtLogin.description}
          refusal={openAtLoginSwitch.refusal}
          data-settings-row="open-at-login"
          control={({ labelId, descriptionId }) => (
            <>
              {openAtLogin.isSwitchedOn !== null && (
                <ToggleSwitch
                  isOn={openAtLoginSwitch.isOn}
                  isDisabled={openAtLoginSwitch.isSwitching}
                  onSwitched={openAtLoginSwitch.onSwitched}
                  labelledBy={labelId}
                  describedBy={descriptionId}
                  data-settings-switch="open-at-login"
                />
              )}
            </>
          )}
        />
      </SettingsGroup>
      <SettingsGroup title="Notifications">
        <SettingsRow
          label="When a stream fails"
          description={streamFailureNotifications.description}
          refusal={notificationsSwitch.refusal}
          data-settings-row="stream-failure-notifications"
          control={({ labelId, descriptionId }) => (
            <ToggleSwitch
              isOn={notificationsSwitch.isOn}
              isDisabled={notificationsSwitch.isSwitching}
              onSwitched={notificationsSwitch.onSwitched}
              labelledBy={labelId}
              describedBy={descriptionId}
              data-settings-switch="stream-failure-notifications"
            />
          )}
        />
      </SettingsGroup>
      <SettingsGroup title="Quit">
        <SettingsRow
          label="Quit Tato Studio"
          description={platformPresentation.quitTatolabExplanation}
          control={() => <ActionButton onPressed={() => void backend.quitTatolabApp()}>Quit Tato Studio</ActionButton>}
        />
      </SettingsGroup>
    </>
  );
}

function DeveloperSection() {
  const { backend } = useTatolabWindowEnvironment();
  const status = useTatolabStatus();
  const developerModeSwitch = useSwitchSetThroughTheBackend(
    status.developer_mode,
    (isOn) => backend.setDeveloperMode(isOn),
    (isOn) => `Couldn't turn Developer mode ${isOn ? "on" : "off"}:`,
  );
  return (
    <SettingsGroup>
      <SettingsRow
        label="Developer mode"
        description={DEVELOPER_MODE_DESCRIPTION}
        refusal={developerModeSwitch.refusal}
        data-settings-row="developer-mode"
        control={({ labelId, descriptionId }) => (
          <ToggleSwitch
            isOn={developerModeSwitch.isOn}
            isDisabled={developerModeSwitch.isSwitching}
            onSwitched={developerModeSwitch.onSwitched}
            labelledBy={labelId}
            describedBy={descriptionId}
            data-settings-switch="developer-mode"
          />
        )}
      />
    </SettingsGroup>
  );
}

function RuntimeSection() {
  const { backend, platform } = useTatolabWindowEnvironment();
  const status = useTatolabStatus();
  const runtimeDescription = useRuntimeDescriptionReading();
  const platformPresentation = presentPlatform(platform);
  const runtimeStatusRow = presentRuntimeStatusRow(status, runtimeDescription);
  const restartUnavailableBecause = restartRuntimeUnavailableBecause(status);
  const restartRuntime = useActionThroughTheBackend(() => backend.restartRuntime(), "Couldn't restart the runtime:");
  const runtimeLogFolder = presentRuntimeLogFolder(status, runtimeDescription);
  const openRuntimeLogFolder = useActionThroughTheBackend(() => backend.openRuntimeLogFolder(), "Couldn't open the runtime's log folder:");
  const streamRecordsDirectory = platformPresentation.streamRecordsDirectory;
  return (
    <>
      <SettingsSectionExplanation>
        The tatolabd process that runs your streams on{" "}
        {status.machine_name === null ? platformPresentation.thisMachineMidSentence : <SettingsMachineWords>{status.machine_name}</SettingsMachineWords>}.
      </SettingsSectionExplanation>
      <SettingsGroup>
        <SettingsRow
          label="Status"
          description={
            <>
              <span className={cn("tabular", STATUS_WORDS_TONE_CLASS_NAMES[runtimeStatusRow.tone])} data-runtime-status-words="">
                {runtimeStatusRow.statusWords}
              </span>
              {runtimeStatusRow.problemExplanation !== null && <span className="block">{runtimeStatusRow.problemExplanation}</span>}
            </>
          }
          refusal={restartRuntime.refusal}
          data-settings-row="runtime-status"
          control={() => (
            <ActionButton
              icon={RotateCw}
              isDisabled={restartUnavailableBecause !== null || restartRuntime.isPending}
              tooltip={restartUnavailableBecause ?? undefined}
              onPressed={restartRuntime.run}
              data-runtime-action="restart"
            >
              {restartRuntime.isPending ? "Restarting…" : "Restart runtime"}
            </ActionButton>
          )}
        >
          {runtimeStatusRow.refusal !== null && <RefusalLine lead="The runtime didn't describe itself:" words={runtimeStatusRow.refusal} tone="warning" />}
        </SettingsRow>
        <SettingsRow
          label="Local API socket"
          description={<SettingsMachineWords>{status.local_api_socket}</SettingsMachineWords>}
          control={() => <CopyIconButton label="Copy the local API socket's path" readTextToCopy={() => status.local_api_socket} />}
        />
      </SettingsGroup>
      <SettingsGroup title="Logs">
        <SettingsRow
          label="Runtime logs"
          description={
            <>
              What tatolabd writes.
              {runtimeLogFolder.folder !== null && <PathUnderTheWords>{runtimeLogFolder.folder}</PathUnderTheWords>}
            </>
          }
          refusal={openRuntimeLogFolder.refusal}
          data-settings-row="runtime-logs"
          control={() => (
            <ActionButton
              icon={FolderOpen}
              isDisabled={runtimeLogFolder.openUnavailableBecause !== null || openRuntimeLogFolder.isPending}
              tooltip={runtimeLogFolder.openUnavailableBecause ?? undefined}
              onPressed={openRuntimeLogFolder.run}
              data-runtime-action="open-logs-folder"
            >
              Open logs folder
            </ActionButton>
          )}
        />
        <SettingsRow
          label="Stream records"
          description={
            <>
              Each stream's record, kept between launches.
              <PathUnderTheWords>{streamRecordsDirectory}</PathUnderTheWords>
            </>
          }
          control={() => <CopyIconButton label="Copy the stream records' folder" readTextToCopy={() => streamRecordsDirectory} />}
        />
      </SettingsGroup>
    </>
  );
}

function CommandLineSection() {
  const { backend, platform } = useTatolabWindowEnvironment();
  const status = useTatolabStatus();
  const commandLineTool = presentCommandLineTool(platform, status.command_line_tool_link);
  const { linkedAt } = commandLineTool;
  const commandLineToolVersion = presentCommandLineToolVersion(status.command_line_tool_version, linkedAt !== null);
  const linkTheCommandLineTool = useActionThroughTheBackend(() => backend.linkCommandLineTool(), "tatolab wasn't linked:");
  return (
    <>
      <SettingsSectionExplanation>Everything in this app is also a tatolab command.</SettingsSectionExplanation>
      <SettingsGroup>
        <SettingsRow
          label={<SettingsMachineWords>tatolab</SettingsMachineWords>}
          description={
            <>
              {linkedAt !== null ? (
                <span className="block" title={linkedAt ?? undefined}>
                  <SettingsMachineWords>{commandLineTool.shownValue}</SettingsMachineWords>
                </span>
              ) : (
                <span className="block text-fg-2">{commandLineTool.shownValue}</span>
              )}
              {commandLineTool.explanation}
              {linkedAt !== null && (
                <>
                  {" "}
                  Try <code>tatolab streams</code>.
                </>
              )}
              {commandLineToolVersion.unreadableLine !== null && <span className="block">{commandLineToolVersion.unreadableLine}</span>}
            </>
          }
          refusal={linkTheCommandLineTool.refusal}
          data-settings-row="command-line-tool"
          control={() => (
            <>
              {commandLineToolVersion.version !== null && <span className="font-mono text-xs text-fg-2 tabular">{commandLineToolVersion.version}</span>}
              {linkedAt !== null && <CopyIconButton label="Copy the tatolab command's path" readTextToCopy={() => linkedAt} />}
              {commandLineTool.isLinkOffered &&
                (linkTheCommandLineTool.isPending ? (
                  <PendingActionWords words="Linking…" />
                ) : (
                  <ActionButton onPressed={linkTheCommandLineTool.run} data-settings-action="link-command-line-tool">
                    Link tatolab
                  </ActionButton>
                ))}
            </>
          )}
        >
          {commandLineTool.pathLineToAdd !== null && (
            <div className="flex flex-col gap-1.5" data-command-line-path-line="">
              <p className="text-xs text-fg-3">{commandLineTool.pathLineToAdd.lead}</p>
              <CommandLine command={commandLineTool.pathLineToAdd.line} />
            </div>
          )}
        </SettingsRow>
      </SettingsGroup>
      <SettingsGroup title="Coding agents" description="The MCP server: it serves this runtime to a coding agent over stdio.">
        <div className="flex flex-col gap-3 px-4 py-3">
          <CommandLine command={TATOLAB_MCP_COMMAND} data-coding-agent-command="" />
          <div className="flex flex-col gap-2">
            <p className="text-xs text-fg-3">Add it to your agent's MCP config.</p>
            <CodeBlock fileName=".mcp.json" code={TATOLAB_MCP_CONFIG} data-coding-agent-config="" />
          </div>
        </div>
      </SettingsGroup>
    </>
  );
}

function AboutSection() {
  const { backend } = useTatolabWindowEnvironment();
  const status = useTatolabStatus();
  const runtimeDescription = useRuntimeDescriptionReading();
  const appUpdate = presentTatolabAppUpdate(status.app_update);
  const runTheUpdateAction = useActionThroughTheBackend(
    () => (appUpdate.action?.command === "take_the_newer_version" ? backend.takeTheNewerTatolabAppVersion() : backend.checkForTatolabAppUpdates()),
    "Couldn't update Tato Studio:",
  );
  const versions = presentAboutVersions(status, runtimeDescription);
  return (
    <div className="flex flex-col items-center gap-6 pt-6 text-center" data-settings-about="">
      <div className="flex flex-col items-center">
        <h2 className="title-lg">Tato Studio</h2>
        <div className="text-fg-3 tabular select-text">
          <p>{versions}</p>
          <p data-about-build="">{presentAboutBuild(status.app_build)}</p>
        </div>
      </div>
      <div className="w-full text-left">
        <SettingsGroup>
          <SettingsRow
            label="Updates"
            description={appUpdate.description}
            refusal={runTheUpdateAction.refusal ?? (appUpdate.failure === null ? null : { lead: "The last check failed:", words: appUpdate.failure })}
            control={() =>
              appUpdate.action !== null && (
                <ActionButton isDisabled={!appUpdate.action.isEnabled || runTheUpdateAction.isPending} onPressed={runTheUpdateAction.run}>
                  {appUpdate.action.label}
                </ActionButton>
              )
            }
          />
        </SettingsGroup>
      </div>
      <p className="max-w-sm text-xs text-fg-3">
        Runtime licensed {RUNTIME_LICENCE}.
        <br />
        {presentAboutCopyright(new Date())}
      </p>
    </div>
  );
}

const SECTION_VIEWS: Record<SettingsSection, () => ReactNode> = {
  general: GeneralSection,
  developer: DeveloperSection,
  runtime: RuntimeSection,
  "command-line": CommandLineSection,
  about: AboutSection,
};

function isASettingsSection(sectionId: string): sectionId is SettingsSection {
  return sectionId in SECTION_VIEWS;
}

/** Settings over the studio, open on `shownSection` while it is not `null`: General, Developer, Runtime, Command line and About. */
export function SettingsDialogView({
  shownSection,
  onSectionChosen,
  onClosed,
}: {
  shownSection: SettingsSection | null;
  onSectionChosen: (section: SettingsSection) => void;
  onClosed: () => void;
}) {
  const ShownSectionView = SECTION_VIEWS[shownSection ?? "general"];
  return (
    <SectionedDialog
      isOpen={shownSection !== null}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClosed();
      }}
      title="Settings"
      sectionGroups={SETTINGS_SECTION_GROUPS.map(({ groupLabel, sections }) => ({
        groupLabel,
        sections: sections.map(({ section, label }) => ({ section_id: section, label, icon: SECTION_ICONS[section] })),
      }))}
      shownSectionId={shownSection ?? "general"}
      onSectionChosen={(sectionId) => {
        if (isASettingsSection(sectionId)) onSectionChosen(sectionId);
      }}
      data-settings-page={shownSection ?? "general"}
    >
      <div className="flex flex-col gap-6">
        <ShownSectionView />
      </div>
    </SectionedDialog>
  );
}
