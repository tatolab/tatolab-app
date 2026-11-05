import type { Result } from "../result.js";

/** The runtime a packaged app carries, which it runs as its own child process for as long as it runs. */
export interface CarriedRuntime {
  /** `tatolabd` inside the app: in the runtime helper bundle on macOS, in the package's resources on Linux. */
  runtimeExecutable: string;
  /** What the runtime is run with beyond the app's own environment: a local-proof build's test root and ports. */
  runtimeEnvironment: Readonly<Record<string, string>>;
}

/** How a runtime the app started ended. */
export interface RuntimeChildProcessExit {
  /** Its exit status; `null` when a signal ended it. */
  exitStatus: number | null;
  /** The signal that ended it; `null` when it exited. */
  endingSignal: string | null;
  /** The last line it wrote to its standard error, which names a refusal in its own words; `null` when it wrote none. */
  lastStandardErrorLine: string | null;
}

/** A runtime the app started, while it runs. */
export interface RuntimeChildProcess {
  /** Send it SIGTERM, which `tatolabd` answers by ending its Python processors and exiting. */
  askItToStop(): void;
}

/** Starts `carriedRuntime` as a child of the app, calling `whenItExits` once it ends; refused in words when it could not be started. */
export type StartTheCarriedRuntimeAsAChildProcess = (
  carriedRuntime: CarriedRuntime,
  whenItExits: (runtimeChildProcessExit: RuntimeChildProcessExit) => void,
) => Result<RuntimeChildProcess, string>;
