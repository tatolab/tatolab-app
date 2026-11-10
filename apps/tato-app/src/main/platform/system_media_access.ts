// The system's own say over the camera and the microphone, which it gives the whole app once rather
// than any one view: macOS asks the person through its privacy prompt; Linux asks nobody.

/** The devices a view may declare among its `capabilities` that the system guards. */
export const SYSTEM_MEDIA_DEVICES = ["camera", "microphone"] as const;

/** A device the system guards. */
export type SystemMediaDevice = (typeof SYSTEM_MEDIA_DEVICES)[number];

/** What the system answered for a device: allowed, refused with where the person can allow it, or that it asks nobody. */
export type SystemMediaAccessAnswer =
  | { kind: "allowed" }
  | { kind: "refused"; openWhereThePersonAllowsIt: () => void }
  | { kind: "asked_by_no_system" };

/** The system's access to the camera and the microphone, asked for ahead of any use. */
export interface SystemMediaAccess {
  /** Ask for `device` now: the system prompts only while the person has not answered it, and answers at once after. */
  askAheadFor(device: SystemMediaDevice): Promise<SystemMediaAccessAnswer>;
}
