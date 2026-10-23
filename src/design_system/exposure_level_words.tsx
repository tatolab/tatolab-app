// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { cn } from "cn";
import { Globe, Laptop, Lock } from "lucide-react";
import { presentExposureLevel } from "../presentation/stream_overview_presentation";

/** An output's level beside its lock, laptop or globe, its meaning in a tooltip; small beside an address, regular in running text. */
export function ExposureLevelWords({ level, size = "small" }: { level: string; size?: "regular" | "small" }) {
  const exposureLevel = presentExposureLevel(level);
  const LevelIcon = exposureLevel.icon === "public" ? Globe : exposureLevel.icon === "this_machine" ? Laptop : exposureLevel.icon === "internal" ? Lock : null;
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 text-fg-2", size === "small" && "text-xs")} title={exposureLevel.meaning ?? undefined}>
      {LevelIcon !== null && <LevelIcon className="size-3.5 text-fg-3" strokeWidth={1.75} aria-hidden />}
      {exposureLevel.label}
    </span>
  );
}
