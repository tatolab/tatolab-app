import type { TatolabAppUpdateState } from "../../shared/tatolab_backend_contract";

/** Which backend command an updates control runs: check for a newer version, or take the one found or staged. */
export type TatolabAppUpdateCommand = "check_for_updates" | "take_the_newer_version";

/** An updates control's label, the command it runs, and whether it can be chosen now. */
export interface TatolabAppUpdateAction {
  label: string;
  command: TatolabAppUpdateCommand;
  isEnabled: boolean;
}

/** How Settings' Updates row reads: its description, its button (`null` for none), and a failure line (`null` for none). */
export interface TatolabAppUpdatePresentation {
  description: string;
  action: TatolabAppUpdateAction | null;
  failure: string | null;
}

/** What the Updates row says while nothing is under way. */
export const APP_UPDATE_SCHEDULE_EXPLANATION = "Tato Studio checks for a newer version at launch and once a day, and downloads it in the background.";

const CHECK_FOR_UPDATES_LABEL = "Check for Updates…";

/** The updates control for `appUpdate`, as the menus and Settings both offer it; `null` in an app that cannot update itself. */
export function presentTatolabAppUpdateAction(appUpdate: TatolabAppUpdateState): TatolabAppUpdateAction | null {
  switch (appUpdate.kind) {
    case "not_offered":
      return null;
    case "not_checked":
    case "up_to_date":
    case "failed":
      return { label: CHECK_FOR_UPDATES_LABEL, command: "check_for_updates", isEnabled: true };
    case "checking":
      return { label: "Checking for Updates…", command: "check_for_updates", isEnabled: false };
    case "available":
      return { label: appUpdate.delivery === "install_and_relaunch" ? "Download Update" : "Open Download", command: "take_the_newer_version", isEnabled: true };
    case "downloading":
      return { label: `Downloading Update… ${appUpdate.percent}%`, command: "take_the_newer_version", isEnabled: false };
    case "ready_to_restart":
      return { label: "Restart to Update", command: "take_the_newer_version", isEnabled: true };
    case "installing":
      return { label: "Restart to Update", command: "take_the_newer_version", isEnabled: false };
  }
}

/** The Updates row for `appUpdate`; a failure is shown in the updater's own words. */
export function presentTatolabAppUpdate(appUpdate: TatolabAppUpdateState): TatolabAppUpdatePresentation {
  const action = presentTatolabAppUpdateAction(appUpdate);
  switch (appUpdate.kind) {
    case "not_offered":
      return { description: appUpdate.reason, action, failure: null };
    case "not_checked":
      return { description: APP_UPDATE_SCHEDULE_EXPLANATION, action, failure: null };
    case "checking":
      return { description: "Checking for a newer Tato Studio…", action, failure: null };
    case "up_to_date":
      return { description: "Tato Studio is up to date.", action, failure: null };
    case "available":
      return {
        description:
          appUpdate.delivery === "install_and_relaunch"
            ? `Tato Studio ${appUpdate.version} is available.`
            : `Tato Studio ${appUpdate.version} is available. Its download opens in your browser.`,
        action,
        failure: null,
      };
    case "downloading":
      return { description: `Downloading Tato Studio ${appUpdate.version}… ${appUpdate.percent}%`, action, failure: null };
    case "ready_to_restart":
      return { description: `Tato Studio ${appUpdate.version} is ready. Restart to update, or it installs the next time you quit.`, action, failure: null };
    case "installing":
      return { description: `Installing Tato Studio ${appUpdate.version}. Tato Studio reopens when it's done.`, action, failure: null };
    case "failed":
      return { description: APP_UPDATE_SCHEDULE_EXPLANATION, action, failure: `Couldn't update Tato Studio: ${appUpdate.refusal}` };
  }
}

/** The menus' updates entry, right after About Tato Studio: Settings' control, its restart naming the version it installs; `null` in an app that cannot update itself. */
export function presentTatolabAppUpdateMenuEntry(appUpdate: TatolabAppUpdateState): TatolabAppUpdateAction | null {
  const action = presentTatolabAppUpdateAction(appUpdate);
  if (action === null || appUpdate.kind !== "ready_to_restart") return action;
  return { ...action, label: `Restart to Update to ${appUpdate.version}` };
}
