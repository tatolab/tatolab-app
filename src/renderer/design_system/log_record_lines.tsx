import { cn } from "cn";
import { useLayoutEffect, useRef } from "react";
import type { ControlDataAttributes } from "./control_data_attributes";

/** One line of a log: when, how serious, and what it says. */
export interface LogRecordLine {
  line_id: string;
  time_words: string;
  /** As the record names it, such as `info` or `error`; `null` when it names none. */
  level: string | null;
  words: string;
}

const LEVEL_CLASS_NAMES: Record<string, string> = { error: "text-danger-text", warn: "text-warn-text", warning: "text-warn-text" };

/** A log's latest lines, in monospace, kept scrolled to the newest while the reader is at the bottom. */
export function LogRecordLines({ lines, whenEmpty, ...controlDataAttributes }: { lines: readonly LogRecordLine[]; whenEmpty: string } & ControlDataAttributes) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const isFollowingTheNewest = useRef(true);
  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (scroller !== null && isFollowingTheNewest.current) scroller.scrollTop = scroller.scrollHeight;
  }, [lines]);
  return (
    <div
      ref={scrollerRef}
      onScroll={(scrollEvent) => {
        const scroller = scrollEvent.currentTarget;
        isFollowingTheNewest.current = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 8;
      }}
      className="min-h-0 flex-1 overflow-y-auto py-1 font-mono text-2xs leading-[17px] select-text"
      {...controlDataAttributes}
    >
      {lines.length === 0 ? (
        <p className="px-3 py-1 text-fg-3">{whenEmpty}</p>
      ) : (
        lines.map((line) => (
          <div key={line.line_id} className="flex gap-2 px-3 hover:bg-hover" data-log-record-level={line.level ?? "none"}>
            <span className="shrink-0 text-fg-4">{line.time_words}</span>
            <span className={cn("w-10 shrink-0", LEVEL_CLASS_NAMES[line.level ?? ""] ?? "text-fg-3")}>{line.level ?? ""}</span>
            <span className="min-w-0 flex-1 break-words whitespace-pre-wrap text-fg-2">{line.words}</span>
          </div>
        ))
      )}
    </div>
  );
}
