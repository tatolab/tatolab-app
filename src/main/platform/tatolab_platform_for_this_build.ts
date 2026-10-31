import type { BundledPythonToolchain } from "./bundled_python_toolchain.js";
import type { BundledRuntimeRestart, RuntimeAgentRegistration } from "./runtime_agent_registration.js";
import type { TatolabCommandLineToolLinks } from "./tatolab_command_line_tool_links.js";
import type { TatolabAppOpenedAtLogin } from "./tatolab_app_opened_at_login.js";
import type { TatolabAppUpdatePackaging } from "./tatolab_app_update_packaging.js";
import type { TatolabCommandLineTool } from "./tatolab_command_line_tool.js";
import type { TatolabUninstall } from "./tatolab_uninstall.js";
import type { TerminalOpenedInAFolder } from "./terminal_opened_in_a_folder.js";
import type { AppLoginItemSettings } from "./macos/login_item_of_the_app_bundle.js";
import type { TatolabUninstallAppSurface } from "./macos/tatolab_uninstall_on_this_mac.js";

/** What this build's platform hands the app's controller. */
export interface TatolabPlatformForThisBuild {
  runtimeAgent: RuntimeAgentRegistration;
  commandLineToolLinks: TatolabCommandLineToolLinks;
  localApiSocket: string;
  tatolabUninstall: TatolabUninstall;
  appUpdatePackaging: TatolabAppUpdatePackaging;
  /** The restart of the runtime the app's bundle carries; `null` where the app carries no runtime (Linux, whose installer installs it). */
  bundledRuntimeRestart: BundledRuntimeRestart | null;
  /** The desktop's terminal, which the window's Terminal opens on a stream's project folder. */
  terminalOpenedInAFolder: TerminalOpenedInAFolder;
  /** The `tatolab` CLI the build carries, whose version Settings › Command line reads. */
  tatolabCommandLineTool: TatolabCommandLineTool;
  /** "Open Tatolab at login": the bundle's login item on macOS, an XDG autostart entry on Linux; not offered by an unpackaged app. */
  tatolabAppOpenedAtLogin: TatolabAppOpenedAtLogin;
  /** The uv and built-in Python the app makes a project's `.venv` with; not offered by an unpackaged app. */
  bundledPythonToolchain: BundledPythonToolchain;
}

/** What a platform takes from the app around it to build its items; Linux takes only whether the app is packaged and its binary. */
export interface TatolabPlatformHostServices {
  /** The person's home folder, where macOS links the `tatolab` command. */
  homeDirectory: string;
  /** The app's root, under which an unpackaged app finds its Service Management addon. */
  appPath: string;
  /** The app binary's path, by which macOS finds its bundle and the CLI in it. */
  appExecutable: string;
  /** Whether the app runs from its own bundle; an unpackaged app runs from Electron's, which is never uninstalled. */
  appIsPackaged: boolean;
  /** The app's own config directory, named for `TATOLAB_APP_IDENTIFIER`. */
  appConfigDirectory: string;
  /** The packaged app's resources folder, `process.resourcesPath`, where Linux finds the app's uv and built-in Python. */
  appResourcesDirectory: string;
  /** The Trash and quitting, which uninstalling ends with. */
  tatolabUninstallAppSurface: TatolabUninstallAppSurface;
  /** Electron's login-item settings for the app's own bundle, which only macOS has. */
  appLoginItemSettings: AppLoginItemSettings;
}
