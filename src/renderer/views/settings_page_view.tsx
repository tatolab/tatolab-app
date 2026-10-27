import { Cpu, FolderOpen, Info, Paintbrush, RadioTower, RotateCw, SlidersHorizontal, SquareTerminal, type LucideIcon } from "lucide-react";
import { cn } from "cn";
import { useEffect, useState, type ReactNode } from "react";
import { Navigate, useParams } from "react-router";
import mascotImageUrl from "../assets/tato_mascot_3d.png";
import { describeBackendRejection } from "../backend/tatolab_backend";
import { ActionButton } from "../design_system/action_button";
import { CodeBlock, CommandLine } from "../design_system/code_block";
import { CopyIconButton } from "../design_system/copy_icon_button";
import { PendingActionWords } from "../design_system/pending_action_words";
import { RefusalLine } from "../design_system/refusal_line";
import { PageBody, PageFrame } from "../design_system/page_frame";
import { PageHeader } from "../design_system/page_header";
import { SectionNavigationList } from "../design_system/section_navigation_list";
import { SegmentedChoiceControl } from "../design_system/segmented_choice_control";
import { SettingsGroup, SettingsMachineWords, SettingsRow, SettingsSectionExplanation } from "../design_system/settings_rows";
import { ToggleSwitch } from "../design_system/toggle_switch";
import { presentTatolabAppUpdate } from "../presentation/app_update_presentation";
import { presentCommandLineTool, presentPlatform, windowDragRegionAttribute } from "../presentation/platform_presentation";
import type { StatusTone } from "../presentation/runtime_presentation";
import {
  presentAboutBuild,
  presentAboutCopyright,
  presentAboutVersions,
  presentCommandLineToolVersion,
  presentLoginItemsRow,
  presentOpenAtLogin,
  presentPythonForNewEnvironments,
  presentRuntimeLogFolder,
  presentRuntimeStatusRow,
  presentStreamFailureNotifications,
  presentUsrLocalBinLink,
  restartRuntimeUnavailableBecause,
  RUNTIME_LICENCE,
  SETTINGS_SECTION_GROUPS,
  settingsSectionLabel,
  settingsSectionNamed,
  settingsSectionPath,
  TATOLAB_MCP_COMMAND,
  TATOLAB_MCP_CONFIG,
  type SettingsSection,
} from "../presentation/settings_presentation";
import type { WindowAppearance } from "../window_appearance";
import { useActionThroughTheBackend, type BackendActionRefusal } from "./action_through_the_backend";
import { RelaysSettingsSection } from "./relays_settings_section_view";
import {
  useRuntimeDescriptionReading,
  useTatolabStatus,
  useTatolabWindowEnvironment,
  useUninstallTatolabRefusalReason,
  useWindowAppearance,
} from "./tatolab_window_context";

