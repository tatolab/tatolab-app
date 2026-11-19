// The view contract as it crosses the MessagePort between a view's frame and Studio. Studio's own
// build writes every message it sends a view, so a view takes it as the type below and parses none
// of it; a message a view sends is an author's code, so Studio decodes it on its own side, with the
// Schemas of `./studio_host`, each held to a type here. Every view's frame shares Studio's origin, so
// an Image frame crosses as the transferred `VideoFrame`, with no copy.

import type {
  CheckLinkCandidatesRequest,
  LinkCandidatesCheckResult,
  AssetPreviewPicture,
  GraphEditMode,
  JsonValue,
  ListedStreamsReading,
  MarketplaceEntry,
  OpenProjectReading,
  PortViewerMessageReading,
  PortViewerRecovery,
  PortViewerTarget,
  ProjectActionRefusal,
  ProjectAssetsImported,
  ProjectAssetsReading,
  ProjectFileRead,
  ProjectFiles,
  ProjectGraphTransaction,
  ProjectLogReading,
  ProjectNodeTypesDescribedReading,
  ProjectStreamsRecovery,
  ProjectTransaction,
  ProjectTransactionAuthor,
  ProjectTransactionsReading,
  PythonLanguageServerConnectionEvent,
  StreamGraphAction,
  StreamGraphReading,
  StreamInputValuesReading,
  StreamTabAddress,
  StudioSelection,
  StudioViewsReading,
  ViewHeaderRow,
  ViewOpenedOn,
} from "./studio_readings.js";
import type { NodeUiElementsReading } from "./node_ui/node_ui_elements_listing.js";
import type { TatolabViewManifest } from "./tatolab_view_manifest.js";

/** What a port viewer delivers: an Image frame as a `VideoFrame` the view closes once drawn, or as its pixels; another family's message, read by its family; or the viewer reopening, with why, or ending, with why and how it recovers. */
export type PortViewerEvent =
  | { kind: "image_frame"; video_frame: VideoFrame; format_wire_name: string; skipped_since_last_read: number }
  | {
      kind: "image_pixels";
      width: number;
      height: number;
      /** The runtime's wire name of the frame's pixel format (`bgra32`, `rgba32`, `nv12`, …). */
      format_wire_name: string;
      bytes_per_row: number;
      pixels: Uint8Array;
      /** Messages the viewer skipped before this one, because a viewer reads only the latest. */
      skipped_since_last_read: number;
    }
  | { kind: "message"; reading: PortViewerMessageReading; skipped_since_last_read: number }
  | { kind: "reopening"; because: string }
  | { kind: "ended"; because: string; recovery: PortViewerRecovery };

/** The type of the message Studio posts into a view's frame, carrying the view's end of its MessagePort as its one transferred port. */
export const VIEW_PORT_HANDOVER = "tatolab_view_port";

/** A section of the window that lists modules: the modules added to the open project, or the Marketplace's packages and samples. */
export type ModulesAndMarketplaceSection = "added_to_this_project" | "marketplace";

/** One area of the studio window's layout, as a view of some type could be shown in it: what it shows now, by its view's title, and whether that is the view type itself or the area of the view asking. */
export type AreaForAViewType = {
  area_id: string;
  /** The title of the view the area shows, `null` while it shows none. */
  shows_view_title: string | null;
  shows_the_view_type: boolean;
  is_the_asking_views_area: boolean;
};

/** The areas of the layout for a view type, as its node's Show in an area lists them: none when no view type has that id, or why the window has no areas. */
export type AreasForAViewTypeReading = { kind: "not_a_view_type" } | { kind: "areas_listed"; view_title: string; areas: AreaForAViewType[] } | { kind: "no_areas"; because: string };

