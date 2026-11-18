import { mockGraphNodeIdOf, mockStreamIdOf } from "./mock_stream_fixtures";
import { isAGraphInputAClientWrites } from "./mock_stream_graph_document";
import {
  mockNewProjectDefaults,
  mockFirstNameNothingHolds,
  mockNewProjectLocationTheDialogAnswers,
  mockProjectArchiveTheDialogAnswers,
  mockNewProjectReading,
  mockOpenProjectReading,
  mockRecentProjectReading,
  mockProjectCoverImageUrl,
} from "./mock_open_project";
import { MOCK_PERSON_EDITING_IN_STUDIO } from "./mock_project_transactions";
import { mockProjectNodeTypeListing } from "./mock_project_node_types";
import { mockDeleteTheAsset, mockImportTheFilesChosen, mockReadTheAssetPreview, mockProjectAssetListing, mockRelocateTheAsset } from "./mock_project_assets";
import { newProjectFolderNameRefusal } from "../src/shared/new_project_folder_name";
import type { TatolabBackend } from "../src/renderer/backend/tatolab_backend";
import type { JsonValue, ProjectGraphTransaction } from "../src/shared/tatolab_backend_contract";
import { applyMockGraphTransaction, isAJsonObject, MOCK_REFUSAL_NAMING_NOTHING } from "./mock_graph_transactions";
import { PROJECT_LOG_FOLDER_IN_THE_PROJECT, type StreamActionCancelAnswer, type StreamActionFollowed } from "../src/shared/tatolab_backend_contract";
import { MOCK_COMMAND_LATENCY_MILLISECONDS, type MockLoadedStream } from "./mock_tatolab_simulation_constants";
import { sleep, type MockTatolabSimulation } from "./mock_tatolab_simulation";
import { inputValuesChangedBy } from "./mock_input_value_changes";

/** Why the runtime's `write_graph_input` refuses `value` for the Input `input` of `loadedStream`, listed as `streamState`, in its words; `null` where it takes it. */
function refusalOfAGraphInputWrite(loadedStream: MockLoadedStream, streamState: string | null, input: string, value: JsonValue): string | null {
  const { listing, graph } = loadedStream.fixture;
  if (streamState !== "running") {
    return `Runtime error: the project of the stream \`${listing.stream}\` in ${listing.location?.project_directory ?? "its folder"} is stopped, so no node of it runs to publish on \`value\`; \`start_playback\` plays it`;
  }
  const writableInputs = graph.nodes.filter((node) => isAGraphInputAClientWrites(node) && node.state === "Running");
  const graphInput = writableInputs.find((node) => node.config["port"] === input);
  if (graphInput === undefined) {
    const declared = writableInputs.map((node) => `\`${String(node.config["port"])}\``).join(", ");
    return `Processor not found: no \`GraphInput\` on the top level of the stream \`${listing.stream}\` declares the Input \`${input}\` and runs; a client writes the Inputs of family array, channels or records, and the stream's are: ${declared}`;
  }
  const family = String(graphInput.config["family"]);
  if (family === "channels" && typeof value !== "number" && typeof value !== "boolean" && !(isAJsonObject(value) && "samples" in value && "sample_rate" in value)) {
    return `Port error: output \`value\` of node \`${graphInput.name}\` carries Channels, and a Channels value is a number, a bool or \`{"samples": [[...], ...], "sample_rate"}\``;
  }
  const arrayValueRefusal = family === "array" ? whyAnArrayValueIsNotANumberOrAListOfOneShape(value) : null;
  if (arrayValueRefusal !== null) {
    return `Port error: output \`value\` of node \`${graphInput.name}\` carries Array, and attribute \`values\` is a number or a list of numbers of one shape: ${arrayValueRefusal}`;
  }
  if (family === "records" && !isAJsonObject(value)) return `Port error: output \`value\` of node \`${graphInput.name}\` carries Records, and a Records value is a JSON object`;
  return null;
}

