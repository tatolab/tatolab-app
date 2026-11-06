import { expect, test } from "vitest";
import type { JsonValue, PythonLanguageServerEvent } from "../../shared/tatolab_backend_contract";
import { PythonLanguageServerConnections } from "./python_language_server_connections";
import type { PythonLanguageServerConnectionEvent } from "./studio_view_contract";

/** A backend whose sessions start when `startNext` is called, recording what each is sent and which are stopped. */
function routingBackend() {
  let relayEvent: (event: PythonLanguageServerEvent) => void = () => undefined;
  const starts: { project_folder: string; startNext: () => void; refuse: (because: string) => void }[] = [];
  const sent: { session: string; message: JsonValue }[] = [];
  const stopped: string[] = [];
  const backend = {
    startPythonLanguageServer: (projectFolder: string) =>
      new Promise<string>((resolve, reject) => {
        const session = `python-language-server-${starts.length + 1}`;
        starts.push({ project_folder: projectFolder, startNext: () => resolve(session), refuse: reject });
      }),
    sendToPythonLanguageServer: async (session: string, message: JsonValue) => {
      sent.push({ session, message });
    },
    stopPythonLanguageServer: async (session: string) => {
      stopped.push(session);
    },
    onPythonLanguageServerEvent: (listener: (event: PythonLanguageServerEvent) => void) => {
      relayEvent = listener;
      return () => undefined;
    },
  };
  return { backend, starts, sent, stopped, relay: (event: PythonLanguageServerEvent) => relayEvent(event) };
}

async function settled(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

test("messages_sent_before_the_session_starts_wait_for_it_and_each_session_hears_only_its_own", async () => {
  const { backend, starts, sent, relay } = routingBackend();
  const connections = new PythonLanguageServerConnections(backend);
  const heardByPattern: PythonLanguageServerConnectionEvent[] = [];
  const heardByCamera: PythonLanguageServerConnectionEvent[] = [];
  const pattern = connections.connectToPythonLanguageServer("/streams/pattern", (event) => heardByPattern.push(event));
  connections.connectToPythonLanguageServer("/streams/camera", (event) => heardByCamera.push(event));
  pattern.send({ id: 1 });
  expect(sent).toEqual([]);
  starts[0]?.startNext();
  starts[1]?.startNext();
  await settled();
  expect(sent).toEqual([{ session: "python-language-server-1", message: { id: 1 } }]);
  relay({ session: "python-language-server-1", kind: "message", message: { result: 1 } });
  relay({ session: "python-language-server-1", kind: "ended", because: "Pyright exited" });
  relay({ session: "python-language-server-1", kind: "message", message: { result: "after the end" } });
  expect(heardByPattern).toEqual([
    { kind: "message", message: { result: 1 } },
    { kind: "ended", because: "Pyright exited" },
  ]);
  expect(heardByCamera).toEqual([]);
});

test("a_refused_start_ends_the_connection_in_its_words_and_a_close_stops_the_session", async () => {
  const { backend, starts, stopped } = routingBackend();
  const connections = new PythonLanguageServerConnections(backend);
  const heard: PythonLanguageServerConnectionEvent[] = [];
  connections.connectToPythonLanguageServer("/streams/elsewhere", (event) => heard.push(event));
  starts[0]?.refuse("/streams/elsewhere is not the folder of the open project or of one of its imports.");
  await settled();
  expect(heard).toEqual([{ kind: "ended", because: "/streams/elsewhere is not the folder of the open project or of one of its imports." }]);

  const closedEarly = connections.connectToPythonLanguageServer("/streams/pattern", () => undefined);
  closedEarly.close();
  starts[1]?.startNext();
  await settled();
  expect(stopped).toEqual(["python-language-server-2"]);
});