/** A project asset the person is choosing in Studio's asset picker, as for a config field naming one. */
export type ProjectAssetPick = {
  /** The `media_facts` members of which a chosen asset's bytes hold one, as `["image"]`; `null` takes any asset of the project. */
  media: string[] | null;
  /** The UUID of the asset chosen now, which the picker marks; `null` for none. */
  chosen_now: string | null;
};

/** What a view may watch. */
export type ViewWatchedSubject =
  | { kind: "open_project" }
  | { kind: "listed_streams" }
  | { kind: "active_stream_tab" }
  | { kind: "selection" }
  | { kind: "stream_graph"; stream: string }
  /** Every input's value in the stream's graph, then each change of one. */
  | { kind: "input_values"; stream: string }
  | { kind: "project_log"; project_folder: string }
  /** The node types the project offers, each described, listed and described again each time the project's node types change or one of its streams loads. */
  | { kind: "node_types"; project_folder: string }
  /** The project's assets, listed again while watched. */
  | { kind: "project_assets"; project_folder: string }
  /** The project's change feed, read again each time the runtime applies a transaction to it. */
  | { kind: "project_transactions"; project_folder: string }
  /** The views Studio ships with and those the open project and its imports bring, listed again with the project's. */
  | { kind: "studio_views" }
  /** The node UI elements the Studio and the open project bring, each panel's control table read from them. */
  | { kind: "node_ui_elements" }
  /** A running node's output port, read until the watch stops. */
  | { kind: "port_viewer"; target: PortViewerTarget }
  /** What is wired into one of a `node` view's own inputs. */
  | { kind: "input"; input: string }
  /** Pyright's language server for a project folder, started for this watch and stopped with it; messages to it go as `send_to_python_language_server` asks. */
  | { kind: "python_language_server"; project_folder: string }
  | { kind: "settings" }
  | { kind: "opened_on" }
  | { kind: "header_row" }
  /** Whether the view's area fills the window now, at once and on each change. */
  | { kind: "area_expansion" }
  /** The layout's areas for the view type `view_type_id`, read again as the layout or the view types change. */
  | { kind: "areas_for_the_view_type"; view_type_id: string }
  /** The asset pick the view is shown in Studio's asset picker to answer; `null` for a view shown anywhere else. */
  | { kind: "project_asset_pick" };

/** A file of the open project or its imports, at its line `line` when one is named, or a running node's output port, that a view of some type is opened on. */
export type ViewOpeningTarget = { kind: "file"; file: string; line?: number } | { kind: "port"; target: PortViewerTarget };

