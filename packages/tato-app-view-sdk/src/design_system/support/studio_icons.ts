import {
  Blocks,
  Box,
  Code,
  FileText,
  Folder,
  FolderInput,
  Hourglass,
  LayoutPanelTop,
  ListTree,
  MonitorPlay,
  Network,
  Package,
  Shapes,
  SquareDashed,
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
  | "folder"
  | "stream"
  | "graph_group"
  | "graph_node"
  | "node_category"
  | "node_type"
  | "graph_generator"
  | "waiting"
  | "unreadable"
  | "not_ready"
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
  folder: Folder,
  stream: Workflow,
  graph_group: SquareDashed,
  graph_node: Box,
  node_category: Folder,
  node_type: Blocks,
  graph_generator: Network,
  waiting: Hourglass,
  unreadable: TriangleAlert,
  not_ready: TriangleAlert,
  failed: TriangleAlert,
};

/** The icon `iconName` names. */
export function studioIconNamed(iconName: StudioIconName): LucideIcon {
  return STUDIO_ICONS[iconName];
}
