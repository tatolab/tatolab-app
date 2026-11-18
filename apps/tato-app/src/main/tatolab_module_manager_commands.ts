import path from "node:path";
import { Effect, Schema, type ManagedRuntime } from "effect";
import { isAModuleManagerSectionAsked, MODULES_SHOWN, type TatolabCommandSignatures } from "../shared/tatolab_electron_bridge_contract.js";
import { whyTheModuleBringsNothingOnThisMachine } from "../shared/package_catalog_machine_words.js";
import { addDependency, listDependencies, listProjectViews, nameTheProject, removeDependency, updateDependency } from "./runtime_operations.js";
import { ModuleManagerWindows, PackageCatalog, StatusRounds, StudioProjectOpening, type StudioServices } from "./studio_runtime.js";
import type { TatolabAppSharedState } from "./tatolab_app_shared_state.js";
import type { TatolabWindowCommandHandlers } from "./tatolab_command_answers.js";
import { workspaceDependenciesOf } from "./workspace_dependencies.js";
import { CommandRefused, windowCommand } from "./window_command.js";

/** The arguments of `list_workspace_dependencies`: whether each import's source is read for a newer version. */
const ListWorkspaceDependenciesArguments = Schema.Struct({ check_for_newer: Schema.Boolean });

/** The arguments of `choose_dependency_source`: whether the dialog asks for a project's folder or a `.zip` of one. */
const ChooseDependencySourceArguments = Schema.Struct({ source_kind: Schema.Literals(["folder", "zip"]) });

/** The arguments of `add_dependency_to_the_workspace`: a project's folder or `.zip`, as a full path. */
const AddDependencyArguments = Schema.Struct({ source: Schema.String });

/** The arguments of `update_workspace_dependency`: the import's UUID, and whether the files edited since its copy are overwritten. */
const UpdateDependencyArguments = Schema.Struct({ project: Schema.String, overwrite_edited_files: Schema.Boolean });

/** The arguments of a command on one of the workspace's imports: its UUID. */
const DependencyArguments = Schema.Struct({ project: Schema.String });

/** The arguments of a command on one entry of the catalog: its name. */
const CatalogEntryArguments = Schema.Struct({ name: Schema.String });

/** The workspace's imports as Module manager lists them, each source read for a newer version with `checkForNewer`; the views each brings, or why none were listed. */
const workspaceDependenciesListed = Effect.fn("workspaceDependenciesListed")(function* (workspaceFolder: string, checkForNewer: boolean) {
  const [listed, workspaceViews] = yield* Effect.all(
    [
      listDependencies(workspaceFolder, checkForNewer),
      listProjectViews(workspaceFolder).pipe(Effect.result),
    ],
    { concurrency: "unbounded" },
  );
  return yield* workspaceDependenciesOf(workspaceFolder, listed, workspaceViews, nameTheProject);
});

/** The catalog entry `name`, the catalog read afresh; refused when the catalog does not read or lists nothing by that name. */
const catalogEntryNamed = Effect.fn("catalogEntryNamed")(function* (name: string) {
  const catalog = yield* PackageCatalog.use((packageCatalog) => packageCatalog.readTheCatalog);
  if (catalog.kind === "not_read") return yield* new CommandRefused({ words: catalog.because });
  const entry = catalog.entries.find((listed) => listed.name === name);
  if (entry === undefined) return yield* new CommandRefused({ words: `The catalog lists nothing named ${name}.` });
  return entry;
});

/** The catalog entry `name`, downloaded as its `.zip` and checked, then copied into `workspaceFolder` by the runtime's `add_dependency`; a sample, or a module bringing nothing on this machine, is refused. */
const marketplaceModuleImported = Effect.fn("marketplaceModuleImported")(function* (workspaceFolder: string, name: string) {
  const entry = yield* catalogEntryNamed(name);
  if (entry.kind === "sample") return yield* new CommandRefused({ words: `${entry.title} is a sample project; clone it into a project of its own instead.` });
  if (!entry.runs_on_this_machine && entry.platforms !== null) return yield* new CommandRefused({ words: whyTheModuleBringsNothingOnThisMachine(entry.title, entry.platforms) });
  const zipPath = yield* PackageCatalog.use((packageCatalog) => packageCatalog.downloadTheZipOf(entry));
  const added = yield* addDependency(workspaceFolder, zipPath);
  yield* Effect.logInfo("imported a Marketplace module into the workspace").pipe(Effect.annotateLogs({ name, version: entry.version, folder: added.folder, project_folder: workspaceFolder }));
  return added;
});

