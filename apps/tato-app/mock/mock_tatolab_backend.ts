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
  const backend = {
    ...mockStatusAndRuntimeBackendOf(simulation),
    ...mockProjectsAndStreamsBackendOf(simulation),
    ...mockModulesBackendOf(simulation),
    ...mockSettingsAndUpdatesBackendOf(simulation),
    ...mockNodeUiElementsBackendOf(mockTatolabOptions.nodeUiElementsListing),
  } satisfies TatolabBackend;
  if (mockTatolabOptions.valueAShellSetsLive !== null) setTheEffectsAmountLiveFromAShell(backend, mockTatolabOptions.valueAShellSetsLive);
  return backend;
}

/** The main stream of the mock's open project, which holds the inverting effect. */
const MAIN_STREAM = "pattern-main-bcd55b";
/** How long after the page opens the shell sets its value: once `main` is loaded and drawn. */
const A_SHELL_SETS_THE_VALUE_AFTER_MILLISECONDS = 4_000;

/** A shell outside the window sets the inverting effect's `amount` in `main` live to `value`, as an agent's `transact` does. */
function setTheEffectsAmountLiveFromAShell(backend: TatolabBackend, value: number): void {
  window.setTimeout(() => {
    void backend.describeStreamGraph(MAIN_STREAM).then((graph) => {
      const invert = graph.nodes.find((node) => node.name === "invertingeffect");
      if (invert === undefined || graph.asset === undefined || graph.asset === null) return undefined;
      return backend.transactInTheOpenProject([{ operation: "set_node_input_value", stream: graph.asset, node: invert.id, input: "amount", value }], "live", null);
    });
  }, A_SHELL_SETS_THE_VALUE_AFTER_MILLISECONDS);
}
