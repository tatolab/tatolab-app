// The Python language servers the host starts for its views, one per connection, each message the
// backend relays routed to the connection whose session it names.

import type { JsonValue, PythonLanguageServerEvent } from "../../shared/tatolab_backend_contract";
import { describeBackendRejection, type TatolabBackend } from "../backend/tatolab_backend";
import type { PythonLanguageServerConnection, PythonLanguageServerConnectionEvent } from "./studio_view_contract";

type LanguageServerBackend = Pick<TatolabBackend, "startPythonLanguageServer" | "sendToPythonLanguageServer" | "stopPythonLanguageServer" | "onPythonLanguageServerEvent">;

/** Every language server connection the host holds, routed through `backend`. */
export class PythonLanguageServerConnections {
  private readonly listenersBySession = new Map<string, (event: PythonLanguageServerConnectionEvent) => void>();

  constructor(private readonly backend: LanguageServerBackend) {
    backend.onPythonLanguageServerEvent((event) => this.route(event));
  }

  readonly connectToPythonLanguageServer = (projectFolder: string, onEvent: (event: PythonLanguageServerConnectionEvent) => void): PythonLanguageServerConnection => {
    let session: string | null = null;
    let isClosed = false;
    const messagesBeforeTheSession: JsonValue[] = [];
    const endWith = (because: string) => {
      if (isClosed) return;
      isClosed = true;
      if (session !== null) this.listenersBySession.delete(session);
      onEvent({ kind: "ended", because });
    };
    const sendNow = (startedSession: string, message: JsonValue) => {
      this.backend.sendToPythonLanguageServer(startedSession, message).catch((rejection: unknown) => endWith(describeBackendRejection(rejection)));
    };
    this.backend.startPythonLanguageServer(projectFolder).then(
      (startedSession) => {
        if (isClosed) {
          void this.backend.stopPythonLanguageServer(startedSession).catch(() => undefined);
          return;
        }
        session = startedSession;
        this.listenersBySession.set(startedSession, (event) => {
          if (event.kind === "ended") endWith(event.because);
          else onEvent(event);
        });
        for (const message of messagesBeforeTheSession.splice(0)) sendNow(startedSession, message);
      },
      (rejection: unknown) => endWith(describeBackendRejection(rejection)),
    );
    return {
      send: (message) => {
        if (isClosed) return;
        if (session === null) messagesBeforeTheSession.push(message);
        else sendNow(session, message);
      },
      close: () => {
        if (isClosed) return;
        isClosed = true;
        if (session === null) return;
        this.listenersBySession.delete(session);
        void this.backend.stopPythonLanguageServer(session).catch(() => undefined);
      },
    };
  };

  private route(event: PythonLanguageServerEvent): void {
    const listener = this.listenersBySession.get(event.session);
    if (listener === undefined) return;
    listener(event.kind === "message" ? { kind: "message", message: event.message } : { kind: "ended", because: event.because });
  }
}
