import { ipcMain } from "electron";
import { TATOLAB_COMMAND_NAMES } from "../../shared/tatolab_electron_bridge_contract.js";
import type { TatolabAppLog } from "../tatolab_app_log.js";
import type { TatolabWindowCommandHandlers } from "../tatolab_commands.js";
import { isACommandFromTheWindowsOwnPage } from "../tatolab_window_page_source.js";

/** Answer each command on the IPC channel of its name, for the window's own page at `windowPageUrl` only. A handler resolves its answer rather than rejecting: Electron rewrites a rejection's message, and a refusal reaches the window in its own words. */
export function answerTheWindowsCommandsOverIpc(
  windowPageUrl: string,
  tatolabWindowCommandHandlers: TatolabWindowCommandHandlers,
  tatolabAppLog: TatolabAppLog,
): void {
  for (const commandName of TATOLAB_COMMAND_NAMES) {
    ipcMain.handle(commandName, (invokeEvent, commandArguments: unknown) => {
      const senderFrame = invokeEvent.senderFrame;
      if (!isACommandFromTheWindowsOwnPage(windowPageUrl, senderFrame?.url ?? null, senderFrame === invokeEvent.sender.mainFrame)) {
        tatolabAppLog.warn("a page other than the Tatolab window invoked a command; refused", {
          command_name: commandName,
          sender_url: senderFrame?.url ?? null,
        });
        return { ok: false, refusal: `${commandName} answers only the Tato Studio window` };
      }
      return tatolabWindowCommandHandlers[commandName](commandArguments);
    });
  }
}
