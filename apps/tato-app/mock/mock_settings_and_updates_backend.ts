import type { TatolabBackend } from "../src/renderer/backend/tatolab_backend";
import { MOCK_COMMAND_LATENCY_MILLISECONDS } from "./mock_tatolab_simulation_constants";
import { sleep, type MockTatolabSimulation } from "./mock_tatolab_simulation";

const MOCK_UPDATE_CHECK_MILLISECONDS = 900;

/** The mock backend's settings and updates methods over `simulation`. */
export function mockSettingsAndUpdatesBackendOf(simulation: MockTatolabSimulation): Pick<TatolabBackend, "checkForTatolabAppUpdates" | "takeTheNewerTatolabAppVersion" | "answerTheAppUpdateAnnouncement" | "setStreamFailureNotifications" | "setDeveloperMode" | "dismissTheStudioWarningDialog" | "setOpenTatolabAtLogin"> {
  const { publishStatus, downloadTheNewerVersion, finishTheUpdateCheck } = simulation;
  return {
    checkForTatolabAppUpdates: async () => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      const updateUnderWay = simulation.mockStatus.app_update.kind;
      if (updateUnderWay === "checking" || updateUnderWay === "downloading" || updateUnderWay === "installing") return;
      publishStatus({ app_update: { kind: "checking" } });
      window.setTimeout(finishTheUpdateCheck, MOCK_UPDATE_CHECK_MILLISECONDS);
    },
    takeTheNewerTatolabAppVersion: async () => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      const appUpdate = simulation.mockStatus.app_update;
      if (appUpdate.kind === "ready_to_restart") {
        publishStatus({ app_update: { kind: "installing", version: appUpdate.version } });
        return;
      }
      if (appUpdate.kind === "available" && appUpdate.delivery === "install_and_relaunch") downloadTheNewerVersion(0);
    },
    answerTheAppUpdateAnnouncement: async (kind, version, answer) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      const answered = simulation.mockStatus.app_update_announcement;
      if (answered === null || answered.kind !== kind || answered.version !== version) return;
      publishStatus({ app_update_announcement: null });
      const appUpdate = simulation.mockStatus.app_update;
      if (answer === "take_its_action" && answered.kind === "update_ready" && appUpdate.kind === "ready_to_restart") publishStatus({ app_update: { kind: "installing", version: appUpdate.version } });
    },
    setStreamFailureNotifications: async (enabled) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      publishStatus({ stream_failure_notifications: { ...simulation.mockStatus.stream_failure_notifications, enabled } });
    },
    setDeveloperMode: async (enabled) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      publishStatus({ developer_mode: enabled });
    },
    dismissTheStudioWarningDialog: async (kind) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      publishStatus({ studio_warnings: simulation.mockStatus.studio_warnings.map((studioWarning) => (studioWarning.kind === kind ? { ...studioWarning, first_open_dialog_due: false } : studioWarning)) });
    },
    setOpenTatolabAtLogin: async (enabled) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      publishStatus({ open_at_login: enabled ? { kind: "on" } : { kind: "off" } });
    },
  };
}
