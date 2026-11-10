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

/** An asset's picture: tinted by what it is, with quiet words at its foot, as its format. */
export function ProjectAssetPicture({ tone, words }: { tone: ProjectAssetPictureTone; words: string }) {
  return <span className={cn("flex aspect-[16/9] w-full items-end rounded-[4px] px-1.5 py-1 text-2xs text-fg-2", PICTURE_TONE_CLASS_NAMES[tone])}>{words}</span>;
}

/** One asset in a grid of a project's assets: a tinted picture with a word on it such as its format, its file's name, and what it is and how big; pressing it selects it, the selected one outlined. */
export function ProjectAssetCard({
  name,
  kindAndSizeWords,
  pictureTone,
  pictureWords,
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
      <ProjectAssetPicture tone={pictureTone} words={pictureWords} />
      <span className="mt-1 truncate text-[13px] font-semibold text-fg">{name}</span>
      <span className="truncate text-2xs text-fg-3">{kindAndSizeWords}</span>
    </button>
  );
}
