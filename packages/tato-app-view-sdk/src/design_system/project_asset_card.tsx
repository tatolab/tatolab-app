import { cn } from "cn";
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

/** How big an asset's picture is drawn: a card's, cropped to fill its 16:9 frame, or the details panel's, the whole picture letterboxed in it. */
export type ProjectAssetPictureSize = "card" | "details";

/**
 * An asset's picture: its preview picture when `previewPictureUrl` holds one, an image's own or a video's poster frame, otherwise tinted by what
 * the asset is; quiet words at its foot, as its format, over either.
 */
export function ProjectAssetPicture({
  tone,
  words,
  previewPictureUrl,
  size,
}: {
  tone: ProjectAssetPictureTone;
  words: string;
  /** A `data:` URL of the asset's preview picture, `null` while it has none or none is read yet. */
  previewPictureUrl: string | null;
  size: ProjectAssetPictureSize;
}) {
  return (
    <span
      className={cn(
        "relative flex aspect-[16/9] w-full items-end overflow-hidden rounded-[4px] px-1.5 py-1 text-2xs",
        previewPictureUrl === null ? PICTURE_TONE_CLASS_NAMES[tone] : "bg-well",
        size === "details" && "rounded-md border border-line",
      )}
      data-project-asset-picture={
        previewPictureUrl === null ? "tinted" : "preview"
      }
    >
      {previewPictureUrl !== null && (
        <img
          src={previewPictureUrl}
          alt=""
          draggable={false}
          className={cn(
            "absolute inset-0 size-full",
            size === "card" ? "object-cover" : "object-contain",
          )}
        />
      )}
      <span
        className={cn(
          "relative",
          previewPictureUrl === null
            ? "text-fg-2"
            : "rounded-[3px] bg-studio-asset-card px-1 text-fg",
        )}
      >
        {words}
      </span>
    </span>
  );
}

/** One asset in a grid of a project's assets: its preview picture, or a tinted one, with a word on it such as its format, its file's name, and what it is and how big; pressing it selects it, the selected one outlined. */
export function ProjectAssetCard({
  name,
  kindAndSizeWords,
  pictureTone,
  pictureWords,
  previewPictureUrl,
  isSelected,
  onSelected,
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
  isSelected: boolean;
  onSelected: () => void;
} & ControlDataAttributes) {
  return (
    <button
      type="button"
      aria-pressed={isSelected}
      onClick={onSelected}
      className={cn(
        "flex min-w-0 flex-col gap-1 rounded-md border bg-studio-asset-card p-2 text-left outline-none hover:border-line-strong",
        FULL_STRENGTH_FOCUS_RING_CLASS_NAMES,
        isSelected ? "border-brand" : "border-line",
      )}
      {...controlDataAttributes}
    >
      <ProjectAssetPicture
        tone={pictureTone}
        words={pictureWords}
        previewPictureUrl={previewPictureUrl}
        size="card"
      />
      <span className="mt-1 truncate text-[13px] font-semibold text-fg">
        {name}
      </span>
      <span className="truncate text-2xs text-fg-3">{kindAndSizeWords}</span>
    </button>
  );
}
