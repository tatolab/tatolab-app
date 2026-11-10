// The camera and the microphone on Linux: no system prompt guards them for an app; the device nodes'
// own permissions (the `video` and `audio` groups) decide, so there is nothing to ask ahead.

import type { SystemMediaAccess, SystemMediaAccessAnswer } from "../system_media_access.js";

/** Linux's answer for every device: no system asks the person. */
export const MEDIA_DEVICES_ASKED_BY_NO_SYSTEM_ON_LINUX: SystemMediaAccess = {
  askAheadFor: async (): Promise<SystemMediaAccessAnswer> => ({ kind: "asked_by_no_system" }),
};
