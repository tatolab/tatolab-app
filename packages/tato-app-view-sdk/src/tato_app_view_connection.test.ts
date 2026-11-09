import { afterEach, describe, expect, it } from "vitest";
import { connectToTatoAppOverPort, type TatoAppViewConnection } from "./tato_app_view_connection.js";
import { messageFromTheViewSchema, type MessageFromStudio, type MessageFromTheView, type ViewGrant } from "./view_wire_messages.js";

const GRANT: ViewGrant = { view_type_id: "notes", contract: "1.0", placement: "area", sandboxed: false, inputs: [], outputs: [], capabilities: [] };

const channelsOpened: MessageChannel[] = [];
afterEach(() => {
  for (const channel of channelsOpened.splice(0)) {
    channel.port1.close();
    channel.port2.close();
  }
});

/** A stand-in for Studio's end: it says hello with `GRANT`, and answers each message the view sends with what `answer` gives, in the contract's shape or not. */
async function connectionToAStandInStudio(answer: (message: MessageFromTheView) => unknown[]): Promise<{ connection: TatoAppViewConnection; messagesFromTheView: MessageFromTheView[] }> {
  const channel = new MessageChannel();
  channelsOpened.push(channel);
  const messagesFromTheView: MessageFromTheView[] = [];
  channel.port1.addEventListener("message", (event: MessageEvent<unknown>) => {
    const message = messageFromTheViewSchema.parse(event.data);
    messagesFromTheView.push(message);
    for (const reply of answer(message)) channel.port1.postMessage(reply);
  });
  channel.port1.start();
  const connecting = connectToTatoAppOverPort(channel.port2);
  channel.port1.postMessage({ kind: "hello", grant: GRANT } satisfies MessageFromStudio);
  return { connection: await connecting, messagesFromTheView };
}

function nextTurns(count = 5): Promise<void> {
  return new Promise((resolveTurns) => setTimeout(resolveTurns, count));
}

describe("connectToTatoAppOverPort", () => {
  it("resolves with what Studio granted once it says hello", async () => {
    const { connection } = await connectionToAStandInStudio(() => []);
    expect(connection.grant).toEqual(GRANT);
  });

  it("hands a watch's readings to its listener, and stops the watch when asked", async () => {
    const { connection, messagesFromTheView } = await connectionToAStandInStudio((message) =>
      message.kind === "watch" && message.subject.kind === "selection" ? [{ kind: "watched", watch_id: message.watch_id, watched: { subject: "selection", reading: { kind: "node", stream: "s", node: "camera" } } }] : [],
    );
    const selections: unknown[] = [];
    const stopWatching = connection.watchSelection((selection) => selections.push(selection));
    await nextTurns();
    expect(selections).toEqual([{ kind: "node", stream: "s", node: "camera" }]);
    stopWatching();
    await nextTurns();
    expect(messagesFromTheView.at(-1)).toEqual({ kind: "stop_watching", watch_id: 1 });
  });

  it("ignores a message from Studio out of the contract's shape", async () => {
    const { connection } = await connectionToAStandInStudio((message) =>
      message.kind === "watch" ? [{ kind: "watched", watch_id: message.watch_id, watched: { subject: "selection", reading: { kind: "everything" } } }] : [],
    );
    const selections: unknown[] = [];
    connection.watchSelection((selection) => selections.push(selection));
    await nextTurns();
    expect(selections).toEqual([]);
  });

  it("reads a project file through an ask, and turns a refusal into why it was not read", async () => {
    const { connection } = await connectionToAStandInStudio((message) => {
      if (message.kind !== "ask" || message.ask.kind !== "read_project_file") return [];
      if (message.ask.file === "/p/main.py") {
        return [{ kind: "answered", ask_id: message.ask_id, answer: { kind: "project_file_read", file_read: { file: "/p/main.py", project_folder: "/p", text: "x = 1\n", version: "abc", is_editable: true } } }];
      }
      return [{ kind: "answered", ask_id: message.ask_id, answer: { kind: "refused", because: "No such file." } }];
    });
    expect(await connection.readProjectFile("/p/main.py")).toEqual({ kind: "read", file_read: { file: "/p/main.py", project_folder: "/p", text: "x = 1\n", version: "abc", is_editable: true } });
    expect(await connection.readProjectFile("/p/gone.py")).toEqual({ kind: "not_read", because: "No such file." });
  });

  it("asks Studio to open a view on a file, and carries a language server's messages both ways under its watch", async () => {
    const { connection, messagesFromTheView } = await connectionToAStandInStudio((message) => {
      if (message.kind === "ask") return [{ kind: "answered", ask_id: message.ask_id, answer: { kind: "done" } }];
      if (message.kind === "watch" && message.subject.kind === "python_language_server") {
        return [{ kind: "watched", watch_id: message.watch_id, watched: { subject: "python_language_server", reading: { kind: "message", message: { jsonrpc: "2.0", id: 1, result: null } } } }];
      }
      return [];
    });
    expect(await connection.openView("code", { kind: "file", file: "/p/main.py" })).toEqual({ kind: "done" });
    const serverEvents: unknown[] = [];
    const languageServer = connection.connectToPythonLanguageServer("/p", (event) => serverEvents.push(event));
    languageServer.send({ jsonrpc: "2.0", id: 1, method: "initialize" });
    await nextTurns();
    expect(serverEvents).toEqual([{ kind: "message", message: { jsonrpc: "2.0", id: 1, result: null } }]);
    const watchMessage = messagesFromTheView.find((message) => message.kind === "watch");
    expect(messagesFromTheView.at(-1)).toMatchObject({ kind: "ask", ask: { kind: "send_to_python_language_server", watch_id: watchMessage?.kind === "watch" ? watchMessage.watch_id : -1 } });
  });

  it("answers every ask still waiting as refused once the view closes its connection", async () => {
    const { connection } = await connectionToAStandInStudio(() => []);
    const waiting = connection.rememberSettings({ shown: true });
    connection.close();
    expect(await waiting).toEqual({ kind: "refused", because: "The view closed its connection to Tato Studio." });
  });
});
