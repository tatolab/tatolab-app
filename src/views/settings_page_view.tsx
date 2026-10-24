// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { Cpu, FolderOpen, Info, Paintbrush, RotateCw, SlidersHorizontal, SquareTerminal, type LucideIcon } from "lucide-react";
import { cn } from "cn";
import { useEffect, useState, type ReactNode } from "react";
import { Navigate, useParams } from "react-router";
import mascotImageUrl from "../assets/tato_mascot_3d.png";
import { describeBackendRejection } from "../backend/tatolab_backend";
import { ActionButton } from "../design_system/action_button";
import { CodeBlock, CommandLine } from "../design_system/code_block";
import { CopyIconButton } from "../design_system/copy_icon_button";
import { RefusalLine } from "../design_system/refusal_line";
import { SectionNavigationList } from "../design_system/section_navigation_list";
import { SegmentedChoiceControl } from "../design_system/segmented_choice_control";
import { SettingsGroup, SettingsRow } from "../design_system/settings_rows";
import { ToggleSwitch } from "../design_system/toggle_switch";
import { presentTatolabAppUpdate } from "../presentation/app_update_presentation";
import { presentCommandLineTool, presentPlatform } from "../presentation/platform_presentation";
import type { StatusTone } from "../presentation/runtime_presentation";
import {
  presentAboutVersions,
  presentCommandLineToolVersion,
  presentLoginItemsRow,
  presentOpenAtLogin,
  presentRuntimeLogFolder,
  presentRuntimeStatusRow,
  presentStreamFailureNotifications,
  restartRuntimeUnavailableBecause,
  RUNTIME_LICENCE,
  SETTINGS_SECTION_GROUPS,
  settingsSectionNamed,
  settingsSectionPath,
  TATOLAB_MCP_COMMAND,
  TATOLAB_MCP_CONFIG,
  type SettingsSection,
} from "../presentation/settings_presentation";
import type { WindowAppearance } from "../window_appearance";
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
  "command-line": SquareTerminal,
  about: Info,
};

