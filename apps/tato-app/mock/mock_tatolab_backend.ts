import type { TatolabBackend } from "../src/renderer/backend/tatolab_backend";
import type { MockTatolabOptions } from "./mock_tatolab_options";
import { createMockTatolabSimulation } from "./mock_tatolab_simulation";
import { mockStatusAndRuntimeBackendOf } from "./mock_status_and_runtime_backend";
import { mockProjectsAndStreamsBackendOf } from "./mock_projects_and_streams_backend";
import { mockModulesBackendOf } from "./mock_modules_backend";
import { mockSettingsAndUpdatesBackendOf } from "./mock_settings_and_updates_backend";
import { mockNodeUiElementsBackendOf } from "./mock_node_ui_elements";

/** A backend whose commands change its own state and whose streams log on their own, so the window works in a browser. */
export function createMockTatolabBackend(mockTatolabOptions: MockTatolabOptions): TatolabBackend {
  const simulation = createMockTatolabSimulation(mockTatolabOptions);
  return {
    ...mockStatusAndRuntimeBackendOf(simulation),
    ...mockProjectsAndStreamsBackendOf(simulation),
    ...mockModulesBackendOf(simulation),
    ...mockSettingsAndUpdatesBackendOf(simulation),
    ...mockNodeUiElementsBackendOf(mockTatolabOptions.nodeUiElementsListing),
  } satisfies TatolabBackend;
}
