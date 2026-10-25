// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { cn } from "cn";

/**
 * The runtime's preview page of one exposed output, on its loopback origin: the window's content security policy frames
 * that one origin, and the main process lets a frame navigate only to its `/watch/` pages.
 */
export function ExposedOutputWatchPageFrame({
  watchPageUrl,
  fullAddress,
  className,
  isOutOfTheKeyboardsWay = false,
}: {
  watchPageUrl: string;
  fullAddress: string;
  className?: string;
  /** For a frame that repeats a preview offered elsewhere: it takes no Tab stop and is hidden from a screen reader. */
  isOutOfTheKeyboardsWay?: boolean;
}) {
  return (
    <iframe
      key={watchPageUrl}
      src={watchPageUrl}
      title={`Preview of ${fullAddress}`}
      sandbox="allow-scripts allow-same-origin"
      allow="autoplay; fullscreen"
      referrerPolicy="no-referrer"
      tabIndex={isOutOfTheKeyboardsWay ? -1 : undefined}
      aria-hidden={isOutOfTheKeyboardsWay || undefined}
      className={cn("block bg-black ring-1 ring-line", className)}
      data-exposed-output-watch-page={fullAddress}
    />
  );
}
