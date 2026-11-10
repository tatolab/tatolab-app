import {
  Blocks,
  Box,
  Code,
  FileCode,
  FileImage,
  FileJson,
  FileText,
  FolderTree,
  Folder,
  FolderInput,
  Hourglass,
  LayoutPanelTop,
  ListTree,
  MonitorPlay,
  Network,
  Package,
  Shapes,
  SlidersHorizontal,
  TriangleAlert,
  Workflow,
  type LucideIcon,
} from "lucide-react";

/** An icon by the name a view or a row asks for it with, a string so it crosses a view's host connection as JSON. */
export type StudioIconName =
  | "outliner"
  | "stream_graph"
  | "properties"
  | "viewer"
  | "code"
  | "palette"
  | "project_view"
  | "project_folder"
  | "project"
  | "imports"
  | "file"
  | "code_file"
  | "data_file"
  | "image_file"
  | "folder"
  | "files"
  | "stream"
  | "node_category"
  | "node_type"
  | "graph_generator"
  | "waiting"
  | "unreadable"
  | "failed";

const STUDIO_ICONS: Record<StudioIconName, LucideIcon> = {
  outliner: ListTree,
  stream_graph: Workflow,
  properties: SlidersHorizontal,
  viewer: MonitorPlay,
  code: Code,
  palette: Shapes,
  project_view: Box,
  project_folder: LayoutPanelTop,
  project: Package,
  imports: FolderInput,
  file: FileText,
  code_file: FileCode,
  data_file: FileJson,
  image_file: FileImage,
  folder: Folder,
  files: FolderTree,
  stream: Workflow,
  node_category: Folder,
  node_type: Blocks,
  graph_generator: Network,
  waiting: Hourglass,
  unreadable: TriangleAlert,
  failed: TriangleAlert,
};

/** The icon `iconName` names. */
export function studioIconNamed(iconName: StudioIconName): LucideIcon {
  return STUDIO_ICONS[iconName];
}