/** The catalog's sample `name`, downloaded and checked as an import's `.zip` is, then made into a project of its own and opened in its studio window. */
const marketplaceSampleCloned = Effect.fn("marketplaceSampleCloned")(function* (name: string) {
  const entry = yield* catalogEntryNamed(name);
  if (entry.kind !== "sample") return yield* new CommandRefused({ words: `${entry.title} is not a sample project; add it to a project instead.` });
  const zipPath = yield* PackageCatalog.use((packageCatalog) => packageCatalog.downloadTheZipOf(entry));
  const cloned = yield* (yield* StudioProjectOpening).makeAProjectOfItsOwnFromTheArchive(zipPath, entry.title);
  yield* StatusRounds.use((statusRounds) => statusRounds.requestARound);
  yield* Effect.logInfo("cloned a Marketplace sample into a project of its own").pipe(Effect.annotateLogs({ name, version: entry.version, project_folder: cloned.folder }));
  return cloned;
});

/** The project in `source`, a full path to its folder or `.zip`, copied into `workspaceFolder` by the runtime's `add_dependency`. */
const dependencyAdded = Effect.fn("dependencyAdded")(function* (workspaceFolder: string, source: string) {
  if (!path.isAbsolute(source)) return yield* new CommandRefused({ words: `${source} is not a full path to a project's folder or .zip.` });
  const added = yield* addDependency(workspaceFolder, source);
  yield* Effect.logInfo("imported a project into the workspace").pipe(Effect.annotateLogs({ source, folder: added.folder, project_folder: workspaceFolder }));
  return added;
});

/** The import `project` of `workspaceFolder` copied again by the runtime's `update_dependency`, overwriting files edited since its copy only with `overwriteEditedFiles`. */
const dependencyUpdated = Effect.fn("dependencyUpdated")(function* (workspaceFolder: string, project: string, overwriteEditedFiles: boolean) {
  const update = yield* updateDependency(workspaceFolder, project, overwriteEditedFiles);
  if (update.kind === "updated") yield* Effect.logInfo("updated an import of the workspace").pipe(Effect.annotateLogs({ project, project_folder: workspaceFolder }));
  return update;
});

/** The import `project` taken out of `workspaceFolder` by the runtime's `remove_dependency`. */
const dependencyRemoved = Effect.fn("dependencyRemoved")(function* (workspaceFolder: string, project: string) {
  const removed = yield* removeDependency(workspaceFolder, project);
  yield* Effect.logInfo("removed an import from the workspace").pipe(Effect.annotateLogs({ project, folder: removed.folder, project_folder: workspaceFolder }));
  return removed;
});

type ModuleManagerCommandName =
  | "open_module_manager_window"
  | "read_module_manager_workspace"
  | "read_module_manager_section_last_asked"
  | "read_package_catalog"
  | "list_workspace_dependencies"
  | "choose_dependency_source"
  | "add_dependency_to_the_workspace"
  | "update_workspace_dependency"
  | "import_from_the_marketplace"
  | "remove_workspace_dependency"
  | "clone_marketplace_sample";

