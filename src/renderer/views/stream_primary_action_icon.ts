import { type LucideIcon, Play, ShieldCheck, Square } from "lucide-react";
import type { StreamPrimaryActionName } from "../presentation/stream_presentation";

/** The icon a stream's leading action shows: a square for Stop, a play triangle for Start and Retry, a shield for Allow. */
export function streamPrimaryActionIcon(streamAction: StreamPrimaryActionName): LucideIcon {
  switch (streamAction) {
    case "stop_stream":
      return Square;
    case "start_stream":
      return Play;
    case "restart_to_be_asked_for_capture_device_access":
      return ShieldCheck;
  }
}
