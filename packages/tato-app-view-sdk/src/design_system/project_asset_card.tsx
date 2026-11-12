import { cn } from "cn";
import type { ReactNode } from "react";
import { MoreActionsMenu } from "./menus";
import { RuntimeFailureWords } from "./runtime_failure_words";
import type { ControlDataAttributes } from "./support/control_data_attributes";
import { FULL_STRENGTH_FOCUS_RING_CLASS_NAMES } from "./support/full_strength_focus_ring";

/** The tint an asset card's picture takes from what the asset is. */
export type ProjectAssetPictureTone = "media" | "scene" | "data" | "other";

const PICTURE_TONE_CLASS_NAMES: Record<ProjectAssetPictureTone, string> = {
  media: "bg-studio-asset-media",
  scene: "bg-studio-asset-scene",
  data: "bg-studio-asset-data",
  other: "bg-studio-control",
};

/** An asset's 16:9 picture with quiet words at its foot, as its format: its preview picture, cropped to fill, when one is given, otherwise tinted by what it is. */
function ProjectAssetPicture({ tone, words, previewPictureUrl }: { tone: ProjectAssetPictureTone; words: string; previewPictureUrl: string | null }) {
  return (
    <span
      className={cn("relative flex aspect-[16/9] w-full items-end overflow-hidden rounded-[4px] px-1.5 py-1 text-2xs", previewPictureUrl === null ? PICTURE_TONE_CLASS_NAMES[tone] : "bg-well")}
      data-project-asset-picture={previewPictureUrl === null ? "tinted" : "preview"}
    >
      {previewPictureUrl !== null && <img src={previewPictureUrl} alt="" draggable={false} className="absolute inset-0 size-full object-cover" />}
      <span className={cn("relative", previewPictureUrl === null ? "text-fg-2" : "-mx-1 rounded-[3px] bg-studio-asset-card px-1 text-fg")}>{words}</span>
    </span>
  );
}

/** The ⋯ menu's place over the card's picture: out of sight until the card is under the pointer, holds the keyboard's focus, or has its menu open. */
const ASSET_CARD_MORE_ACTIONS_CLASS_NAMES =
  "absolute top-3 right-3 opacity-0 transition-opacity duration-150 group-hover/asset-card:opacity-100 group-focus-within/asset-card:opacity-100 group-has-[[data-popup-open]]/asset-card:opacity-100";

/** One asset in a grid of a project's assets: its preview picture, or a tinted one, with a word on it such as its format, its file's name, what it is and how big, and a ⋯ menu over its picture where `moreActions` is given; pressing it selects it, the selected one outlined. */
export function ProjectAssetCard({
  name,
  kindAndSizeWords,
  pictureTone,
  pictureWords,
  previewPictureUrl,
  previewPictureNotReadBecause = null,
  isSelected,
  onSelected,
  moreActions,
  ...controlDataAttributes
}: {
  name: string;
  /** As "media · 38 MB". */
  kindAndSizeWords: string;
  pictureTone: ProjectAssetPictureTone;
  /** Quiet words at the picture's foot, as "MP4". */
  pictureWords: string;
  /** A `data:` URL of the asset's preview picture, `null` while it has none or none is read yet. */
  previewPictureUrl: string | null;
  /** The runtime's words for why the preview picture was not read, shown under the card; `null` where nothing was refused. */
  previewPictureNotReadBecause?: string | null;
  isSelected: boolean;
  onSelected: () => void;
  /** The ⋯ menu's label and its items, as Rename…; no menu where absent. */
  moreActions?: { label: string; items: ReactNode };
} & ControlDataAttributes) {
  return (
    <div className="group/asset-card relative flex min-w-0 flex-col gap-1">
      <button
        type="button"
        aria-pressed={isSelected}
        onClick={onSelected}
        className={cn(
          "flex w-full min-w-0 flex-col gap-1 rounded-md border bg-studio-asset-card p-2 text-left outline-none hover:border-line-strong",
          FULL_STRENGTH_FOCUS_RING_CLASS_NAMES,
          isSelected ? "border-brand" : "border-line",
        )}
        {...controlDataAttributes}
      >
        <ProjectAssetPicture tone={pictureTone} words={pictureWords} previewPictureUrl={previewPictureUrl} />
        <span className="mt-1 truncate text-[13px] font-semibold text-fg">{name}</span>
        <span className="truncate text-2xs text-fg-3">{kindAndSizeWords}</span>
      </button>
      {previewPictureNotReadBecause !== null && <RuntimeFailureWords words={previewPictureNotReadBecause} data-project-asset-preview-refusal="" />}
      {moreActions !== undefined && (
        <div className={ASSET_CARD_MORE_ACTIONS_CLASS_NAMES}>
          <MoreActionsMenu label={moreActions.label} isOverAPicture data-project-asset-more-actions="">
            {moreActions.items}
          </MoreActionsMenu>
        </div>
      )}
    </div>
  );
}
