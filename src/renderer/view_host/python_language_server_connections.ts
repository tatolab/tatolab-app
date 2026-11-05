// The Python language servers the host starts for its views, one per connection.

import type { TatolabBackend } from "../backend/tatolab_backend";
import { ProgramSessionConnections } from "./program_session_connections";
import type { PythonLanguageServerConnection, PythonLanguageServerConnectionEvent } from "./studio_view_contract";

type LanguageServerBackend = Pick<TatolabBackend, "startPythonLanguageServer" | "sendToPythonLanguageServer" | "stopPythonLanguageServer" | "onPythonLanguageServerEvent">;

/** Every language server connection the host holds, routed through `backend`. */
export class PythonLanguageServerConnections {
  private readonly sessionConnections: ProgramSessionConnections;

  constructor(private readonly backend: LanguageServerBackend) {
    this.sessionConnections = new ProgramSessionConnections((listener) => backend.onPythonLanguageServerEvent(listener));
  }

  readonly connectToPythonLanguageServer = (projectFolder: string, onEvent: (event: PythonLanguageServerConnectionEvent) => void): PythonLanguageServerConnection =>
    this.sessionConnections.connect(
      {
        start: () => this.backend.startPythonLanguageServer(projectFolder),
        sessionOf: (session) => session,
        send: (session, message) => this.backend.sendToPythonLanguageServer(session, message),
        stop: (session) => this.backend.stopPythonLanguageServer(session),
      },
      (event) => {
        if (event.kind !== "started") onEvent(event);
      },
    );
}
