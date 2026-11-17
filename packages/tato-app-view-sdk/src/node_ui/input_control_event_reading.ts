// How the host reads an `input` or `change` heard on a control. A native event from a field inside
// the control reaches the host as well, so it acts only on what the control fired through
// `fireInputControlEvent`, whose detail carries the value.

/** The value an `input` or `change` heard on a control carries, or `null` for an event that carries none. */
export function valueTheInputControlEventCarries(event: Event): { readonly value: unknown } | null {
  if (event.type !== "input" && event.type !== "change") return null;
  const detail: unknown = "detail" in event ? event.detail : undefined;
  return typeof detail === "object" && detail !== null && "value" in detail ? { value: detail.value } : null;
}