/** What a view may ask Studio to do; an output's payload travels beside the ask in the same message. */
export type ViewAsk =
  | { kind: "select"; selection: StudioSelection }
  | { kind: "open_stream_tab"; stream_tab: StreamTabAddress }
  /** Open a view of `view_type_id` on `on`, in an area showing that type, or in the area the layout gives it. */
  | { kind: "open_view"; view_type_id: string; on: ViewOpeningTarget }
  /** Keep `settings` with the view's area, checked against the view's declared settings. */
  | { kind: "remember_settings"; settings: JsonValue }
  | { kind: "read_project_file"; file: string }
  /** Write `text` to `file` whole when it is still at `based_on_version` on disk (`null` for a new file); never over a file changed since, or an import's. */
  | { kind: "save_project_file"; file: string; text: string; based_on_version: string | null }
  /** A new Python node file at `file`, absolute, in the open project's own folder, from the runtime's node template. */
  | { kind: "create_node_file"; file: string }
  | { kind: "list_project_files"; project_folder: string }
  /** One JSON-RPC message for the language server the view's watch `watch_id` started. */
  | { kind: "send_to_python_language_server"; watch_id: number; message: JsonValue }
  | { kind: "send_output"; output: string }
  /** Undo `author`'s latest transaction in the project not undone yet, through the runtime's `undo`. */
  | { kind: "undo_in_the_project"; project_folder: string; author: ProjectTransactionAuthor }
  /** Redo what `author`'s latest undo in the project reversed, through the runtime's `redo`. */
  | { kind: "redo_in_the_project"; project_folder: string; author: ProjectTransactionAuthor }
  /** Apply `operations`, at least one, on the graphs of the project's streams as one transaction through the runtime's `transact`; `idempotency_key` is minted once per gesture, so a retry answers the first transaction. */
  | { kind: "transact_in_the_project"; project_folder: string; operations: StreamGraphAction[]; mode: GraphEditMode; idempotency_key: string | null }
  /** What the runtime's `check_link_candidates` answers for `request`, on a stream of the project: how a link from its placed pin to each candidate would connect, or why it would not. */
  | { kind: "check_link_candidates"; project_folder: string; request: CheckLinkCandidatesRequest }
  /** The person editing in Studio, the author history records their edits under and their own undo takes. */
  | { kind: "read_the_person_editing" }
  /** Ask the person for files in the desktop's open dialog, offering the files of `media` (`null` for any, and when left out), and import each into the project through the runtime's `import_asset`, which places it in its kind's folder. */
  | { kind: "import_assets_into_the_project"; project_folder: string; media: string[] | null }
  /** Put the asset `asset` of the project at `to_path`, renaming it, moving it or both, through the runtime's `relocate_asset`, by the person editing. */
  | { kind: "relocate_asset_in_the_project"; project_folder: string; asset: string; to_path: string }
  /** The preview picture of the asset `asset` of the project, an image's own or a video's poster frame, through the runtime's `read_asset_preview`. */
  | { kind: "read_asset_preview_in_the_project"; project_folder: string; asset: string }
  /** Stop tracking the asset `asset` of the project, its file leaving it, through the runtime's `delete_asset`, by the person editing. */
  | { kind: "delete_asset_from_the_project"; project_folder: string; asset: string }
  /** Recover the project's streams with `recovery`: their playback stopped and started again, or the project read again from disk. */
  | { kind: "recover_the_projects_streams"; project_folder: string; recovery: ProjectStreamsRecovery }
  /** Show the view type `view_type_id` in area `area_id` of the layout, in place of what it shows. */
  | { kind: "show_view_type_in_area"; view_type_id: string; area_id: string }
  /** Open the open project's Modules and Marketplace window on `shows`, or bring it forward on it, on the page of the Marketplace entry `page` names by the catalog's name for it when given. */
  | { kind: "open_modules_and_marketplace"; shows: ModulesAndMarketplaceSection; page?: string }
  /** The Marketplace's packages and samples, as its catalog lists them now. */
  | { kind: "read_the_marketplace" }
  /** Download the Marketplace's package `name`, by the catalog's name for it, and add it to the open project as a module. */
  | { kind: "add_from_the_marketplace"; name: string }
  /** Have the person choose a project asset in Studio's asset picker over the window, ending any asset pick held; answered once the picker closes. */
  | { kind: "pick_a_project_asset"; pick: ProjectAssetPick }
  /** End the asset pick held with the asset `asset` chosen, by its UUID. */
  | { kind: "answer_the_project_asset_pick"; asset: string }
  /** Grow the view's area to fill the window, or put the layout back; refused where the view shows outside a layout. */
  | { kind: "expand_the_area"; is_expanded: boolean };

/** One message a view sends Studio; a watch or ask id is a whole number, `0` or more. */
export type MessageFromTheView =
  | { kind: "watch"; watch_id: number; subject: ViewWatchedSubject }
  | { kind: "stop_watching"; watch_id: number }
  /** `payload`, beside a `send_output` ask: a `VideoFrame` for Image, which Studio then owns, or JSON. */
  | { kind: "ask"; ask_id: number; ask: ViewAsk; payload?: unknown };

/** What an input delivers: its port viewer's events, or why nothing is wired into it. */
export type ViewInputEvent = PortViewerEvent | { kind: "unwired"; because: string };

