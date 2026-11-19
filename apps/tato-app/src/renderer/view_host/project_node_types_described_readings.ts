// The node types each watched project offers, each described, as the host serves them to its views:
// listed with the runtime's `list_node_types`, then every one it lists described with
// `describe_node_types`, one reading per project however many views watch it. A project is listed and
// described again as the window is told its node types changed, and as one of its streams loads or
// unloads, since a loaded stream describes the project's node types in its own interpreter.

import type { TatolabBackend } from "../backend/tatolab_backend";
import type { ListedStream, ProjectNodeTypesDescribed } from "../../shared/tatolab_backend_contract";
import { ProjectListingReadingsWhileWatched } from "./project_listing_readings_while_watched";
import type { ProjectNodeTypesDescribedReading, StopWatching } from "./studio_view_contract";

/** What the host lists and describes a project's node types through. */
type NodeTypesBackend = Pick<TatolabBackend, "listNodeTypes" | "describeNodeTypes">;

/** The node types the project in `projectFolder` offers, every one of them described in the order the listing names them. */
async function projectNodeTypesDescribedThrough(backend: NodeTypesBackend, projectFolder: string): Promise<ProjectNodeTypesDescribed> {
  const listing = await backend.listNodeTypes(projectFolder);
  const nodeTypesListed = listing.sources.flatMap((source) => source.node_types.map((listed) => listed.node_type));
  const { node_types: described } = await backend.describeNodeTypes(projectFolder, nodeTypesListed);
  return { listing, described };
}

/** Each loaded stream of `streams`, by its project folder; a stream the runtime lists in no project is left out. */
function loadedStreamsByProjectFolder(streams: readonly ListedStream[]): ReadonlyMap<string, ReadonlySet<string>> {
  const byProjectFolder = new Map<string, Set<string>>();
  for (const listed of streams) {
    if (listed.location === null || listed.node_count === null) continue;
    const loadedOfTheProject = byProjectFolder.get(listed.location.project_directory) ?? new Set<string>();
    loadedOfTheProject.add(listed.stream);
    byProjectFolder.set(listed.location.project_directory, loadedOfTheProject);
  }
  return byProjectFolder;
}

function holdTheSameStreams(left: ReadonlySet<string> | undefined, right: ReadonlySet<string> | undefined): boolean {
  if (left === undefined || right === undefined) return left === right;
  return left.size === right.size && [...left].every((stream) => right.has(stream));
}

/** Every watched project's node types, each described, read through `backend`. */
export class ProjectNodeTypesDescribedReadings {
  private readonly readings: ProjectListingReadingsWhileWatched<ProjectNodeTypesDescribed>;
  private loadedStreamsBefore: ReadonlyMap<string, ReadonlySet<string>> = new Map();

  constructor(backend: NodeTypesBackend) {
    this.readings = new ProjectListingReadingsWhileWatched((projectFolder) => projectNodeTypesDescribedThrough(backend, projectFolder));
  }

  /** Read only while the window is shown; every watched project is listed again as it is shown. */
  setReadingAllowed(isAllowed: boolean): void {
    this.readings.setReadingAllowed(isAllowed);
  }

  readonly watchTheProject = (projectFolder: string, listener: (reading: ProjectNodeTypesDescribedReading) => void): StopWatching =>
    this.readings.watchTheProject(projectFolder, (reading) => listener(reading.kind === "listed" ? { kind: "listed", node_types: reading.listing } : reading));

  /** List and describe `projectFolder`'s node types again at once while a view watches them, as the runtime said they changed. */
  listTheProjectAgainNow(projectFolder: string): void {
    this.readings.listTheProjectAgainNow(projectFolder);
  }

  /** Take the streams the runtime lists now, from each status the window is shown: a project one of whose streams loaded or unloaded since the last is listed again. */
  takeTheStreamsListed(streams: readonly ListedStream[] | null): void {
    const loadedStreamsNow = loadedStreamsByProjectFolder(streams ?? []);
    for (const projectFolder of new Set([...this.loadedStreamsBefore.keys(), ...loadedStreamsNow.keys()])) {
      if (!holdTheSameStreams(this.loadedStreamsBefore.get(projectFolder), loadedStreamsNow.get(projectFolder))) this.readings.listTheProjectAgainNow(projectFolder);
    }
    this.loadedStreamsBefore = loadedStreamsNow;
  }
}
