import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import type { OpenWorkspaceReading, TatolabStatus } from "../shared/tatolab_backend_contract.js";
import {
  TATOLAB_COMMAND_NAMES,
  TATOLAB_OPEN_WORKSPACE_CHANGED_EVENT,
  TATOLAB_STATUS_CHANGED_EVENT,
  TATOLAB_STREAM_PAGE_REQUESTED_EVENT,
  TATOLAB_WINDOW_DREW_ITS_FIRST_STATUS_NOTICE,
  isATatolabStreamPageRequest,
  type TatolabElectronBridge,
} from "../shared/tatolab_electron_bridge_contract.js";

/** Whether the main process answered in the contract's shape: `{ ok: true, value }`, or `{ ok: false, refusal }` with the refusal in words. */
function isATatolabCommandAnswer(mainProcessAnswer: unknown): boolean {
  if (typeof mainProcessAnswer !== "object" || mainProcessAnswer === null || !("ok" in mainProcessAnswer)) return false;
  if (mainProcessAnswer.ok === true) return "value" in mainProcessAnswer;
  return mainProcessAnswer.ok === false && "refusal" in mainProcessAnswer && typeof mainProcessAnswer.refusal === "string";
}

const tatolabElectronBridge: TatolabElectronBridge = {
  invokeTatolabCommand: async (commandName, commandArguments) => {
    if (!TATOLAB_COMMAND_NAMES.includes(commandName)) return { ok: false, refusal: `${commandName} is not a command Tatolab answers` };
    try {
      const mainProcessAnswer = await ipcRenderer.invoke(commandName, commandArguments);
      return isATatolabCommandAnswer(mainProcessAnswer)
        ? mainProcessAnswer
        : { ok: false, refusal: `${commandName} answered something the window cannot read` };
    } catch (invokeFailure) {
      return { ok: false, refusal: invokeFailure instanceof Error ? invokeFailure.message : `${commandName} ended without an answer` };
    }
  },
  onTatolabStatusChanged: (listener) => {
    const statusChangedListener = (_statusChangedEvent: IpcRendererEvent, status: TatolabStatus) => listener(status);
    ipcRenderer.on(TATOLAB_STATUS_CHANGED_EVENT, statusChangedListener);
    return () => {
      ipcRenderer.removeListener(TATOLAB_STATUS_CHANGED_EVENT, statusChangedListener);
    };
  },
  onStreamPageRequested: (listener) => {
    const streamPageRequestedListener = (_streamPageRequestedEvent: IpcRendererEvent, streamPageRequest: unknown) => {
      if (isATatolabStreamPageRequest(streamPageRequest)) listener(streamPageRequest.stream);
    };
    ipcRenderer.on(TATOLAB_STREAM_PAGE_REQUESTED_EVENT, streamPageRequestedListener);
    return () => {
      ipcRenderer.removeListener(TATOLAB_STREAM_PAGE_REQUESTED_EVENT, streamPageRequestedListener);
    };
  },
  onOpenWorkspaceChanged: (listener) => {
    const openWorkspaceChangedListener = (_openWorkspaceChangedEvent: IpcRendererEvent, reading: OpenWorkspaceReading) => listener(reading);
    ipcRenderer.on(TATOLAB_OPEN_WORKSPACE_CHANGED_EVENT, openWorkspaceChangedListener);
    return () => {
      ipcRenderer.removeListener(TATOLAB_OPEN_WORKSPACE_CHANGED_EVENT, openWorkspaceChangedListener);
    };
  },
  tellTheAppTheWindowDrewItsFirstStatus: () => {
    ipcRenderer.send(TATOLAB_WINDOW_DREW_ITS_FIRST_STATUS_NOTICE);
  },
};

contextBridge.exposeInMainWorld("tatolabElectronBridge", tatolabElectronBridge);
