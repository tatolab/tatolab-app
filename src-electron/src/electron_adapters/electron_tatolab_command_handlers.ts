// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { ipcMain, type IpcMainInvokeEvent } from "electron";
import { TATOLAB_COMMAND_NAMES } from "../../../src/backend/tatolab_electron_bridge_contract.js";
import type { TatolabAppLog } from "../tatolab_app_log.js";
import type { TatolabWindowCommandHandlers } from "../tatolab_commands.js";
import { isOnTheWindowPagesOwnLocation } from "../tatolab_window_page_source.js";

/** Whether `invokeEvent` came from the top frame of the window's own page at `windowPageUrl`, rather than a frame it embeds or a page it navigated to. */
function isFromTheWindowsOwnPage(windowPageUrl: string, invokeEvent: IpcMainInvokeEvent): boolean {
  const senderFrame = invokeEvent.senderFrame;
  return senderFrame !== null && senderFrame === invokeEvent.sender.mainFrame && isOnTheWindowPagesOwnLocation(windowPageUrl, senderFrame.url);
}

/** Answer each command on the IPC channel of its name, for the window's own page at `windowPageUrl` only. A handler resolves its answer rather than rejecting: Electron rewrites a rejection's message, and a refusal reaches the window in its own words. */
export function answerTheWindowsCommandsOverIpc(
  windowPageUrl: string,
  tatolabWindowCommandHandlers: TatolabWindowCommandHandlers,
  tatolabAppLog: TatolabAppLog,
): void {
  for (const commandName of TATOLAB_COMMAND_NAMES) {
    ipcMain.handle(commandName, (invokeEvent, commandArguments: unknown) => {
      if (!isFromTheWindowsOwnPage(windowPageUrl, invokeEvent)) {
        tatolabAppLog.warn("a page other than the Tatolab window invoked a command; refused", {
          command_name: commandName,
          sender_url: invokeEvent.senderFrame?.url ?? null,
        });
        return { ok: false, refusal: `${commandName} answers only the Tatolab window` };
      }
      return tatolabWindowCommandHandlers[commandName](commandArguments);
    });
  }
}
