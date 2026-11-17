// What only the Studio, as the host of node UI elements, uses: how it reads what a control's event
// carries, the tag it mints for an element, and the listing it hands each panel's control table. It
// is a workspace entry, not supplied to views, and names no DOM type, so the main process lists
// elements through it.

export { nodeUiElementTag } from "./node_ui/node_ui_element_tag.js";
export { valueTheInputControlEventCarries } from "./node_ui/input_control_event_reading.js";
export type * from "./node_ui/node_ui_elements_listing.js";
