import { ArrowUp, ChevronRight } from "lucide-react";
import { ActionButton } from "@tatolab/tato-app-view-sdk/design_system/action_button";
import { KeyboardKey } from "@tatolab/tato-app-view-sdk/design_system/keyboard_key";
import { ReadOnlyBanner } from "@tatolab/tato-app-view-sdk/design_system/read_only_banner";
import type { StreamGraphNode } from "@tatolab/tato-app-view-sdk/studio_readings";
import { whyTheInsideOfTheSubgraphIsReadOnly } from "./stream_graph_levels";

/** Why Unlock and Refresh act only on a subgraph of the stream's own level: the runtime's actions name nothing deeper. */
const ONLY_THE_STREAMS_OWN_LEVEL_IS_EDITED = "The runtime unlocks and refreshes only a subgraph of the stream's own level";

/** The trail of levels stepped through, each one a step back out, and Up (U) to the level before. */
export function StreamGraphSubgraphTrail({
  streamDisplayName,
  subgraphsSteppedThrough,
  onLevelChosen,
}: {
  streamDisplayName: string;
  subgraphsSteppedThrough: readonly StreamGraphNode[];
  /** Told how many subgraphs deep the chosen level is, the stream's own being 0. */
  onLevelChosen: (depth: number) => void;
}) {
  const levelNames = [streamDisplayName, ...subgraphsSteppedThrough.map((subgraph) => subgraph.name)];
  return (
    <nav aria-label="Subgraph levels" className="flex min-h-8 items-center gap-1 border-b px-2 text-xs text-fg-2" data-stream-graph-subgraph-trail="">
      {levelNames.map((levelName, depth) => (
        <span key={`${depth}:${levelName}`} className="flex min-w-0 items-center gap-1">
          {depth > 0 && <ChevronRight className="size-3 shrink-0 text-fg-3" strokeWidth={2} aria-hidden />}
          {depth === levelNames.length - 1 ? (
            <span className="truncate font-semibold text-fg" aria-current="location">
              {levelName}
            </span>
          ) : (
            <button type="button" className="truncate rounded-sm px-1 hover:bg-hover hover:text-fg" onClick={() => onLevelChosen(depth)} data-stream-graph-subgraph-level={depth}>
              {levelName}
            </button>
          )}
        </span>
      ))}
      <span className="ml-auto flex items-center gap-1.5">
        <ActionButton size="small" icon={ArrowUp} onPressed={() => onLevelChosen(levelNames.length - 2)} data-stream-graph-action="subgraph_up">
          Up
        </ActionButton>
        <KeyboardKey>U</KeyboardKey>
      </span>
    </nav>
  );
}

/** Over the inside of a subgraph: why it is read only, with Refresh from code for a graph generator's and Unlock for one the runtime can unlock. */
export function StreamGraphSubgraphReadOnlyBanner({
  subgraph,
  isOnTheStreamsOwnLevel,
  editsRefusedBecause,
  onRefreshed,
  onUnlocked,
}: {
  subgraph: StreamGraphNode;
  isOnTheStreamsOwnLevel: boolean;
  /** Why no edit can be sent at all, such as a graph naming no stream asset; `null` when one can. */
  editsRefusedBecause: string | null;
  onRefreshed: () => void;
  onUnlocked: () => void;
}) {
  const kind = subgraph.fragment?.kind ?? null;
  const disabledReason = editsRefusedBecause ?? (isOnTheStreamsOwnLevel ? null : ONLY_THE_STREAMS_OWN_LEVEL_IS_EDITED);
  return (
    <ReadOnlyBanner
      words={whyTheInsideOfTheSubgraphIsReadOnly(subgraph)}
      action={
        <span className="flex shrink-0 items-center gap-1">
          {kind === "generated" && (
            <ActionButton size="small" disabledReason={disabledReason} onPressed={onRefreshed} data-stream-graph-action="subgraph_refresh">
              Refresh from code
            </ActionButton>
          )}
          {kind !== "placed_stream" && (
            <ActionButton size="small" disabledReason={disabledReason} onPressed={onUnlocked} data-stream-graph-action="subgraph_unlock">
              Unlock
            </ActionButton>
          )}
        </span>
      }
      data-stream-graph-subgraph-read-only={kind ?? undefined}
    />
  );
}
