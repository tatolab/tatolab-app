import { failedWith } from "../../result.js";
import type { TatolabUninstall } from "../tatolab_uninstall.js";

/** Why Linux refuses "Uninstall Spudnik Studio…": its installer uninstalls, and the window's sheet shows how. */
export const LINUX_UNINSTALL_TATOLAB_REFUSAL = "On Linux the installer uninstalls Tatolab: Settings › Uninstall Spudnik Studio… shows how.";

/** "Uninstall Spudnik Studio…", refused with `LINUX_UNINSTALL_TATOLAB_REFUSAL`: the installer uninstalls what it installed. */
export const LINUX_TATOLAB_UNINSTALL: TatolabUninstall = {
  uninstallTatolab: async () => failedWith(LINUX_UNINSTALL_TATOLAB_REFUSAL),
};
