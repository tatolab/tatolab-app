// Programs the main process runs per session for the host's views, as Pyright and the agents are:
// one session per connection, its JSON-RPC messages carried both ways, and each message the
// backend relays routed to the connection whose session it names.

import type { JsonValue } from "../../shared/tatolab_backend_contract";
import { describeBackendRejection } from "../backend/tatolab_backend";

/** One event the backend relays for a session: a message its program sent, or its end. */
export type ProgramSessionEvent = { session: string; kind: "message"; message: JsonValue } | { session: string; kind: "ended"; because: string };

/** What a connection hears: the start's answer once, then each message, then the end with why. */
export type ProgramSessionConnectionEvent<Started> = { kind: "started"; started: Started } | { kind: "message"; message: JsonValue } | { kind: "ended"; because: string };

/** How the backend starts, feeds and stops one kind of session program, and relays its events. */
export interface ProgramSessionBackend<Started> {
  start(): Promise<Started>;
  sessionOf(started: Started): string;
  send(session: string, message: JsonValue): Promise<void>;
  stop(session: string): Promise<void>;
}

/** One session program, its messages carried both ways. */
export interface ProgramSessionConnection {
  /** Send one JSON-RPC message; messages sent before the session has started are held and sent in order. */
  send(message: JsonValue): void;
  /** Stop the program; nothing arrives after. */
  close(): void;
}

/** Every session connection of one kind the host holds, its events routed by session. */
export class ProgramSessionConnections {
  private readonly listenersBySession = new Map<string, (event: ProgramSessionEvent) => void>();

  /** Route each event `onEvent` relays; call once per kind of program. */
  constructor(onEvent: (listener: (event: ProgramSessionEvent) => void) => void) {
    onEvent((event) => this.listenersBySession.get(event.session)?.(event));
  }

  /** Start a session through `backend`, each event arriving on `onEvent`. */
  connect<Started>(backend: ProgramSessionBackend<Started>, onEvent: (event: ProgramSessionConnectionEvent<Started>) => void): ProgramSessionConnection {
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
      backend.send(startedSession, message).catch((rejection: unknown) => endWith(describeBackendRejection(rejection)));
    };
    backend.start().then(
      (started) => {
        const startedSession = backend.sessionOf(started);
        if (isClosed) {
          void backend.stop(startedSession).catch(() => undefined);
          return;
        }
        session = startedSession;
        this.listenersBySession.set(startedSession, (event) => {
          if (event.kind === "ended") endWith(event.because);
          else onEvent({ kind: "message", message: event.message });
        });
        onEvent({ kind: "started", started });
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
        void backend.stop(session).catch(() => undefined);
      },
    };
  }
}
