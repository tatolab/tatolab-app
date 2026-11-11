import { ChevronDown, ChevronUp, X } from "lucide-react";
import { createContext, useEffect, useRef } from "react";
import { IconButton } from "./icon_button";
import { SearchField } from "./search_field";
import { whereTheSearchMatches } from "./matched_words";

/** The nodes a find over the graph highlights, and the one it is on, which reads more strongly; nothing outside a find. */
export interface NodeGraphNodesFound {
  found_node_ids: ReadonlySet<string>;
  current_node_id: string | null;
}

/** No find open: no node highlighted. */
export const NO_NODE_GRAPH_NODE_FOUND: NodeGraphNodesFound = { found_node_ids: new Set(), current_node_id: null };

/** The nodes a find highlights, which each card reads to draw itself found. */
export const NodeGraphNodesFoundContext = createContext<NodeGraphNodesFound>(NO_NODE_GRAPH_NODE_FOUND);

/** The ids of `nodes` whose title or type name matches `findWords`, ignoring case, in their order; none for blank words. */
export function nodeGraphNodeIdsMatching(nodes: readonly { node_id: string; title: string; type_name: string | null }[], findWords: string): string[] {
  if (findWords.trim() === "") return [];
  return nodes
    .filter((graphNode) => whereTheSearchMatches(graphNode.title, findWords) !== null || (graphNode.type_name !== null && whereTheSearchMatches(graphNode.type_name, findWords) !== null))
    .map((graphNode) => graphNode.node_id);
}

/** The match a step of `step` moves to from `currentIndex` among `matchCount` matches, wrapping at either end. */
export function nodeGraphFindIndexAfterAStep(currentIndex: number, matchCount: number, step: 1 | -1): number {
  if (matchCount === 0) return 0;
  return (currentIndex + step + matchCount) % matchCount;
}

/** How far through the matches the find is, as "1 of 3", or "No results". */
export function nodeGraphFindProgressWords(currentIndex: number, matchCount: number): string {
  return matchCount === 0 ? "No results" : `${currentIndex + 1} of ${matchCount}`;
}

/**
 * The find bar over a graph's top right: the words, how far through the matches it is, the previous and next match, and
 * ×. ↵ and ⇧↵ or the arrows move between matches, and Esc closes it.
 */
export function NodeGraphFindBar({
  findWords,
  onFindWordsChanged,
  currentIndex,
  matchCount,
  onStepped,
  onClosed,
}: {
  findWords: string;
  onFindWordsChanged: (findWords: string) => void;
  currentIndex: number;
  matchCount: number;
  onStepped: (step: 1 | -1) => void;
  onClosed: () => void;
}) {
  const findField = useRef<HTMLInputElement>(null);
  useEffect(() => findField.current?.focus(), []);
  const hasWords = findWords.trim() !== "";
  return (
    <div
      role="search"
      aria-label="Find nodes"
      className="nodrag nopan absolute top-2 right-2 z-10 flex items-center gap-1 rounded-md border border-line bg-studio-graph-tools p-1 shadow-lg"
      onKeyDownCapture={(keyboardEvent) => {
        if (keyboardEvent.key === "Escape") {
          keyboardEvent.preventDefault();
          keyboardEvent.stopPropagation();
          onClosed();
        } else if (keyboardEvent.key === "Enter" || keyboardEvent.key === "ArrowDown" || keyboardEvent.key === "ArrowUp") {
          keyboardEvent.preventDefault();
          keyboardEvent.stopPropagation();
          onStepped(keyboardEvent.key === "ArrowUp" || (keyboardEvent.key === "Enter" && keyboardEvent.shiftKey) ? -1 : 1);
        }
      }}
      data-node-graph-find-bar=""
    >
      <SearchField label="Find nodes" placeholder="Find nodes" text={findWords} onTextChanged={onFindWordsChanged} inputRef={findField} data-node-graph-find-words="" />
      <span role="status" className="min-w-16 px-1 text-center text-xs whitespace-nowrap text-fg-3" data-node-graph-find-progress="">
        {hasWords ? nodeGraphFindProgressWords(currentIndex, matchCount) : ""}
      </span>
      <IconButton icon={ChevronUp} label="Previous match" tooltip="Previous match (⇧↵)" size="compact" disabledReason={matchCount === 0 ? "Nothing matches" : null} onPressed={() => onStepped(-1)} data-node-graph-find-step="previous" />
      <IconButton icon={ChevronDown} label="Next match" tooltip="Next match (↵)" size="compact" disabledReason={matchCount === 0 ? "Nothing matches" : null} onPressed={() => onStepped(1)} data-node-graph-find-step="next" />
      <IconButton icon={X} label="Close find" tooltip="Close (Esc)" size="compact" onPressed={onClosed} data-node-graph-find-close="" />
    </div>
  );
}