const SECTION_ICONS: Record<SettingsSection, LucideIcon> = {
  general: SlidersHorizontal,
  appearance: Paintbrush,
  runtime: Cpu,
  relays: RadioTower,
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
  const { backend, platform, openUninstallSheet } = useTatolabWindowEnvironment();
  const status = useTatolabStatus();
  const platformPresentation = presentPlatform(platform);
  const openAtLogin = presentOpenAtLogin(status.open_at_login, platform);
  const openAtLoginSwitch = useSwitchSetThroughTheBackend(
    openAtLogin.isSwitchedOn ?? false,
    (isOn) => backend.setOpenTatolabAtLogin(isOn),
    (isOn) => `Couldn't ${isOn ? "add Tatolab to" : "remove Tatolab from"} your login items:`,
  );
  const streamFailureNotifications = presentStreamFailureNotifications(status.stream_failure_notifications);
  const notificationsSwitch = useSwitchSetThroughTheBackend(
    streamFailureNotifications.isSwitchedOn,
    (isOn) => backend.setStreamFailureNotifications(isOn),
    (isOn) => `Couldn't turn notifications ${isOn ? "on" : "off"}:`,
  );
  const uninstallRefusalReason = useUninstallTatolabRefusalReason();
  return (
    <>
      <SettingsGroup>
        <SettingsRow
          label="Open Tatolab at login"
          description={openAtLogin.description}
          refusal={openAtLoginSwitch.refusal}
          data-settings-row="open-at-login"
          control={({ labelId, descriptionId }) => (
            <>
              {openAtLogin.needsApprovalInLoginItems && (
                <ActionButton onPressed={() => void backend.openLoginItemsSettings()}>Open Login Items…</ActionButton>
              )}
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
      <SettingsGroup title="Quit or uninstall">
        <SettingsRow
          label="Quit Tatolab"
          description={platformPresentation.quitTatolabExplanation}
          control={() => <ActionButton onPressed={() => void backend.quitTatolabApp()}>Quit Tatolab</ActionButton>}
        />
        <SettingsRow
          label="Uninstall Tatolab"
          description={platformPresentation.uninstallTatolabExplanation}
          refusal={uninstallRefusalReason === null ? null : { lead: "Uninstall didn't finish:", words: uninstallRefusalReason }}
          control={() => (
            <ActionButton appearance="destructive" onPressed={openUninstallSheet} data-action="uninstall">
              Uninstall Tatolab…
            </ActionButton>
          )}
        />
      </SettingsGroup>
    </>
  );
}

const APPEARANCE_CHOICES = [
  { choice: "light", label: "Light" },
  { choice: "dark", label: "Dark" },
  { choice: "system", label: "System" },
] as const satisfies readonly { choice: WindowAppearance; label: string }[];

function AppearanceSection() {
  const { chosenAppearance, chooseAppearance } = useWindowAppearance();
  return (
    <>
      <SettingsGroup>
        <SettingsRow
          label="Theme"
          description="Light is the default."
          control={() => (
            <SegmentedChoiceControl
              label="Theme"
              choices={APPEARANCE_CHOICES}
              chosen={chosenAppearance}
              onChosen={chooseAppearance}
              dataAttributeOfEachSegment="data-window-appearance"
            />
          )}
        />
      </SettingsGroup>
    </>
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
  const runTatolabSwitch = useSwitchSetThroughTheBackend(
    status.run_tatolab,
    (isOn) => backend.setRunTatolab(isOn),
    (isOn) => `Couldn't turn Run Tatolab ${isOn ? "on" : "off"}:`,
  );
  const streamRecordsDirectory = platformPresentation.streamRecordsDirectory;
  const pythonForNewEnvironments = presentPythonForNewEnvironments(status.python_for_new_environments);
  const chooseYourOwnPython = useActionThroughTheBackend(() => backend.choosePythonForNewEnvironments("chosen_in_a_file_dialog"), "Couldn't use that Python:");
  const useTatolabsPython = useActionThroughTheBackend(() => backend.choosePythonForNewEnvironments("built_in"), "Couldn't go back to Tatolab's Python:");
  const [lastPythonChoicePressed, setLastPythonChoicePressed] = useState<"choose_your_own" | "use_tatolabs" | null>(null);
  const pythonChoiceRefusal =
    lastPythonChoicePressed === "choose_your_own" ? chooseYourOwnPython.refusal : lastPythonChoicePressed === "use_tatolabs" ? useTatolabsPython.refusal : null;
  const isAPythonChoicePending = chooseYourOwnPython.isPending || useTatolabsPython.isPending;
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
          label="Run Tatolab"
          description={platformPresentation.runTatolabExplanation}
          refusal={runTatolabSwitch.refusal}
          data-settings-row="run-tatolab"
          control={({ labelId, descriptionId }) => (
            <ToggleSwitch
              isOn={runTatolabSwitch.isOn}
              isDisabled={runTatolabSwitch.isSwitching}
              onSwitched={runTatolabSwitch.onSwitched}
              labelledBy={labelId}
              describedBy={descriptionId}
              data-settings-switch="run-tatolab"
            />
          )}
        />
        {platformPresentation.showsLoginItems && (
          <SettingsRow
            label="Login Items"
            description={presentLoginItemsRow(status)}
            control={() => <ActionButton onPressed={() => void backend.openLoginItemsSettings()}>Open Login Items…</ActionButton>}
          />
        )}
        <SettingsRow
          label="Local API socket"
          description={<SettingsMachineWords>{status.local_api_socket}</SettingsMachineWords>}
          control={() => <CopyIconButton label="Copy the local API socket's path" readTextToCopy={() => status.local_api_socket} />}
        />
      </SettingsGroup>
      <SettingsGroup title="Python">
        <SettingsRow
          label="Python for projects"
          description={
            <>
              {pythonForNewEnvironments.description}
              {pythonForNewEnvironments.chosenInterpreter !== null && <PathUnderTheWords>{pythonForNewEnvironments.chosenInterpreter}</PathUnderTheWords>}
            </>
          }
          refusal={pythonChoiceRefusal}
          data-settings-row="python-for-new-environments"
          control={() => (
            <>
              {pythonForNewEnvironments.offersTatolabsPython && (
                <ActionButton
                  isDisabled={isAPythonChoicePending}
                  onPressed={() => {
                    setLastPythonChoicePressed("use_tatolabs");
                    useTatolabsPython.run();
                  }}
                  data-settings-action="use-tatolabs-python"
                >
                  Use Tatolab's Python
                </ActionButton>
              )}
              {pythonForNewEnvironments.chooseYourOwnPythonLabel !== null && (
                <ActionButton
                  isDisabled={isAPythonChoicePending}
                  onPressed={() => {
                    setLastPythonChoicePressed("choose_your_own");
                    chooseYourOwnPython.run();
                  }}
                  data-settings-action="choose-your-own-python"
                >
                  {pythonForNewEnvironments.chooseYourOwnPythonLabel}
                </ActionButton>
              )}
            </>
          )}
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
              Each kept stream's record, which an uninstall leaves in place.
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
  const linkedAt = status.command_line_tool_linked_at;
  const commandLineTool = presentCommandLineTool(platform, linkedAt);
  const commandLineToolVersion = presentCommandLineToolVersion(status.command_line_tool_version, commandLineTool.isLinked);
  const usrLocalBinLink = presentUsrLocalBinLink(platform, status.command_line_tool_usr_local_bin_link);
  const linkInUsrLocalBin = useActionThroughTheBackend(() => backend.linkCommandLineToolInUsrLocalBin(), "tatolab wasn't linked:");
  return (
    <>
      <SettingsSectionExplanation>Everything in this app is also a tatolab command.</SettingsSectionExplanation>
      <SettingsGroup>
        <SettingsRow
          label={<SettingsMachineWords>tatolab</SettingsMachineWords>}
          description={
            <>
              {commandLineTool.isLinked ? (
                <span className="block" title={linkedAt ?? undefined}>
                  <SettingsMachineWords>{commandLineTool.shownValue}</SettingsMachineWords>
                </span>
              ) : (
                <span className="block text-fg-2">{commandLineTool.shownValue}</span>
              )}
              {commandLineTool.explanation}
              {commandLineTool.isLinked && (
                <>
                  {" "}
                  Try <code>tatolab streams</code>.
                </>
              )}
              {commandLineToolVersion.unreadableLine !== null && <span className="block">{commandLineToolVersion.unreadableLine}</span>}
            </>
          }
          data-settings-row="command-line-tool"
          control={() => (
            <>
              {commandLineToolVersion.version !== null && <span className="font-mono text-xs text-fg-2 tabular">{commandLineToolVersion.version}</span>}
              {commandLineTool.isLinked && <CopyIconButton label="Copy the tatolab command's path" readTextToCopy={() => linkedAt ?? ""} />}
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
        {usrLocalBinLink !== null && (
          <SettingsRow
            label="Link in /usr/local/bin"
            description={usrLocalBinLink.description}
            refusal={linkInUsrLocalBin.refusal}
            data-settings-row="usr-local-bin-link"
            control={() =>
              !usrLocalBinLink.isOffered ? null : linkInUsrLocalBin.isPending ? (
                <PendingActionWords words="Waiting for your password…" />
              ) : (
                <ActionButton onPressed={linkInUsrLocalBin.run} data-settings-action="link-in-usr-local-bin">
                  Link in /usr/local/bin…
                </ActionButton>
              )
            }
          />
        )}
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
  const checkForUpdates = useActionThroughTheBackend(() => backend.checkForTatolabAppUpdates(), "Couldn't update Tatolab:");
  const versions = presentAboutVersions(status, runtimeDescription);
  return (
    <div className="flex flex-col items-center gap-6 pt-6 text-center" data-settings-about="">
      <div className="flex flex-col items-center">
        <img src={mascotImageUrl} alt="" className="size-24" />
        <h2 className="mt-3 title-lg">Tatolab</h2>
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
            refusal={checkForUpdates.refusal ?? (appUpdate.failure === null ? null : { lead: "The last check failed:", words: appUpdate.failure })}
            control={() =>
              appUpdate.actionLabel !== null && (
                <ActionButton isDisabled={!appUpdate.isActionEnabled || checkForUpdates.isPending} onPressed={checkForUpdates.run}>
                  {appUpdate.actionLabel}
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
  appearance: AppearanceSection,
  runtime: RuntimeSection,
  relays: RelaysSettingsSection,
  "command-line": CommandLineSection,
  about: AboutSection,
};

/** Settings: a bar naming the section shown, over Settings' own list of its sections and the section its path names. */
export function SettingsPageView() {
  const { platform } = useTatolabWindowEnvironment();
  const { settingsSection } = useParams();
  const shownSection = settingsSectionNamed(settingsSection);
  if (settingsSection !== shownSection) return <Navigate to={settingsSectionPath(shownSection)} replace />;
  const ShownSectionView = SECTION_VIEWS[shownSection];
  return (
    <PageFrame
      header={<PageHeader breadcrumb={{ parentLabel: "Settings" }} title={settingsSectionLabel(shownSection)} windowDragRegion={windowDragRegionAttribute(platform, "deep")} />}
      data-settings-page={shownSection}
    >
      <div className="flex min-h-0 flex-1">
        <SectionNavigationList
          label="Settings"
          dataAttributeOfEachSection="data-settings-section"
          sectionGroups={SETTINGS_SECTION_GROUPS.map(({ groupLabel, sections }) => ({
            groupLabel,
            sections: sections.map(({ section, label }) => ({ path: settingsSectionPath(section), label, icon: SECTION_ICONS[section], dataValue: section })),
          }))}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <PageBody width="readable">
            <div className="flex flex-col gap-6">
              <ShownSectionView />
            </div>
          </PageBody>
        </div>
      </div>
    </PageFrame>
  );
}