/** The handlers of the module manager window's commands on the package catalog, the workspace's dependencies and the Marketplace, over `sharedState`, the ones that reach the runtime or the network run on `studioRuntime`. */
export function moduleManagerCommandHandlersOf(
  sharedState: TatolabAppSharedState,
  studioRuntime: ManagedRuntime.ManagedRuntime<StudioServices, never>,
): Pick<TatolabWindowCommandHandlers, ModuleManagerCommandName> {
  /** The handler of the Module manager window's command `commandName`, its arguments decoded with `commandArguments`, `handler` given the folder of the project the asking window imports into; refused in any other window. */
  function moduleManagerWindowCommand<CommandName extends ModuleManagerCommandName>(
    commandName: CommandName,
    commandArguments: Schema.Decoder<TatolabCommandSignatures[CommandName]["commandArguments"]>,
    handler: (
      decoded: TatolabCommandSignatures[CommandName]["commandArguments"],
      workspaceFolder: string,
    ) => Effect.Effect<TatolabCommandSignatures[CommandName]["answer"], { readonly words: string }, StudioServices>,
  ) {
    return windowCommand(studioRuntime, commandName, commandArguments, (decoded, commandFromWindow) =>
      ModuleManagerWindows.use((moduleManagerWindows) => moduleManagerWindows.workspaceFolderOfTheWindow(commandFromWindow)).pipe(
        Effect.flatMap((workspaceFolder) => handler(decoded, workspaceFolder)),
      ),
    );
  }

  return {
    open_module_manager_window: async (commandArguments, commandFromWindow) => {
      if (!isAModuleManagerSectionAsked(commandArguments)) return { ok: false, refusal: `open_module_manager_window needs \`shows\`, one of ${MODULES_SHOWN.join(", ")}.` };
      const studioWindow = sharedState.appWindows.studioWindowWithContents(commandFromWindow.windowContentsId);
      if (studioWindow === null) return { ok: false, refusal: "Only a project's studio window opens Module manager." };
      sharedState.appWindows.openTheModuleManagerWindowOf(studioWindow, commandArguments.shows);
      return { ok: true, value: null };
    },
    read_module_manager_workspace: async (_commandArguments, commandFromWindow) => ({
      ok: true,
      value: sharedState.appWindows.studioWindowOfTheModuleManagerWindowWithContents(commandFromWindow.windowContentsId)?.openProject.readOpenProject() ?? null,
    }),
    read_module_manager_section_last_asked: async (_commandArguments, commandFromWindow) => ({
      ok: true,
      value: sharedState.appWindows.moduleManagerSectionLastAskedOfTheWindowWithContents(commandFromWindow.windowContentsId),
    }),
    read_package_catalog: windowCommand(studioRuntime, "read_package_catalog", Schema.Undefined, () => PackageCatalog.use((packageCatalog) => packageCatalog.readTheCatalog)),
    list_workspace_dependencies: moduleManagerWindowCommand("list_workspace_dependencies", ListWorkspaceDependenciesArguments, ({ check_for_newer }, workspaceFolder) =>
      workspaceDependenciesListed(workspaceFolder, check_for_newer),
    ),
    choose_dependency_source: moduleManagerWindowCommand("choose_dependency_source", ChooseDependencySourceArguments, ({ source_kind }, workspaceFolder) =>
      ModuleManagerWindows.use((moduleManagerWindows) => moduleManagerWindows.chooseDependencySource(source_kind, path.dirname(workspaceFolder))),
    ),
    add_dependency_to_the_workspace: moduleManagerWindowCommand("add_dependency_to_the_workspace", AddDependencyArguments, ({ source }, workspaceFolder) =>
      dependencyAdded(workspaceFolder, source),
    ),
    update_workspace_dependency: moduleManagerWindowCommand("update_workspace_dependency", UpdateDependencyArguments, ({ project, overwrite_edited_files }, workspaceFolder) =>
      dependencyUpdated(workspaceFolder, project, overwrite_edited_files),
    ),
    import_from_the_marketplace: moduleManagerWindowCommand("import_from_the_marketplace", CatalogEntryArguments, ({ name }, workspaceFolder) => marketplaceModuleImported(workspaceFolder, name)),
    remove_workspace_dependency: moduleManagerWindowCommand("remove_workspace_dependency", DependencyArguments, ({ project }, workspaceFolder) => dependencyRemoved(workspaceFolder, project)),
    clone_marketplace_sample: moduleManagerWindowCommand("clone_marketplace_sample", CatalogEntryArguments, ({ name }) => marketplaceSampleCloned(name)),
  };
}
