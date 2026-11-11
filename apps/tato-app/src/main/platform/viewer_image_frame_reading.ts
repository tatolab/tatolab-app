/**
 * How the viewer addon asks the runtime for each Image frame: `display_import` hands Chromium the frame's own memory to import with no
 * copy, and `cpu_read` copies it into rows the main process sends the window. These are the addon's, and the runtime's, wire names.
 */
export type ViewerImageFrameReading = "display_import" | "cpu_read";
