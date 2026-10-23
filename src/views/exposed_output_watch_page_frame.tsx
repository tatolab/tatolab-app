// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { joinClassNames } from "./shadcn/class_names";

/**
 * The runtime's preview page of one exposed output, on its loopback origin: the window's content security policy frames
 * that one origin, and the main process lets a frame navigate only to its `/watch/` pages.
 */
export function ExposedOutputWatchPageFrame({ watchPageUrl, fullAddress, className }: { watchPageUrl: string; fullAddress: string; className?: string }) {
  return (
    <iframe
      key={watchPageUrl}
      src={watchPageUrl}
      title={`Preview of ${fullAddress}`}
      sandbox="allow-scripts allow-same-origin"
      allow="autoplay; fullscreen"
      referrerPolicy="no-referrer"
      className={joinClassNames("block bg-black ring-1 ring-line", className)}
      data-exposed-output-watch-page={fullAddress}
    />
  );
}
