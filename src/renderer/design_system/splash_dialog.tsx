import { cn } from "cn";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { ControlDataAttributes } from "./control_data_attributes";
import { FULL_STRENGTH_FOCUS_RING_CLASS_NAMES } from "./full_strength_focus_ring";

/** The splash's banner height, which the picture drawn into it is sized to. */
export const SPLASH_DIALOG_BANNER_HEIGHT_PX = 340;
/** The splash's width, which the picture drawn into its banner is sized to. */
export const SPLASH_DIALOG_WIDTH_PX = 720;

/**
 * A splash over the window, as a creative app greets its launch: a wide picture with the app's name and version on
 * it, and under it columns of plain lists. It has no close button; Escape or a click outside closes it.
 */
export function SplashDialog({
  isOpen,
  onClosed,
  title,
  appName,
  versionWords,
  banner,
  children,
  ...controlDataAttributes
}: {
  isOpen: boolean;
  onClosed: () => void;
  /** The dialog's accessible name, as "Welcome to Tato Studio". */
  title: string;
  appName: string;
  /** The version in the banner's corner, or `null` while it is not known. */
  versionWords: string | null;
  /** The picture filling the banner, behind the name and version. */
  banner: ReactNode;
  /** The splash's columns: each a `SplashDialogList`. */
  children: ReactNode;
} & ControlDataAttributes) {
  return (
    <Dialog open={isOpen} onOpenChange={(isOpenNow) => !isOpenNow && onClosed()}>
      <DialogContent
        showCloseButton={false}
        className="max-w-[calc(100vw-2rem)] gap-0 overflow-hidden rounded-xl border-line-strong bg-raised p-0 sm:max-w-none"
        style={{ width: SPLASH_DIALOG_WIDTH_PX }}
        {...controlDataAttributes}
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <div className="relative overflow-hidden bg-black" style={{ height: SPLASH_DIALOG_BANNER_HEIGHT_PX }}>
          {banner}
          <span className="pointer-events-none absolute top-4.5 left-5.5 text-xl leading-6 font-semibold tracking-tight text-white" aria-hidden>
            {appName}
          </span>
          {versionWords !== null && <span className="pointer-events-none absolute top-5 right-5 font-mono text-xs text-fg-2">{versionWords}</span>}
        </div>
        <div className="grid grid-cols-2 gap-8 px-7 pt-5 pb-6">{children}</div>
      </DialogContent>
    </Dialog>
  );
}

/** One column of a splash: its heading and its rows. */
export function SplashDialogList({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-0.5" aria-label={heading}>
      <h2 className="mb-1.5 label-caps">{heading}</h2>
      {children}
    </section>
  );
}

/** One row of a splash's list: an icon or not, its words, and words at its end, as when a project was opened; pressing it acts and closes the splash. */
export function SplashDialogListRow({
  icon: RowIcon,
  words,
  trailingWords,
  onPressed,
  ...controlDataAttributes
}: {
  icon?: LucideIcon;
  words: string;
  trailingWords?: string;
  onPressed: () => void;
} & ControlDataAttributes) {
  return (
    <button
      type="button"
      onClick={onPressed}
      className={cn("-mx-2 flex h-8 min-w-0 items-center gap-2.5 rounded-md px-2 text-left text-sm text-fg outline-none hover:bg-hover", FULL_STRENGTH_FOCUS_RING_CLASS_NAMES)}
      {...controlDataAttributes}
    >
      {RowIcon !== undefined && <RowIcon className="size-4 shrink-0 text-fg-2" strokeWidth={1.5} aria-hidden />}
      <span className="min-w-0 flex-1 truncate">{words}</span>
      {trailingWords !== undefined && <span className="shrink-0 text-xs text-fg-3">{trailingWords}</span>}
    </button>
  );
}
