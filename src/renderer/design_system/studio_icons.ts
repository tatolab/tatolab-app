import {
  Box,
  Code,
  FileText,
  FolderInput,
  Hourglass,
  LayoutPanelTop,
  ListTree,
  MonitorPlay,
  Package,
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
  | "project_view"
  | "project_folder"
  | "project"
  | "imports"
  | "file"
  | "stream"
  | "waiting"
  | "unreadable";

const STUDIO_ICONS: Record<StudioIconName, LucideIcon> = {
  outliner: ListTree,
  stream_graph: Workflow,
  properties: SlidersHorizontal,
  viewer: MonitorPlay,
  code: Code,
  project_view: Box,
  project_folder: LayoutPanelTop,
  project: Package,
  imports: FolderInput,
  file: FileText,
  stream: Workflow,
  waiting: Hourglass,
  unreadable: TriangleAlert,
};

/** The icon `iconName` names. */
export function studioIconNamed(iconName: StudioIconName): LucideIcon {
  return STUDIO_ICONS[iconName];
}
