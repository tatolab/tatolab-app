/** The five families a runtime port carries, each one engine-owned memory layout, as streamlib's plan names them. */
export const PORT_FAMILIES = ["image", "array", "channels", "packets", "records"] as const;

/** One of the five port families. */
export type PortFamily = (typeof PORT_FAMILIES)[number];