/** Why `value` is not a number or a list of numbers of one shape, in the runtime's words; `null` where it is. */
function whyAnArrayValueIsNotANumberOrAListOfOneShape(value: JsonValue): string | null {
  if (typeof value === "number") return null;
  if (!Array.isArray(value)) return `\`${JSON.stringify(value)}\` is not a number at that depth`;
  for (const element of value) {
    const elementRefusal = whyAnArrayValueIsNotANumberOrAListOfOneShape(element);
    if (elementRefusal !== null) return elementRefusal;
  }
  const shapes = new Set(value.map((element) => (Array.isArray(element) ? element.length : -1)));
  return shapes.size > 1 ? "its lists differ in length" : null;
}

/** The mock backend's projects and streams methods over `simulation`. */
export function mockProjectsAndStreamsBackendOf(simulation: MockTatolabSimulation): Pick<TatolabBackend, "listProjectNodeTypes" | "listProjectAssets" | "importAssetsIntoTheOpenProject" | "relocateAssetInTheOpenProject" | "readAssetPreviewOfTheOpenProject" | "deleteAssetFromTheOpenProject" | "removeProject" | "renameStream" | "createStreamInTheOpenProject" | "deleteStream" | "openStreamProjectFolder" | "openTerminalAtStreamProject" | "openStreamLogFolder" | "chooseStreamProjectFolder" | "createStreamProject" | "openStreamProject" | "stopOpenProject" | "reloadProject" | "describeStreamAction" | "cancelStreamAction" | "chooseProjectFolder" | "readNewProjectDefaults" | "chooseNewProjectLocation" | "createNewProject" | "readOpenProject" | "readRecentProjects" | "openRecentProject" | "renameRecentProject" | "duplicateRecentProject" | "deleteRecentProject" | "readRecentProjectCover" | "setRecentProjectDescription" | "chooseProjectCoverImage" | "setRecentProjectCover" | "chooseProjectArchiveToImport" | "importProjectArchive" | "onOpenProjectChanged" | "readOpenProjectTransactions" | "onProjectTransactionsChanged" | "onProjectFilesChanged" | "onProjectNodeTypesChanged" | "undoInTheOpenProject" | "transactInTheOpenProject" | "readThePersonEditingInStudio" | "redoInTheOpenProject" | "readProjectFile" | "saveProjectFile" | "createNodeFile" | "listProjectFiles" | "runOpenProject" | "pauseOpenProject" | "listStudioViewsOfTheOpenProject" | "writeStudioViewOutput" | "writeGraphInput"> {
  const { fixtures, assetsChangedWhileTheMockRuns, openProjectListeners, mockStudioViewsListedInTheProject, coverImageUrlsByFolder, mockFoldersOnDisk, rememberTheProjectAsOpenedLast, openTheProjectInTheMock, mockProjectFiles, graphTransactionsCommittedByIdempotencyKey, mockProjectTransactions, refuseWithoutAnOpenProject, loadedStreams, graphTargetsOfTheOpenProject, savedGraphTargetsOfTheOpenProject, commitGraphActions, whyTheUndoIsRefused, applyingItsGraphOperations, pushEveryFollowedStreamGraphChanged, pushEachInputValueChanged, streamsWhoseGraphsAreFollowed, graphOfLoadedStream, listStreams, projectFolders, foldersHandedToTheWindow, projectFolderTheDialogChooses, refuseAFolderNotHandedToTheWindow, newProjectFolderTheRuntimeDraws, projectLoadsQueued, notHeldWords, cancelMockStreamAction, queueAMockProjectLoadThatFails, queueAMockProjectLoad, noRuntimeAnswersRefusal, loadedStreamOfTheId, streamIdsListedForARefusal, loadedStreamsOfTheMockProjectIn, mockPlaybackAReloadOfTheProjectKeeps, setTheMockPlaybackOfTheStreams, stopMockProject, removeMockProject, renameMockStream, createMockStreamInTheOpenProject, deleteMockStream, listedProjectFolderOf, isTheTerminalMissing, isTheLogFolderMissing, isNoProjectLoadHeld, mockTatolabOptions } = simulation;
  return {
    listProjectNodeTypes: async (projectDirectory) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      if (simulation.mockStatus.runtime_state !== "running") throw noRuntimeAnswersRefusal();
      const listing = mockProjectNodeTypeListing(projectDirectory, `${fixtures.machine.homeDirectory}/streams`, mockTatolabOptions.isEveryOwnNodeModuleUnreadable);
      if (listing === null) throw `list_project_node_types failed: ${projectDirectory} holds no tatolab-project.json`;
      return listing;
    },
    listProjectAssets: async (projectDirectory) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      if (simulation.mockStatus.runtime_state !== "running") throw noRuntimeAnswersRefusal();
      const listing = mockProjectAssetListing(projectDirectory, `${fixtures.machine.homeDirectory}/streams`, assetsChangedWhileTheMockRuns);
      if (listing === null) throw `list_assets failed: ${projectDirectory} holds no project: it has no tatolab-project.json`;
      return listing;
    },
    importAssetsIntoTheOpenProject: async () => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      if (simulation.openProjectReading.kind !== "read") throw "No project is open in this window.";
      if (simulation.mockStatus.runtime_state !== "running") throw noRuntimeAnswersRefusal();
      const assetsImported = mockImportTheFilesChosen(
        simulation.openProjectReading.open_project.project.folder,
        `${fixtures.machine.homeDirectory}/streams`,
        assetsChangedWhileTheMockRuns,
        mockTatolabOptions.assetImportScenario,
      );
      if (typeof assetsImported === "string") throw assetsImported;
      return assetsImported;
    },
    relocateAssetInTheOpenProject: async (asset, toPath) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      if (simulation.openProjectReading.kind !== "read") throw "No project is open in this window.";
      if (simulation.mockStatus.runtime_state !== "running") throw noRuntimeAnswersRefusal();
      const refusal = mockRelocateTheAsset(simulation.openProjectReading.open_project.project.folder, `${fixtures.machine.homeDirectory}/streams`, assetsChangedWhileTheMockRuns, asset, toPath);
      if (refusal !== null) throw refusal;
    },
    readAssetPreviewOfTheOpenProject: async (asset) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      if (simulation.openProjectReading.kind !== "read") throw "No project is open in this window.";
      if (simulation.mockStatus.runtime_state !== "running") throw noRuntimeAnswersRefusal();
      const picture = mockReadTheAssetPreview(simulation.openProjectReading.open_project.project.folder, `${fixtures.machine.homeDirectory}/streams`, assetsChangedWhileTheMockRuns, asset);
      if (typeof picture === "string") throw picture;
      return picture;
    },
    deleteAssetFromTheOpenProject: async (asset) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      if (simulation.openProjectReading.kind !== "read") throw "No project is open in this window.";
      if (simulation.mockStatus.runtime_state !== "running") throw noRuntimeAnswersRefusal();
      const refusal = mockDeleteTheAsset(simulation.openProjectReading.open_project.project.folder, `${fixtures.machine.homeDirectory}/streams`, assetsChangedWhileTheMockRuns, asset);
      if (refusal !== null) throw refusal;
    },
    removeProject: async (projectDirectory) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      if (simulation.mockStatus.runtime_state !== "running") throw `the runtime is ${simulation.mockStatus.runtime_state}, so it did not answer remove_project`;
      removeMockProject(projectDirectory);
    },
    renameStream: async (streamId, displayName) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      if (simulation.mockStatus.runtime_state !== "running") throw `the runtime is ${simulation.mockStatus.runtime_state}, so it did not answer set_stream_display_name`;
      renameMockStream(streamId, displayName);
    },
    createStreamInTheOpenProject: async (displayName) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      if (simulation.mockStatus.runtime_state !== "running") throw `the runtime is ${simulation.mockStatus.runtime_state}, so it did not answer create_stream`;
      return createMockStreamInTheOpenProject(displayName);
    },
    deleteStream: async (streamId) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      if (simulation.mockStatus.runtime_state !== "running") throw `the runtime is ${simulation.mockStatus.runtime_state}, so it did not answer delete_stream`;
      deleteMockStream(streamId);
    },
    openStreamProjectFolder: async (streamId) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      listedProjectFolderOf(streamId);
    },
    openTerminalAtStreamProject: async (streamId) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      listedProjectFolderOf(streamId);
      if (isTheTerminalMissing) {
        throw "No terminal opened: x-terminal-emulator is not on the PATH. Install a terminal, or choose one with sudo update-alternatives --config x-terminal-emulator.";
      }
    },
    openStreamLogFolder: async (streamId) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      const projectFolder = listedProjectFolderOf(streamId);
      const displayName = listStreams()?.find((listing) => listing.stream === streamId)?.display_name ?? streamId;
      if (isTheLogFolderMissing) throw `${displayName} has no log folder yet: ${projectFolder}/${PROJECT_LOG_FOLDER_IN_THE_PROJECT} is not on this machine.`;
    },
    chooseStreamProjectFolder: async (chosenFor) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      const chosen = projectFolderTheDialogChooses(chosenFor);
      if (chosen !== null) foldersHandedToTheWindow.add(chosen);
      return chosen;
    },
    createStreamProject: async (folder) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      if (folder !== null) refuseAFolderNotHandedToTheWindow(folder);
      if (simulation.mockStatus.runtime_state !== "running") throw noRuntimeAnswersRefusal();
      const projectDirectory = folder ?? newProjectFolderTheRuntimeDraws();
      const stream = mockStreamIdOf({ project_directory: projectDirectory, stream_name: "main" });
      if (projectFolders.has(projectDirectory)) {
        const failedBecause = `Invalid configuration: \`${projectDirectory}\` already has pyproject.toml, and a new project's files would overwrite it; create the project in an empty directory`;
        return { action: queueAMockProjectLoadThatFails(projectDirectory, "open", failedBecause), stream, project_directory: projectDirectory };
      }
      projectFolders.set(projectDirectory, { streamNames: ["main"], hasAPythonEnvironment: false });
      return { action: queueAMockProjectLoad(projectDirectory, "open", "held_stopped"), stream, project_directory: projectDirectory };
    },
    openStreamProject: async (folder) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      refuseAFolderNotHandedToTheWindow(folder);
      if (simulation.mockStatus.runtime_state !== "running") throw noRuntimeAnswersRefusal();
      const project = projectFolders.get(folder);
      if (project === undefined) return { action: queueAMockProjectLoadThatFails(folder, "open", `the project directory ${folder} does not exist`), project_directory: folder };
      if (project.streamNames.length === 0) {
        return { action: queueAMockProjectLoadThatFails(folder, "open", `${folder} is not a project: it holds no tatolab-project.json`), project_directory: folder };
      }
      return { action: queueAMockProjectLoad(folder, "open", "held_stopped"), project_directory: folder };
    },
    stopOpenProject: async () => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      if (simulation.openProjectReading.kind === "none_open") throw "No project is open to stop.";
      if (simulation.mockStatus.runtime_state !== "running") throw noRuntimeAnswersRefusal();
      stopMockProject(simulation.openProjectReading.kind === "read" ? simulation.openProjectReading.open_project.project.folder : simulation.openProjectReading.folder);
    },
    reloadProject: async (projectDirectory) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      if (simulation.mockStatus.runtime_state !== "running") throw noRuntimeAnswersRefusal();
      if (!(listStreams() ?? []).some((listing) => listing.location?.project_directory === projectDirectory)) throw `The runtime lists no stream from ${projectDirectory}.`;
      if (!projectFolders.has(projectDirectory)) {
        return { action: queueAMockProjectLoadThatFails(projectDirectory, "load", `the project directory ${projectDirectory} does not exist`), project_directory: projectDirectory };
      }
      return { action: queueAMockProjectLoad(projectDirectory, "load", mockPlaybackAReloadOfTheProjectKeeps(projectDirectory)), project_directory: projectDirectory };
    },
    describeStreamAction: async (action): Promise<StreamActionFollowed> => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      if (simulation.mockStatus.runtime_state !== "running") throw noRuntimeAnswersRefusal();
      const description = projectLoadsQueued.get(action);
      if (description === undefined || isNoProjectLoadHeld) return { kind: "not_held", words: `Invalid configuration: ${notHeldWords(action)}` };
      return { kind: "described", description: structuredClone(description) };
    },
    cancelStreamAction: async (action): Promise<StreamActionCancelAnswer> => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      if (simulation.mockStatus.runtime_state !== "running") throw noRuntimeAnswersRefusal();
      return cancelMockStreamAction(action);
    },
    chooseProjectFolder: async () => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      const chosenReading = mockOpenProjectReading("read", fixtures.machine.homeDirectory);
      const folder = chosenReading.kind === "read" ? chosenReading.open_project.project.folder : fixtures.machine.homeDirectory;
      openTheProjectInTheMock(chosenReading, folder, chosenReading.kind === "read" ? chosenReading.open_project.project.name : null);
      return { folder, project_creation: null };
    },
    readNewProjectDefaults: async () => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      return mockNewProjectDefaults(fixtures.machine.homeDirectory, mockFoldersOnDisk());
    },
    chooseNewProjectLocation: async () => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      return mockNewProjectLocationTheDialogAnswers(fixtures.machine.homeDirectory);
    },
    createNewProject: async (name, location) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      const nameRefusal = newProjectFolderNameRefusal(name);
      if (nameRefusal !== null) throw nameRefusal;
      const folder = `${location}/${name.trim()}`;
      if (mockFoldersOnDisk().includes(folder)) throw `${folder} already exists. Choose another name or location.`;
      projectFolders.set(folder, { streamNames: ["main"], hasAPythonEnvironment: false });
      const action = queueAMockProjectLoad(folder, "open", "held_stopped");
      const newReading = mockNewProjectReading(folder, name.trim());
      openTheProjectInTheMock(newReading, folder, newReading.kind === "read" ? newReading.open_project.project.name : null);
      return { folder, project_creation: { action, stream: mockStreamIdOf({ project_directory: folder, stream_name: "main" }), project_directory: folder } };
    },
    readOpenProject: async () => structuredClone(simulation.openProjectReading),
    readRecentProjects: async () => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      return structuredClone(simulation.recentProjects);
    },
    openRecentProject: async (folder) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      const recentProject = simulation.recentProjects.find((recent) => recent.folder === folder);
      if (recentProject === undefined) throw `${folder} is not one of the recent projects.`;
      // A Module manager window keeps its workspace: the project opens, or comes forward, in a studio window of its own, which this one page cannot show.
      if (mockTatolabOptions.moduleManagerWorkspaceDependencies !== null) {
        rememberTheProjectAsOpenedLast(folder, recentProject.project_name);
        return;
      }
      openTheProjectInTheMock(mockRecentProjectReading(recentProject, fixtures.machine.homeDirectory), folder, recentProject.project_name);
    },
    renameRecentProject: async (folder, name) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      const recentProject = simulation.recentProjects.find((recent) => recent.folder === folder);
      if (recentProject === undefined) throw `${folder} is not one of the recent projects.`;
      if (name.trim() === "") throw "Give the project a name.";
      if (recentProject.project_name === null) throw `rename_project failed: ${folder} holds no project: it has no tatolab-project.json`;
      simulation.recentProjects = simulation.recentProjects.map((recent) => (recent.folder === folder ? { ...recent, project_name: name.trim(), last_edited_at_wall_clock_ms: Date.now() } : recent));
    },
    duplicateRecentProject: async (folder) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS * 3);
      const recentProject = simulation.recentProjects.find((recent) => recent.folder === folder);
      if (recentProject === undefined) throw `${folder} is not one of the recent projects.`;
      if (recentProject.project_name === null) throw `duplicate_project failed: ${folder} holds no project: it has no tatolab-project.json`;
      const parentFolder = folder.slice(0, folder.lastIndexOf("/"));
      const duplicateFolder = `${parentFolder}/${mockFirstNameNothingHolds(parentFolder, `${folder.slice(folder.lastIndexOf("/") + 1)} copy`, mockFoldersOnDisk())}`;
      simulation.recentProjects = [{ ...recentProject, folder: duplicateFolder, project_name: `${recentProject.project_name} copy`, last_opened_at_wall_clock_ms: Date.now(), last_edited_at_wall_clock_ms: Date.now() }, ...simulation.recentProjects];
      return duplicateFolder;
    },
    deleteRecentProject: async (folder) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS * 4);
      const recentProject = simulation.recentProjects.find((recent) => recent.folder === folder);
      if (recentProject === undefined) throw `${folder} is not one of the recent projects.`;
      if (recentProject.project_name === null) throw `delete_project failed: ${folder} holds no project: it has no tatolab-project.json`;
      simulation.recentProjects = simulation.recentProjects.filter((recent) => recent.folder !== folder);
    },
    readRecentProjectCover: async (folder) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      const recentProject = simulation.recentProjects.find((recent) => recent.folder === folder);
      if (recentProject === undefined) throw `${folder} is not one of the recent projects.`;
      return recentProject.has_a_chosen_cover ? (coverImageUrlsByFolder.get(folder) ?? mockProjectCoverImageUrl(folder.endsWith("pattern") ? "arcs" : "stripes")) : null;
    },
    setRecentProjectDescription: async (folder, description) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      const recentProject = simulation.recentProjects.find((recent) => recent.folder === folder);
      if (recentProject === undefined) throw `${folder} is not one of the recent projects.`;
      if (recentProject.project_name === null) throw `set_project_description failed: ${folder} holds no project: it has no tatolab-project.json`;
      const trimmedDescription = description.trim();
      simulation.recentProjects = simulation.recentProjects.map((recent) =>
        recent.folder === folder ? { ...recent, project_description: trimmedDescription === "" ? null : trimmedDescription, last_edited_at_wall_clock_ms: Date.now() } : recent,
      );
    },
    chooseProjectCoverImage: async () => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      return `${fixtures.machine.homeDirectory}/Pictures/night-market-poster.png`;
    },
    setRecentProjectCover: async (folder, image) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS * 2);
      const recentProject = simulation.recentProjects.find((recent) => recent.folder === folder);
      if (recentProject === undefined) throw `${folder} is not one of the recent projects.`;
      if (recentProject.project_name === null) throw `import_asset failed: ${folder} holds no project: it has no tatolab-project.json`;
      if (image !== null) coverImageUrlsByFolder.set(folder, mockProjectCoverImageUrl("stripes"));
      simulation.recentProjects = simulation.recentProjects.map((recent) => (recent.folder === folder ? { ...recent, has_a_chosen_cover: image !== null, last_edited_at_wall_clock_ms: Date.now() } : recent));
    },
    chooseProjectArchiveToImport: async () => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      return mockProjectArchiveTheDialogAnswers(fixtures.machine.homeDirectory, mockFoldersOnDisk());
    },
    importProjectArchive: async (archive, name, location) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS * 4);
      const nameRefusal = newProjectFolderNameRefusal(name);
      if (nameRefusal !== null) throw nameRefusal;
      const folder = `${location}/${name.trim()}`;
      if (mockFoldersOnDisk().includes(folder)) throw `${folder} already exists. Choose another name or location.`;
      if (!archive.endsWith(".zip")) throw `import_project failed: ${archive} is not a .zip`;
      projectFolders.set(folder, { streamNames: ["main"], hasAPythonEnvironment: false });
      const importedReading = mockNewProjectReading(folder, name.trim());
      openTheProjectInTheMock(importedReading, folder, importedReading.kind === "read" ? importedReading.open_project.project.name : null);
      return { folder, project_creation: null };
    },
    onOpenProjectChanged: (openProjectListener) => {
      openProjectListeners.add(openProjectListener);
      return () => openProjectListeners.delete(openProjectListener);
    },
    readOpenProjectTransactions: async () => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      if (mockProjectTransactions === null) throw "No project is open in this window.";
      return simulation.mockStatus.runtime_state === "running" ? mockProjectTransactions.read() : { kind: "not_read", because: noRuntimeAnswersRefusal() };
    },
    onProjectTransactionsChanged: (listener) => mockProjectTransactions?.onChanged(listener) ?? (() => undefined),
    onProjectFilesChanged: () => () => undefined,
    onProjectNodeTypesChanged: () => () => undefined,
    undoInTheOpenProject: async (author) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      if (mockProjectTransactions === null) throw "No project is open in this window.";
      if (simulation.mockStatus.runtime_state !== "running") throw noRuntimeAnswersRefusal();
      return applyingItsGraphOperations(mockProjectTransactions.undo(author, whyTheUndoIsRefused));
    },
    transactInTheOpenProject: async (operations, mode, idempotencyKey) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      if (mockProjectTransactions === null || simulation.openProjectReading.kind !== "read") throw "No project is open in this window.";
      if (simulation.mockStatus.runtime_state !== "running") throw noRuntimeAnswersRefusal();
      const committedBefore = idempotencyKey === null || mode !== "commit" ? undefined : graphTransactionsCommittedByIdempotencyKey.get(idempotencyKey);
      if (committedBefore !== undefined) {
        return { kind: "applied", transaction: { ...structuredClone(committedBefore), added_nodes: committedBefore.added_nodes.map((addedNode) => ({ ...addedNode, as: null })) } };
      }
      savedGraphTargetsOfTheOpenProject();
      const operationInsideAPlacedStream = operations.findIndex((operation) => "level" in operation && (operation.level ?? []).length > 0);
      if (mode === "live" && operationInsideAPlacedStream !== -1) {
        const refusal = { ...MOCK_REFUSAL_NAMING_NOTHING, action: "transact", refused_operation_index: operationInsideAPlacedStream };
        return { kind: "refused", refusal: { ...refusal, runtime_words: "an edit inside a placed stream is refused live: it is made on the project's graph documents, with `mode` `commit`" } };
      }
      const negativeInputValue = mockTatolabOptions.areNegativeInputValuesRefused ? operations.findIndex((operation) => operation.operation === "set_node_input_value" && typeof operation.value === "number" && operation.value < 0) : -1;
      if (negativeInputValue !== -1) {
        const refusal = { ...MOCK_REFUSAL_NAMING_NOTHING, action: "transact", refused_operation_index: negativeInputValue };
        return { kind: "refused", refusal: { ...refusal, runtime_words: "the value is below the input's range, which starts at 0" } };
      }
      const outcome = mode === "commit" ? commitGraphActions(operations, "a_transaction") : applyMockGraphTransaction(graphTargetsOfTheOpenProject(), operations, "a_live_transaction");
      if (outcome.kind === "refused") return outcome;
      // A live transaction of values alone changes no graph, so only each value's change is pushed; a commit edits the graph too.
      pushEachInputValueChanged(
        inputValuesChangedBy(operations, graphTargetsOfTheOpenProject(), (streamId) => {
          const loadedStream = loadedStreams.get(streamId);
          return loadedStream === undefined || !streamsWhoseGraphsAreFollowed.has(streamId) ? null : graphOfLoadedStream(loadedStream);
        }),
      );
      if (mode === "commit" || operations.some((operation) => operation.operation !== "set_node_input_value")) pushEveryFollowedStreamGraphChanged();
      const recorded = mode === "commit" ? mockProjectTransactions.record(MOCK_PERSON_EDITING_IN_STUDIO, outcome.history_operations, outcome.inverse_operations) : null;
      const transaction: ProjectGraphTransaction = { mode, transaction: recorded?.transaction ?? null, commit: recorded?.commit ?? null, ...outcome.transaction };
      if (idempotencyKey !== null && mode === "commit") graphTransactionsCommittedByIdempotencyKey.set(idempotencyKey, structuredClone(transaction));
      return { kind: "applied", transaction };
    },
    readThePersonEditingInStudio: async () => structuredClone(MOCK_PERSON_EDITING_IN_STUDIO),
    redoInTheOpenProject: async (author) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      if (mockProjectTransactions === null) throw "No project is open in this window.";
      if (simulation.mockStatus.runtime_state !== "running") throw noRuntimeAnswersRefusal();
      return applyingItsGraphOperations(mockProjectTransactions.redo(author));
    },
    readProjectFile: async (file) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      refuseWithoutAnOpenProject();
      return mockProjectFiles.read(file);
    },
    saveProjectFile: async (file, text, basedOnVersion) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      refuseWithoutAnOpenProject();
      return mockProjectFiles.save(file, text, basedOnVersion);
    },
    createNodeFile: async (file) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      refuseWithoutAnOpenProject();
      const created = mockProjectFiles.createNodeFile(file);
      const pathInTheProject = mockProjectFiles.pathInTheOpenProjectOf(file);
      mockProjectTransactions?.record(
        MOCK_PERSON_EDITING_IN_STUDIO,
        [{ operation: "write_project_file", path: pathInTheProject, content: { staged_copy: { staged_at: `.tatolab/staged-file-writes/${crypto.randomUUID()}` } }, replaced_a_file: false }],
        [{ operation: "remove_project_file", path: pathInTheProject }],
      );
      return created;
    },
    listProjectFiles: async (projectFolder) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      refuseWithoutAnOpenProject();
      return mockProjectFiles.list(projectFolder);
    },
    runOpenProject: async () => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      if (simulation.openProjectReading.kind === "none_open") throw "No project is open to run.";
      if (simulation.openProjectReading.kind === "unreadable") throw simulation.openProjectReading.refusal;
      if (simulation.mockStatus.runtime_state !== "running") throw noRuntimeAnswersRefusal();
      const folder = simulation.openProjectReading.open_project.project.folder;
      const loadedStreamsOfTheProject = loadedStreamsOfTheMockProjectIn(folder);
      if (loadedStreamsOfTheProject.some((loadedStream) => loadedStream.fixture.listing.state === "paused")) {
        setTheMockPlaybackOfTheStreams(loadedStreamsOfTheProject, "running");
        return;
      }
      if (loadedStreamsOfTheProject.length > 0) throw `Runtime error: the project in ${folder} already plays, so there is none to play; \`stop_playback\` stops it`;
      queueAMockProjectLoad(folder, "start_playback", "playing");
    },
    pauseOpenProject: async () => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      if (simulation.openProjectReading.kind === "none_open") throw "No project is open to pause.";
      if (simulation.mockStatus.runtime_state !== "running") throw noRuntimeAnswersRefusal();
      const folder = simulation.openProjectReading.kind === "read" ? simulation.openProjectReading.open_project.project.folder : simulation.openProjectReading.folder;
      const loadedStreamsOfTheProject = loadedStreamsOfTheMockProjectIn(folder);
      if (loadedStreamsOfTheProject.length === 0) {
        throw `Runtime error: no stream of the project in ${folder} plays, so there is none to pause; \`start_playback\` plays it. Loaded: ${streamIdsListedForARefusal(loadedStreams.keys())}`;
      }
      setTheMockPlaybackOfTheStreams(loadedStreamsOfTheProject, "paused");
    },
    listStudioViewsOfTheOpenProject: async () => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      if (simulation.openProjectReading.kind !== "read") throw "No project is open in this window.";
      return mockStudioViewsListedInTheProject();
    },
    writeStudioViewOutput: async (stream, node, port) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      const viewNode = loadedStreamOfTheId(stream).fixture.graph.nodes.find((graphNode) => mockGraphNodeIdOf(stream, graphNode) === node);
      if (viewNode === undefined) throw `write_studio_view_output failed: no node with the id \`${node}\` in stream \`${stream}\``;
      if (!viewNode.output_ports.some((outputPort) => outputPort.name === port)) throw `write_studio_view_output failed: \`${viewNode.name}\` has no output port named \`${port}\``;
    },
    writeGraphInput: async (stream, input, value) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      const loadedStream = loadedStreamOfTheId(stream);
      const refusal = refusalOfAGraphInputWrite(loadedStream, listStreams()?.find((listing) => listing.stream === stream)?.state ?? null, input, value);
      if (refusal !== null) throw `write_graph_input failed: ${refusal}`;
      loadedStream.valueWrittenToEachGraphInput.set(input, value);
      pushEveryFollowedStreamGraphChanged();
    },
  };
}