/** A refusal shown under a row: the window's lead naming what was refused, then the refusing side's own words. */
type RowRefusal = { lead: string; words: string };

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
): { isOn: boolean; isSwitching: boolean; refusal: RowRefusal | null; onSwitched: (isOn: boolean) => void } {
  const status = useTatolabStatus();
  const [askedFor, setAskedFor] = useState<{ isOn: boolean; hasTheBackendAnswered: boolean } | null>(null);
  const [refusal, setRefusal] = useState<RowRefusal | null>(null);
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

/** An action run through the backend from a row: pending while it runs, and the refusal under the row when it is refused. */
function useRowActionThroughTheBackend(runTheAction: () => Promise<void>, refusalLead: string) {
  const [isPending, setIsPending] = useState(false);
  const [refusal, setRefusal] = useState<RowRefusal | null>(null);
  const run = () => {
    setRefusal(null);
    setIsPending(true);
    runTheAction()
      .catch((rejection: unknown) => setRefusal({ lead: refusalLead, words: describeBackendRejection(rejection) }))
      .finally(() => setIsPending(false));
  };
  return { isPending, refusal, run };
}

/** A state word's colour: only a problem is coloured, in the text tones that keep 4.5:1 on every surface. */
const STATUS_WORDS_TONE_CLASS_NAMES: Record<StatusTone, string | undefined> = {
  ok: undefined,
  progress: undefined,
  idle: undefined,
  warning: "text-warn-text",
  error: "text-danger-text",
};

function SectionPageTitle({ title, explanation }: { title: string; explanation?: ReactNode }) {
  return (
    <div>
      <h1 className="title-lg">{title}</h1>
      {explanation !== undefined && <p className="text-fg-3">{explanation}</p>}
    </div>
  );
}

function MachineWords({ children }: { children: ReactNode }) {
  return <code className="font-mono text-xs text-fg-2 select-text">{children}</code>;
}

/** A path on its own line under a row's words, so it never breaks after them. */
function PathUnderTheWords({ children }: { children: ReactNode }) {
  return (
    <span className="block break-all">
      <MachineWords>{children}</MachineWords>
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
      <SectionPageTitle title="General" />
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
      <SectionPageTitle title="Appearance" />
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
  const restartRuntime = useRowActionThroughTheBackend(() => backend.restartRuntime(), "Couldn't restart the runtime:");
  const runtimeLogFolder = presentRuntimeLogFolder(status, runtimeDescription);
  const openRuntimeLogFolder = useRowActionThroughTheBackend(() => backend.openRuntimeLogFolder(), "Couldn't open the runtime's log folder:");
  const runTatolabSwitch = useSwitchSetThroughTheBackend(
    status.run_tatolab,
    (isOn) => backend.setRunTatolab(isOn),
    (isOn) => `Couldn't turn Run Tatolab ${isOn ? "on" : "off"}:`,
  );
  const streamRecordsDirectory = platformPresentation.streamRecordsDirectory;
  return (
    <>
      <SectionPageTitle
        title="Runtime"
        explanation={
          <>
            The tatolabd process that runs your streams on{" "}
            {status.machine_name === null ? platformPresentation.thisMachineMidSentence : <MachineWords>{status.machine_name}</MachineWords>}.
          </>
        }
      />
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
          description={<MachineWords>{status.local_api_socket}</MachineWords>}
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
  const { platform } = useTatolabWindowEnvironment();
  const status = useTatolabStatus();
  const linkedAt = status.command_line_tool_linked_at;
  const commandLineTool = presentCommandLineTool(platform, linkedAt);
  const commandLineToolVersion = presentCommandLineToolVersion(status.command_line_tool_version, commandLineTool.isLinked);
  return (
    <>
      <SectionPageTitle title="Command line" explanation="Everything in this app is also a tatolab command." />
      <SettingsGroup>
        <SettingsRow
          label={<MachineWords>tatolab</MachineWords>}
          description={
            <>
              {commandLineTool.isLinked ? (
                <span className="block" title={linkedAt ?? undefined}>
                  <MachineWords>{commandLineTool.shownValue}</MachineWords>
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
        />
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
  const checkForUpdates = useRowActionThroughTheBackend(() => backend.checkForTatolabAppUpdates(), "Couldn't update Tatolab:");
  const versions = presentAboutVersions(status, runtimeDescription);
  return (
    <div className="flex flex-col items-center gap-6 pt-6 text-center" data-settings-about="">
      <div className="flex flex-col items-center">
        <img src={mascotImageUrl} alt="" className="size-24" />
        <h1 className="mt-3 title-lg">Tatolab</h1>
        <p className="text-fg-3 tabular select-text">{versions}</p>
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
        <br />© 2025 Jonathan Fontanez
      </p>
    </div>
  );
}

const SECTION_VIEWS: Record<SettingsSection, () => ReactNode> = {
  general: GeneralSection,
  appearance: AppearanceSection,
  runtime: RuntimeSection,
  "command-line": CommandLineSection,
  about: AboutSection,
};

/** Settings: its sections listed on the left, the one its path names on the right. */
export function SettingsPageView() {
  const { settingsSection } = useParams();
  const shownSection = settingsSectionNamed(settingsSection);
  if (settingsSection !== shownSection) return <Navigate to={settingsSectionPath(shownSection)} replace />;
  const ShownSectionView = SECTION_VIEWS[shownSection];
  return (
    <div className="flex min-h-0 flex-1" data-settings-page={shownSection}>
      <SectionNavigationList
        label="Settings"
        dataAttributeOfEachSection="data-settings-section"
        sectionGroups={SETTINGS_SECTION_GROUPS.map(({ groupLabel, sections }) => ({
          groupLabel,
          sections: sections.map(({ section, label }) => ({ path: settingsSectionPath(section), label, icon: SECTION_ICONS[section], dataValue: section })),
        }))}
      />
      <div className="scrollbar-thin min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-[680px] flex-col gap-6 px-8 pt-6 pb-12">
          <ShownSectionView />
        </div>
      </div>
    </div>
  );
}
