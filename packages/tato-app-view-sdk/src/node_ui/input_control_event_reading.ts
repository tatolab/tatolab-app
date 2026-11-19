// How the host reads an `input`, `change` or `cancel` heard on a control. A native event from a
// field or dialog inside the control reaches the host as well, so it acts only on what the control
// fired through `fireInputControlEvent`, whose detail carries the value, and `fireInputControlCancel`.

/** The value an `input` or `change` heard on a control carries, or `null` for an event that carries none. */
export function valueTheInputControlEventCarries(event: Event): { readonly value: unknown } | null {
  if (event.type !== "input" && event.type !== "change") return null;
  const detail: unknown = "detail" in event ? event.detail : undefined;
  return typeof detail === "object" && detail !== null && "value" in detail ? { value: detail.value } : null;
}

/** Whether `event` is the `cancel` a control fired through `fireInputControlCancel`, not a native one. */
export function isTheCancelOfAnInputControl(event: Event): boolean {
  if (event.type !== "cancel") return false;
  const detail: unknown = "detail" in event ? event.detail : undefined;
  return typeof detail === "object" && detail !== null && "gesture_cancelled" in detail && detail.gesture_cancelled === true;
}
