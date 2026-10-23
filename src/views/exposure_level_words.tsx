// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { Globe, Laptop, Lock } from "lucide-react";
import { presentExposureLevel } from "../presentation/stream_overview_presentation";
import { joinClassNames } from "./shadcn/class_names";

/** An output's level beside its lock, laptop or globe, its meaning in a tooltip. */
export function ExposureLevelWords({ level, className }: { level: string; className?: string }) {
  const exposureLevel = presentExposureLevel(level);
  const LevelIcon = exposureLevel.icon === "public" ? Globe : exposureLevel.icon === "this_machine" ? Laptop : exposureLevel.icon === "internal" ? Lock : null;
  return (
    <span className={joinClassNames("inline-flex items-center gap-1 text-fg-2", className)} title={exposureLevel.meaning ?? undefined}>
      {LevelIcon !== null && <LevelIcon className="size-3.5 text-fg-3" strokeWidth={1.75} aria-hidden />}
      {exposureLevel.label}
    </span>
  );
}
