import type { AddStreamSource } from "../presentation/add_stream_flow";

/** The path of the Add stream page starting from `source`. */
export function addStreamPagePath(source: AddStreamSource): string {
  return source === "new_project" ? "/add-stream/new-project" : "/add-stream";
}

/** The navigation state of opening the Add stream page from a run's notice, to show what the run came to. */
export const OPENED_FROM_A_RUN_NOTICE = { isOpenedFromARunNotice: true } as const;

/** Whether `navigationState` is that of opening the page from a run's notice. */
export function isOpenedFromARunNoticeIn(navigationState: unknown): boolean {
  return typeof navigationState === "object" && navigationState !== null && "isOpenedFromARunNotice" in navigationState && navigationState.isOpenedFromARunNotice === true;
}
