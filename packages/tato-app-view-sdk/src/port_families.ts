/** The five families a runtime port carries, each one engine-owned memory layout, as streamlib's plan names them. */
export const PORT_FAMILIES = ["image", "array", "channels", "packets", "records"] as const;

/** One of the five port families. */
export type PortFamily = (typeof PORT_FAMILIES)[number];

const PORT_FAMILY_WORDS: Record<PortFamily, string> = { image: "Image", array: "Array", channels: "Channels", packets: "Packets", records: "Records" };

/** A family's name as Properties and the Library write it beside a port. */
export function portFamilyWords(family: PortFamily): string {
  return PORT_FAMILY_WORDS[family];
}