/** One reading of a watched subject, tagged with the subject's kind. */
export type ViewWatchedReading =
  | { subject: "open_project"; reading: OpenProjectReading }
  | { subject: "listed_streams"; reading: ListedStreamsReading }
  | { subject: "active_stream_tab"; reading: StreamTabAddress | null }
  | { subject: "selection"; reading: StudioSelection }
  | { subject: "stream_graph"; reading: StreamGraphReading }
  | { subject: "input_values"; reading: StreamInputValuesReading }
  | { subject: "project_log"; reading: ProjectLogReading }
  | { subject: "node_types"; reading: ProjectNodeTypesDescribedReading }
  | { subject: "project_assets"; reading: ProjectAssetsReading }
  | { subject: "project_transactions"; reading: ProjectTransactionsReading }
  | { subject: "studio_views"; reading: StudioViewsReading }
  | { subject: "node_ui_elements"; reading: NodeUiElementsReading }
  | { subject: "port_viewer"; reading: PortViewerEvent }
  | { subject: "input"; reading: ViewInputEvent }
  | { subject: "python_language_server"; reading: PythonLanguageServerConnectionEvent }
  | { subject: "settings"; reading: JsonValue }
  | { subject: "opened_on"; reading: ViewOpenedOn }
  | { subject: "header_row"; reading: ViewHeaderRow }
  | { subject: "area_expansion"; reading: { is_expanded: boolean } }
  | { subject: "areas_for_the_view_type"; reading: AreasForAViewTypeReading }
  | { subject: "project_asset_pick"; reading: ProjectAssetPick | null };

/** What Studio answers an ask with: done, refused in words, or what was read, saved or listed. */
export type ViewAskAnswer =
  | { kind: "done" }
  | { kind: "refused"; because: string }
  | { kind: "project_file_read"; file_read: ProjectFileRead }
  | { kind: "project_file_saved"; version: string }
  | { kind: "node_file_created"; file: string; node_type: string }
  | { kind: "marketplace_read"; entries: MarketplaceEntry[] }
  | { kind: "marketplace_module_added"; folder: string }
  | { kind: "project_files_listed"; project_files: ProjectFiles }
  | { kind: "project_transaction_applied"; transaction: ProjectTransaction }
  | { kind: "project_graph_transaction_applied"; transaction: ProjectGraphTransaction }
  /** The runtime refused the action, structured; a refusal before it reached the runtime is `refused`. */
  | { kind: "project_action_refused"; refusal: ProjectActionRefusal }
  /** What the runtime's `check_link_candidates` answered, the contract's own answer. */
  | { kind: "link_candidates_checked"; result: LinkCandidatesCheckResult }
  | { kind: "the_person_editing"; author: ProjectTransactionAuthor }
  | { kind: "project_assets_imported"; assets_imported: ProjectAssetsImported }
  | { kind: "asset_preview_read"; picture: AssetPreviewPicture }
  /** The person closed the open dialog choosing no file. */
  | { kind: "nothing_chosen" }
  /** The asset the person chose in the asset picker, by its UUID. */
  | { kind: "project_asset_chosen"; asset: string }
  /** The asset picker closed with nothing chosen, and why: closed by the person, or another pick. */
  | { kind: "project_asset_pick_ended"; because: string };

/** What Studio granted the view, as it reads it on connecting: its id, the contract served, its placement, declared ports and the capabilities its manifest declares. */
export type ViewGrant = { view_type_id: string; contract: string } & Pick<TatolabViewManifest, "placement" | "inputs" | "outputs" | "capabilities">;

/** One message Studio sends a view. */
export type MessageFromStudio =
  | { kind: "hello"; grant: ViewGrant }
  | { kind: "watched"; watch_id: number; watched: ViewWatchedReading }
  | { kind: "watch_refused"; watch_id: number; because: string }
  | { kind: "answered"; ask_id: number; answer: ViewAskAnswer };
