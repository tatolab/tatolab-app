/** The `data-*` attributes a screen gives a control so tests and the mock window's presets can find it, as `data-stream-log-toolbar="follow"`. */
export type ControlDataAttributes = { [dataAttributeName: ControlDataAttributeName]: string | undefined };

/** A `data-*` attribute's name, which a list control sets on each of its items to that item's own value. */
export type ControlDataAttributeName = `data-${string}`;
