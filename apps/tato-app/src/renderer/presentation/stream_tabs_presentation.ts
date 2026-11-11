import type { DocumentTab } from "@tatolab/tato-app-view-sdk/design_system/document_tabs";
import type { OpenStreamTabs } from "../studio_shell/studio_window_model";

/** Each open tab as the title row draws it: the stream's name. */
export function streamTabsDrawnInTheTitleRow(openStreamTabs: OpenStreamTabs): DocumentTab[] {
  return openStreamTabs.tabs.map((tab) => ({ tab_id: tab.stream, name: tab.display_name }));
}
