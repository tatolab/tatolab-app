import { beforeEach, expect, test, vi } from "vitest";
import type { TatolabElectronBridge } from "../shared/tatolab_electron_bridge_contract.js";

const fakeElectron = vi.hoisted(() => {
  const exposedInTheMainWorld = new Map<string, unknown>();
  return {
    exposedInTheMainWorld,
    contextBridge: { exposeInMainWorld: (apiKey: string, api: unknown) => exposedInTheMainWorld.set(apiKey, api) },
    ipcRenderer: { invoke: vi.fn(), on: vi.fn(), removeListener: vi.fn() },
  };
});
vi.mock("electron", () => ({ contextBridge: fakeElectron.contextBridge, ipcRenderer: fakeElectron.ipcRenderer }));

async function exposedTatolabElectronBridge(): Promise<TatolabElectronBridge> {
  await import("./tatolab_window_preload.js");
  const exposedBridge = fakeElectron.exposedInTheMainWorld.get("tatolabElectronBridge");
  const isABridge = (candidate: unknown): candidate is TatolabElectronBridge =>
    typeof candidate === "object" && candidate !== null && "invokeTatolabCommand" in candidate && "onTatolabStatusChanged" in candidate;
  if (!isABridge(exposedBridge)) return expect.fail("the preload exposed no tatolabElectronBridge");
  return exposedBridge;
}

beforeEach(() => {
  fakeElectron.ipcRenderer.invoke.mockReset();
  fakeElectron.ipcRenderer.on.mockReset();
  fakeElectron.ipcRenderer.removeListener.mockReset();
});

test("a command is sent on its own channel with its arguments, and its answer comes back as the main process gave it", async () => {
  const tatolabElectronBridge = await exposedTatolabElectronBridge();
  fakeElectron.ipcRenderer.invoke.mockResolvedValue({ ok: true, value: null });

  expect(await tatolabElectronBridge.invokeTatolabCommand("set_run_tatolab", { enabled: true })).toEqual({ ok: true, value: null });
  expect(fakeElectron.ipcRenderer.invoke).toHaveBeenCalledWith("set_run_tatolab", { enabled: true });
});

test("a name that is not one of the eight commands is refused and never reaches the main process", async () => {
  const tatolabElectronBridge = await exposedTatolabElectronBridge();
  const invokeAsThePageMay = (commandName: string): unknown =>
    Reflect.apply(tatolabElectronBridge.invokeTatolabCommand, tatolabElectronBridge, [commandName, undefined]);

  expect(await invokeAsThePageMay("read_the_state_directory")).toEqual({
    ok: false,
    refusal: "read_the_state_directory is not a command Tatolab answers",
  });
  expect(fakeElectron.ipcRenderer.invoke).not.toHaveBeenCalled();
});

test("an answer outside the contract, or a failed invoke, reaches the page as a refusal in words", async () => {
  const tatolabElectronBridge = await exposedTatolabElectronBridge();

  fakeElectron.ipcRenderer.invoke.mockResolvedValueOnce({ ok: false, failure: "not loaded" });
  expect(await tatolabElectronBridge.invokeTatolabCommand("describe_stream_graph", { stream: "main" })).toEqual({
    ok: false,
    refusal: "describe_stream_graph answered something the window cannot read",
  });

  fakeElectron.ipcRenderer.invoke.mockRejectedValueOnce(new Error("No handler registered for 'describe_stream_graph'"));
  expect(await tatolabElectronBridge.invokeTatolabCommand("describe_stream_graph", { stream: "main" })).toEqual({
    ok: false,
    refusal: "No handler registered for 'describe_stream_graph'",
  });
});

test("each status sent reaches the listener, and stopping removes the very listener that was added", async () => {
  const tatolabElectronBridge = await exposedTatolabElectronBridge();
  const heardStatuses: unknown[] = [];

  const stopListening = tatolabElectronBridge.onTatolabStatusChanged((status) => heardStatuses.push(status));
  const [statusChannel, addedListener] = fakeElectron.ipcRenderer.on.mock.calls[0] ?? [];
  addedListener?.({}, { runtime_state: "running" });
  stopListening();

  expect(statusChannel).toBe("tatolab-status-changed");
  expect(heardStatuses).toEqual([{ runtime_state: "running" }]);
  expect(fakeElectron.ipcRenderer.removeListener).toHaveBeenCalledWith("tatolab-status-changed", addedListener);
});

test("each stream page request reaches the listener with its stream, one naming no stream is dropped, and stopping removes the listener", async () => {
  const tatolabElectronBridge = await exposedTatolabElectronBridge();
  const requestedStreams: string[] = [];

  const stopListening = tatolabElectronBridge.onStreamPageRequested((streamId) => requestedStreams.push(streamId));
  const [streamPageChannel, addedListener] = fakeElectron.ipcRenderer.on.mock.calls[0] ?? [];
  addedListener?.({}, { stream: "camera" });
  addedListener?.({}, { stream: 7 });
  addedListener?.({}, null);
  stopListening();

  expect(streamPageChannel).toBe("tatolab-stream-page-requested");
  expect(requestedStreams).toEqual(["camera"]);
  expect(fakeElectron.ipcRenderer.removeListener).toHaveBeenCalledWith("tatolab-stream-page-requested", addedListener);
});
