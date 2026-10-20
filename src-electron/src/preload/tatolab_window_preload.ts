// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import type { TatolabStatus } from "../../../src/backend/tatolab_backend_contract.js";
import {
  TATOLAB_COMMAND_NAMES,
  TATOLAB_STATUS_CHANGED_EVENT,
  type TatolabElectronBridge,
} from "../../../src/backend/tatolab_electron_bridge_contract.js";

const tatolabElectronBridge: TatolabElectronBridge = {
  invokeTatolabCommand: (commandName, commandArguments) =>
    TATOLAB_COMMAND_NAMES.includes(commandName)
      ? ipcRenderer.invoke(commandName, commandArguments)
      : Promise.resolve({ ok: false, refusal: `${String(commandName)} is not a command Tatolab answers` }),
  onTatolabStatusChanged: (listener) => {
    const statusChangedListener = (_statusChangedEvent: IpcRendererEvent, status: TatolabStatus) => listener(status);
    ipcRenderer.on(TATOLAB_STATUS_CHANGED_EVENT, statusChangedListener);
    return () => {
      ipcRenderer.removeListener(TATOLAB_STATUS_CHANGED_EVENT, statusChangedListener);
    };
  },
};

contextBridge.exposeInMainWorld("tatolabElectronBridge", tatolabElectronBridge);
