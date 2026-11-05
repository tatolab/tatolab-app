import type { TatolabAppUpdateState } from "../../shared/tatolab_backend_contract";

/** How Settings' Updates row reads: its description, its button (`null` for none), and a failure line (`null` for none). */
export interface TatolabAppUpdatePresentation {
  description: string;
  actionLabel: string | null;
  isActionEnabled: boolean;
  failure: string | null;
}

/** What the Updates row says while nothing is under way. */
export const APP_UPDATE_SCHEDULE_EXPLANATION = "Tato Studio checks for a newer version at launch and once a day.";

/** The Updates row for `appUpdate`; a failure is shown in the updater's own words. */
export function presentTatolabAppUpdate(appUpdate: TatolabAppUpdateState): TatolabAppUpdatePresentation {
  switch (appUpdate.kind) {
    case "not_offered":
      return { description: appUpdate.reason, actionLabel: null, isActionEnabled: false, failure: null };
    case "not_checked":
      return { description: APP_UPDATE_SCHEDULE_EXPLANATION, actionLabel: "Check for Updates…", isActionEnabled: true, failure: null };
    case "checking":
      return { description: "Checking for a newer Tato Studio…", actionLabel: "Check for Updates…", isActionEnabled: false, failure: null };
    case "up_to_date":
      return { description: "Tato Studio is up to date.", actionLabel: "Check for Updates…", isActionEnabled: true, failure: null };
    case "available":
      return appUpdate.delivery === "install_and_relaunch"
        ? { description: `Tato Studio ${appUpdate.version} is available.`, actionLabel: "Install and Relaunch", isActionEnabled: true, failure: null }
        : {
            description: `Tato Studio ${appUpdate.version} is available. Its download opens in your browser.`,
            actionLabel: "Open Download",
            isActionEnabled: true,
            failure: null,
          };
    case "downloading":
      return {
        description: `Downloading Tato Studio ${appUpdate.version}… ${appUpdate.percent}%`,
        actionLabel: "Install and Relaunch",
        isActionEnabled: false,
        failure: null,
      };
    case "installing":
      return {
        description: `Installing Tato Studio ${appUpdate.version}. Tato Studio reopens when it's done.`,
        actionLabel: "Install and Relaunch",
        isActionEnabled: false,
        failure: null,
      };
    case "failed":
      return {
        description: APP_UPDATE_SCHEDULE_EXPLANATION,
        actionLabel: "Check for Updates…",
        isActionEnabled: true,
        failure: `Couldn't update Tato Studio: ${appUpdate.refusal}`,
      };
  }
}
