import type { ReactNode } from "react";
import type { ControlDataAttributes } from "./control_data_attributes";

/** The banner's height, which the picture drawn into it is sized to. */
export const BANNER_HEADER_HEIGHT_PX = 260;

/** A wide picture across the top of a window, the app's name and version over its lower edge and the place's leading actions at its right. */
export function BannerHeader({
  appName,
  versionWords,
  banner,
  actions,
  ...controlDataAttributes
}: {
  appName: string;
  /** The version beside the name, or `null` while it is not known. */
  versionWords: string | null;
  /** The picture filling the banner, behind the name, the version and the actions. */
  banner: ReactNode;
  /** The buttons at the banner's lower right, leading action last. */
  actions: ReactNode;
} & ControlDataAttributes) {
  return (
    <header className="relative shrink-0 overflow-hidden bg-black" style={{ height: BANNER_HEADER_HEIGHT_PX }} {...controlDataAttributes}>
      {banner}
      <span aria-hidden className="pointer-events-none absolute inset-0 bg-linear-to-b from-transparent from-55% to-window/90" />
      <div className="absolute right-8 bottom-6 left-8 flex flex-wrap items-end gap-3">
        <h1 className="text-[28px] leading-[34px] font-semibold tracking-tight text-white">{appName}</h1>
        {versionWords !== null && <span className="mb-1 font-mono text-xs text-fg-2">{versionWords}</span>}
        <div className="ml-auto flex items-center gap-2.5">{actions}</div>
      </div>
    </header>
  );
}
