import { useCallback } from "react";
import { useViewReading } from "@tatolab/tato-app-view-sdk/design_system/view_readings";
import type { StopWatching, TatoAppViewConnection } from "@tatolab/tato-app-view-sdk";
import type { ProjectNodeTypesDescribedReading } from "@tatolab/tato-app-view-sdk/studio_readings";

/** Stops nothing: with no project folder there are no node types to watch. */
const NO_NODE_TYPES_TO_WATCH: StopWatching = () => undefined;

/** The node types the runtime lists and describes for the project in `projectFolder`; `null` until the first reading arrives, and while `projectFolder` is `null`. */
export function useNodeTypesOfTheProject(connection: Pick<TatoAppViewConnection, "watchNodeTypes">, projectFolder: string | null): ProjectNodeTypesDescribedReading | null {
  const watchTheProjectsNodeTypes = useCallback(
    (listener: (reading: ProjectNodeTypesDescribedReading) => void): StopWatching => (projectFolder === null ? NO_NODE_TYPES_TO_WATCH : connection.watchNodeTypes(projectFolder, listener)),
    [connection, projectFolder],
  );
  return useViewReading(watchTheProjectsNodeTypes);
}
