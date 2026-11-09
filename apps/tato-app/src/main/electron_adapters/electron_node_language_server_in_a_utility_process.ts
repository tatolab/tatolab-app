// A Node language server run in an Electron utility process. The app's fuses turn RunAsNode off, so
// Electron cannot run a Node program as a child process; a utility process can, but takes no stdin,
// so the server is started with `--pipe=<socket>` and connects back to a socket this process
// listens on, which carries the Language Server Protocol's bytes both ways.

import { rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { utilityProcess, type UtilityProcess } from "electron";
import { describeCaughtFailure, succeeded } from "../result.js";
import type { StartANodeLanguageServer } from "../python_language_servers.js";

let languageServerSocketsMade = 0;

/** A socket path short enough for macOS's 104-byte `sun_path`, unique to this process and server. */
function aLanguageServerSocketPath(): string {
  languageServerSocketsMade += 1;
  return path.join(os.tmpdir(), `tatolab-ls-${process.pid}-${languageServerSocketsMade}.sock`);
}

/** Start the language server module in a utility process named "Python language server", connected over a Unix socket. */
export const startANodeLanguageServerInAUtilityProcess: StartANodeLanguageServer = (modulePath, workingFolder, listeners) => {
  const socketPath = aLanguageServerSocketPath();
  const socketServer = net.createServer();
  const bytesWaitingForTheConnection: Buffer[] = [];
  let serverConnection: net.Socket | null = null;
  let languageServerProcess: UtilityProcess | null = null;
  let hasEnded = false;

  const endWith = (exitWords: string) => {
    if (hasEnded) return;
    hasEnded = true;
    socketServer.close();
    serverConnection?.destroy();
    languageServerProcess?.kill();
    void rm(socketPath, { force: true });
    listeners.onExit(exitWords);
  };

  socketServer.on("connection", (connection) => {
    if (serverConnection !== null) {
      connection.destroy();
      return;
    }
    serverConnection = connection;
    for (const bytes of bytesWaitingForTheConnection.splice(0)) connection.write(bytes);
    connection.on("data", (chunk: Buffer) => listeners.onOutput(chunk));
    connection.on("error", (connectionFailure) => endWith(`its connection failed: ${connectionFailure.message}`));
    connection.on("close", () => endWith("its connection closed"));
  });
  socketServer.on("error", (socketFailure) => endWith(`its socket could not be opened: ${socketFailure.message}`));
  socketServer.listen(socketPath, () => {
    if (hasEnded) return;
    try {
      languageServerProcess = utilityProcess.fork(modulePath, [`--pipe=${socketPath}`], { cwd: workingFolder, stdio: "ignore", serviceName: "Python language server" });
    } catch (forkFailure) {
      endWith(`it could not be started: ${describeCaughtFailure(forkFailure)}`);
      return;
    }
    languageServerProcess.on("exit", (exitCode) => endWith(`exit code ${exitCode}`));
  });

  return succeeded({
    writeToItsInput: (bytes) => {
      if (serverConnection === null) bytesWaitingForTheConnection.push(bytes);
      else serverConnection.write(bytes);
    },
    stop: () => endWith("stopped by the studio"),
  });
};
