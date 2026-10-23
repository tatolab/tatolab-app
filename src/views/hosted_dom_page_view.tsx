// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { useLayoutEffect, useRef } from "react";
import { joinClassNames } from "./shadcn/class_names";
import type { HostedDomPage } from "./tatolab_window_context";

/**
 * Shows a DOM page inside React: the page's element is moved in while this is mounted, and the page is told it is
 * shown, then hidden when this unmounts. The page outlives it, keeping its state for the next time it is shown.
 */
export function HostedDomPageView({ hostedPage, className }: { hostedPage: HostedDomPage; className?: string }) {
  const hostElementRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const hostElement = hostElementRef.current;
    if (hostElement === null) return;
    hostElement.replaceChildren(hostedPage.element);
    hostedPage.setPageShown?.(true);
    return () => {
      hostedPage.setPageShown?.(false);
      hostedPage.element.remove();
    };
  }, [hostedPage]);
  return <div ref={hostElementRef} data-hosted-dom-page="" className={joinClassNames("flex min-h-0 flex-1 flex-col", className)} />;
}
