import type { StreamGraphSummary, StreamLogRecordsPage, TatolabStatus } from "./tatolab_backend_contract";

/** The app backend's commands and status event. */
export interface TatolabBackend {
  getTatolabStatus(): Promise<TatolabStatus>;
  setRunTatolab(enabled: boolean): Promise<void>;
  openLoginItemsSettings(): Promise<void>;
  setUpTatolab(): Promise<void>;
  quitTatolabApp(): Promise<void>;
  readStreamLogRecords(streamName: string, afterSequence: number): Promise<StreamLogRecordsPage>;
  describeStreamGraph(streamName: string): Promise<StreamGraphSummary>;
  onTatolabStatusChanged(listener: (status: TatolabStatus) => void): Promise<() => void>;
}

/** The text of a rejected command: Tauri rejects with the backend's error string. */
export function describeBackendRejection(rejection: unknown): string {
  if (typeof rejection === "string") return rejection;
  if (rejection instanceof Error) return rejection.message;
  return JSON.stringify(rejection);
}
