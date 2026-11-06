import type { CarriedRuntime } from "./carried_runtime.js";
import type { TatolabCommandLineToolLink } from "./command_line_tool_link_in_the_home_folder.js";
import type { TatolabAppOpenedAtLogin } from "./tatolab_app_opened_at_login.js";
import type { TatolabAppUpdatePackaging } from "./tatolab_app_update_packaging.js";
import type { TatolabCommandLineTool } from "./tatolab_command_line_tool.js";
import type { TerminalOpenedInAFolder } from "./terminal_opened_in_a_folder.js";
import type { AppLoginItemSettings } from "./macos/login_item_of_the_app_bundle.js";

/** What this build's platform hands the app's controller. */
export interface TatolabPlatformForThisBuild {
  /** The runtime the app runs as its child; `null` in an unpackaged app, which carries none. */
  carriedRuntime: CarriedRuntime | null;
  /** `~/.local/bin/tatolab`, linked to the CLI the app carries. */
  commandLineToolLink: TatolabCommandLineToolLink;
  localApiSocket: string;
  appUpdatePackaging: TatolabAppUpdatePackaging;
  /** The desktop's terminal, which the window's Terminal opens on a stream's project folder. */
  terminalOpenedInAFolder: TerminalOpenedInAFolder;
  /** The `tatolab` CLI the build carries, whose version Settings › Command line reads. */
  tatolabCommandLineTool: TatolabCommandLineTool;
  /** "Open Tato Studio at login": the bundle's login item on macOS, an XDG autostart entry on Linux; not offered by an unpackaged app. */
  tatolabAppOpenedAtLogin: TatolabAppOpenedAtLogin;
}

/** What a platform takes from the app around it to build its items. */
export interface TatolabPlatformHostServices {
  /** The person's home folder, under which `tatolab` is linked. */
  homeDirectory: string;
  /** The app binary's path, by which macOS finds its bundle and the runtime in it. */
  appExecutable: string;
  /** Whether the app runs from its own bundle or package; an unpackaged app runs from Electron's and carries no runtime. */
  appIsPackaged: boolean;
  /** The packaged app's resources folder, `process.resourcesPath`, where Linux finds the runtime it carries. */
  appResourcesDirectory: string;
  /** Electron's login-item settings for the app's own bundle, which only macOS has. */
  appLoginItemSettings: AppLoginItemSettings;
}
