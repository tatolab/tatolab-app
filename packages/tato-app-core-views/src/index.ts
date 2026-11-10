// Studio's built-in panels, each a view in a folder of its own with its `tatolab_view.json`, made
// with the view SDK exactly as a project's view is and held to the same boundary: nothing here
// imports the app. A built-in's view type id is its folder's name.

import outlinerManifestText from "./outliner/tatolab_view.json?raw";
import paletteManifestText from "./palette/tatolab_view.json?raw";
import propertiesManifestText from "./properties/tatolab_view.json?raw";
import streamGraphManifestText from "./stream_graph/tatolab_view.json?raw";
import viewerManifestText from "./viewer/tatolab_view.json?raw";
import historyManifestText from "./history/tatolab_view.json?raw";

/** One core view: its folder, which names it, and its `tatolab_view.json` as written, for Studio to read like any view's. */
export interface CoreView {
  readonly folder: string;
  readonly manifest_text: string;
}

/** The core views in the order the view-type menu lists Studio's own. */
export const CORE_VIEWS: readonly CoreView[] = [
  { folder: "stream_graph", manifest_text: streamGraphManifestText },
  { folder: "outliner", manifest_text: outlinerManifestText },
  { folder: "palette", manifest_text: paletteManifestText },
  { folder: "properties", manifest_text: propertiesManifestText },
  { folder: "history", manifest_text: historyManifestText },
  { folder: "viewer", manifest_text: viewerManifestText },
];
