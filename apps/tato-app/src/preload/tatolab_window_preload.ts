import { contextBridge, ipcRenderer, sharedTexture, webUtils, type IpcRendererEvent } from "electron";
import type { OpenProjectReading, ProjectTransactionsReading, PortViewerEvent, PortViewerImageFrameFacts, PythonLanguageServerEvent, TatolabStatus } from "../shared/tatolab_backend_contract.js";
import {
  TATOLAB_COMMAND_NAMES,
  TATOLAB_MODULE_MANAGER_SECTION_ASKED_EVENT,
  TATOLAB_OPEN_PROJECT_CHANGED_EVENT,
  TATOLAB_PROJECT_TRANSACTIONS_CHANGED_EVENT,
  TATOLAB_PORT_VIEWER_EVENT,
  TATOLAB_PYTHON_LANGUAGE_SERVER_EVENT,
  TATOLAB_STATUS_CHANGED_EVENT,
  TATOLAB_STREAM_GRAPH_CHANGED_EVENT,
  TATOLAB_STREAM_PAGE_REQUESTED_EVENT,
  TATOLAB_SYSTEM_MENU_BAR_ENTRY_CHOSEN_EVENT,
  TATOLAB_WINDOW_DREW_ITS_FIRST_STATUS_NOTICE,
  isAModuleManagerSectionAsked,
  isAStreamGraphChanged,
  isASystemMenuBarEntryChosen,
  isATatolabStreamPageRequest,
  isPortViewerImageFrameFacts,
  type PortViewerVideoFrame,
  type TatolabElectronBridge,
} from "../shared/tatolab_electron_bridge_contract.js";

/** Whether the main process answered in the contract's shape: `{ ok: true, value }`, or `{ ok: false, refusal }` with the refusal in words. */
function isATatolabCommandAnswer(mainProcessAnswer: unknown): boolean {
  if (typeof mainProcessAnswer !== "object" || mainProcessAnswer === null || !("ok" in mainProcessAnswer)) return false;
  if (mainProcessAnswer.ok === true) return "value" in mainProcessAnswer;
  return mainProcessAnswer.ok === false && "refusal" in mainProcessAnswer && typeof mainProcessAnswer.refusal === "string";
}

const portViewerImageFrameListeners = new Set<(videoFrame: PortViewerVideoFrame, frameFacts: PortViewerImageFrameFacts) => void>();

// Each listener gets a VideoFrame of its own to close; the imported texture is released at once, since the VideoFrames hold it.
sharedTexture.setSharedTextureReceiver(async ({ importedSharedTexture }, frameFacts: unknown) => {
  const videoFrame = importedSharedTexture.getVideoFrame();
  importedSharedTexture.release();
  const listeners = [...portViewerImageFrameListeners];
  if (!isPortViewerImageFrameFacts(frameFacts) || listeners.length === 0) {
    videoFrame.close();
    return;
  }
  for (const listener of listeners.slice(1)) listener(videoFrame.clone(), frameFacts);
  listeners[0]?.(videoFrame, frameFacts);
});

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
  onStreamGraphChanged: (listener) => {
    const streamGraphChangedListener = (_streamGraphChangedEvent: IpcRendererEvent, streamGraphChanged: unknown) => {
      if (isAStreamGraphChanged(streamGraphChanged)) listener(streamGraphChanged.stream);
    };
    ipcRenderer.on(TATOLAB_STREAM_GRAPH_CHANGED_EVENT, streamGraphChangedListener);
    return () => {
      ipcRenderer.removeListener(TATOLAB_STREAM_GRAPH_CHANGED_EVENT, streamGraphChangedListener);
    };
  },
  onOpenProjectChanged: (listener) => {
    const openProjectChangedListener = (_openProjectChangedEvent: IpcRendererEvent, reading: OpenProjectReading) => listener(reading);
    ipcRenderer.on(TATOLAB_OPEN_PROJECT_CHANGED_EVENT, openProjectChangedListener);
    return () => {
      ipcRenderer.removeListener(TATOLAB_OPEN_PROJECT_CHANGED_EVENT, openProjectChangedListener);
    };
  },
  onModuleManagerSectionAsked: (listener) => {
    const moduleManagerSectionAskedListener = (_moduleManagerSectionAskedEvent: IpcRendererEvent, sectionAsked: unknown) => {
      if (isAModuleManagerSectionAsked(sectionAsked)) listener(sectionAsked.shows);
    };
    ipcRenderer.on(TATOLAB_MODULE_MANAGER_SECTION_ASKED_EVENT, moduleManagerSectionAskedListener);
    return () => {
      ipcRenderer.removeListener(TATOLAB_MODULE_MANAGER_SECTION_ASKED_EVENT, moduleManagerSectionAskedListener);
    };
  },
  onProjectTransactionsChanged: (listener) => {
    const projectTransactionsChangedListener = (_projectTransactionsChangedEvent: IpcRendererEvent, reading: ProjectTransactionsReading) => listener(reading);
    ipcRenderer.on(TATOLAB_PROJECT_TRANSACTIONS_CHANGED_EVENT, projectTransactionsChangedListener);
    return () => {
      ipcRenderer.removeListener(TATOLAB_PROJECT_TRANSACTIONS_CHANGED_EVENT, projectTransactionsChangedListener);
    };
  },
  onPythonLanguageServerEvent: (listener) => {
    const pythonLanguageServerEventListener = (_pythonLanguageServerEvent: IpcRendererEvent, event: PythonLanguageServerEvent) => listener(event);
    ipcRenderer.on(TATOLAB_PYTHON_LANGUAGE_SERVER_EVENT, pythonLanguageServerEventListener);
    return () => {
      ipcRenderer.removeListener(TATOLAB_PYTHON_LANGUAGE_SERVER_EVENT, pythonLanguageServerEventListener);
    };
  },
  onPortViewerEvent: (listener) => {
    const portViewerEventListener = (_portViewerEvent: IpcRendererEvent, event: PortViewerEvent) => listener(event);
    ipcRenderer.on(TATOLAB_PORT_VIEWER_EVENT, portViewerEventListener);
    return () => {
      ipcRenderer.removeListener(TATOLAB_PORT_VIEWER_EVENT, portViewerEventListener);
    };
  },
  onPortViewerImageFrame: (listener) => {
    portViewerImageFrameListeners.add(listener);
    return () => {
      portViewerImageFrameListeners.delete(listener);
    };
  },
  onSystemMenuBarEntryChosen: (listener) => {
    const systemMenuBarEntryChosenListener = (_systemMenuBarEntryChosenEvent: IpcRendererEvent, entryChosen: unknown) => {
      if (isASystemMenuBarEntryChosen(entryChosen)) listener(entryChosen.entry_id);
    };
    ipcRenderer.on(TATOLAB_SYSTEM_MENU_BAR_ENTRY_CHOSEN_EVENT, systemMenuBarEntryChosenListener);
    return () => {
      ipcRenderer.removeListener(TATOLAB_SYSTEM_MENU_BAR_ENTRY_CHOSEN_EVENT, systemMenuBarEntryChosenListener);
    };
  },
  tellTheAppTheWindowDrewItsFirstStatus: () => {
    ipcRenderer.send(TATOLAB_WINDOW_DREW_ITS_FIRST_STATUS_NOTICE);
  },
  // A sandboxed renderer's `File` carries no path; only the preload's `webUtils` reads one.
  pathOfADroppedFile: (droppedFile) => webUtils.getPathForFile(droppedFile),
};

contextBridge.exposeInMainWorld("tatolabElectronBridge", tatolabElectronBridge);
