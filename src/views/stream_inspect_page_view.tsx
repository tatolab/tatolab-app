// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { cn } from "cn";
import { ChevronRight, FileBraces, SquareTerminal } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import type { ListedStream } from "../backend/tatolab_backend_contract";
import {
  outlineOfTheGraphDocument,
  readTheGraphDocument,
  syntaxPartsOfAJsonLine,
  type GraphDocumentValue,
  type JsonSyntaxKind,
} from "../presentation/stream_graph_document_presentation";
import { streamGraphDocumentCommand } from "../presentation/stream_overview_presentation";
import { isStreamLoaded } from "../presentation/stream_presentation";
import { CopyWordsButton } from "../design_system/copy_words_button";
import { EmptyState } from "../design_system/empty_state";
import { ListRowButton } from "../design_system/list_row_button";
import { SegmentedChoiceControl } from "../design_system/segmented_choice_control";
import { useStreamGraphReading } from "./tatolab_window_context";

/** A top-level key's line in the raw document, as the runtime's two-space indentation writes it. */
const TOP_LEVEL_KEY_LINE = /^ {2}"((?:[^"\\]|\\.)*)":/;

const SYNTAX_COLOUR: Record<JsonSyntaxKind, string> = {
  key: "text-fg",
  string: "text-fg-2",
  number: "text-brand-text",
  literal: "text-brand-text italic",
  punctuation: "text-fg-3",
};

/** Whether Inspect shows the document as the runtime wrote it, or as a tree to fold. */
type GraphDocumentView = "raw" | "tree";

function anchorIdOfTopLevelKey(key: string): string {
  return `inspect-${encodeURIComponent(key)}`;
}

function RawGraphDocument({ graphDocumentText, highlightedKey }: { graphDocumentText: string; highlightedKey: string | null }) {
  // A poll that brings the same text renders nothing new; one that moves a counter replaces only the text that changed.
  const lines = useMemo(
    () => graphDocumentText.split("\n").map((line) => ({ topLevelKey: TOP_LEVEL_KEY_LINE.exec(line)?.[1] ?? null, syntaxParts: syntaxPartsOfAJsonLine(line) })),
    [graphDocumentText],
  );
  const gutterWidth = `calc(${String(lines.length).length}ch + 2rem)`;
  return (
    <div className="min-w-max py-2 font-mono text-xs leading-5 select-text" data-graph-document-view="raw">
      {lines.map(({ topLevelKey, syntaxParts }, lineIndex) => {
        return (
          <div
            key={lineIndex}
            id={topLevelKey === null ? undefined : anchorIdOfTopLevelKey(topLevelKey)}
            className={cn("flex scroll-mt-2 pr-6 hover:bg-hover", topLevelKey !== null && topLevelKey === highlightedKey && "bg-brand-soft hover:bg-brand-soft")}
          >
            <span className="shrink-0 pr-4 pl-4 text-right text-fg-3 tabular select-none" style={{ width: gutterWidth }}>
              {lineIndex + 1}
            </span>
            <span className="whitespace-pre">
              {syntaxParts.map((part, partIndex) => (
                <span key={partIndex} className={SYNTAX_COLOUR[part.kind]}>
                  {part.text}
                </span>
              ))}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function scalarWords(value: GraphDocumentValue): { text: string; kind: JsonSyntaxKind } {
  switch (value.kind) {
    case "string":
      return { text: JSON.stringify(value.text), kind: "string" };
    case "number":
      return { text: value.literal, kind: "number" };
    case "literal":
      return { text: value.literal, kind: "literal" };
    case "array":
      return { text: `[${value.items.length}]`, kind: "punctuation" };
    case "object":
      return { text: `{${value.entries.length}}`, kind: "punctuation" };
  }
}

function GraphDocumentTreeNode({
  name,
  value,
  path,
  depth,
  openPaths,
  togglePath,
  highlightedKey,
}: {
  name: string;
  value: GraphDocumentValue;
  path: string;
  depth: number;
  openPaths: ReadonlySet<string>;
  togglePath: (path: string) => void;
  highlightedKey: string | null;
}) {
  const children: [string, GraphDocumentValue][] =
    value.kind === "object" ? value.entries : value.kind === "array" ? value.items.map((item, itemIndex) => [String(itemIndex), item]) : [];
  const canOpen = value.kind === "object" || value.kind === "array";
  const isOpen = openPaths.has(path);
  const words = scalarWords(value);
  const isHighlighted = depth === 0 && name === highlightedKey;
  const rowWords = (
    <>
      <span className="text-fg">{name}</span>
      <span className="text-fg-3">:</span>
      <span className={cn("truncate select-text", SYNTAX_COLOUR[words.kind])}>{words.text}</span>
    </>
  );
  return (
    <div id={depth === 0 ? anchorIdOfTopLevelKey(name) : undefined} className="scroll-mt-2">
      {canOpen ? (
        <ListRowButton
          aria-expanded={isOpen}
          onPressed={() => togglePath(path)}
          className={cn("h-[22px] gap-1 rounded-none pr-4 font-mono text-xs", isHighlighted && "bg-brand-soft hover:bg-brand-soft dark:hover:bg-brand-soft")}
          style={{ paddingLeft: 12 + depth * 16 }}
        >
          <ChevronRight className={cn("size-3.5 shrink-0 text-fg-3 transition-transform", isOpen && "rotate-90")} strokeWidth={1.75} aria-hidden />
          {rowWords}
        </ListRowButton>
      ) : (
        <div className={cn("flex h-[22px] w-full items-center gap-1 pr-4", isHighlighted && "bg-brand-soft")} style={{ paddingLeft: 12 + depth * 16 }}>
          <span className="w-3.5 shrink-0" />
          {rowWords}
        </div>
      )}
      {canOpen && isOpen && (
        <div>
          {children.map(([childName, childValue]) => (
            <GraphDocumentTreeNode
              key={childName}
              name={childName}
              value={childValue}
              path={`${path}.${childName}`}
              depth={depth + 1}
              openPaths={openPaths}
              togglePath={togglePath}
              highlightedKey={highlightedKey}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function GraphDocumentTree({ graphDocument, highlightedKey }: { graphDocument: GraphDocumentValue; highlightedKey: string | null }) {
  const [openPaths, setOpenPaths] = useState<ReadonlySet<string>>(() => new Set(["$.nodes", "$.exposed"]));
  const togglePath = (path: string) =>
    setOpenPaths((paths) => {
      const nextPaths = new Set(paths);
      if (nextPaths.has(path)) nextPaths.delete(path);
      else nextPaths.add(path);
      return nextPaths;
    });
  const entries = graphDocument.kind === "object" ? graphDocument.entries : [];
  return (
    <div className="py-2 font-mono text-xs" data-graph-document-view="tree">
      {entries.map(([key, value]) => (
        <GraphDocumentTreeNode key={key} name={key} value={value} path={`$.${key}`} depth={0} openPaths={openPaths} togglePath={togglePath} highlightedKey={highlightedKey} />
      ))}
    </div>
  );
}

function GraphDocumentViewSwitch({ shownView, onViewChosen }: { shownView: GraphDocumentView; onViewChosen: (view: GraphDocumentView) => void }) {
  return (
    <SegmentedChoiceControl
      label="Show the graph document"
      choices={[
        { choice: "raw", label: "Raw" },
        { choice: "tree", label: "Tree" },
      ]}
      chosen={shownView}
      onChosen={onViewChosen}
      dataAttributeOfEachSegment="data-graph-document-view-choice"
    />
  );
}

/** The command bar every state of Inspect shows: the terminal command that prints the same document. */
function GraphDocumentCommandBar({ command, children }: { command: string; children?: ReactNode }) {
  return (
    <div className="flex h-10 shrink-0 items-center gap-3 border-b px-4">
      <SquareTerminal className="size-4 shrink-0 text-fg-3" strokeWidth={1.75} aria-hidden />
      <code className="truncate text-xs text-fg-2 select-text">{command}</code>
      {children !== undefined && <div className="ml-auto flex items-center gap-2">{children}</div>}
    </div>
  );
}

/** Inspect: the `graph` document of the loaded stream exactly as `tatolab graph --stream` prints it, with an outline of its top-level keys. */
export function StreamInspectPageView({ stream }: { stream: ListedStream }) {
  const reading = useStreamGraphReading(stream.name);
  const [shownView, setShownView] = useState<GraphDocumentView>("raw");
  const [highlightedKey, setHighlightedKey] = useState<string | null>(null);
  const command = streamGraphDocumentCommand(stream.name);
  const graphDocumentText = reading.graphSource === "loaded" ? (reading.graph?.graph_document_text ?? null) : null;
  const graphDocument = useMemo(() => (graphDocumentText === null ? null : readTheGraphDocument(graphDocumentText)), [graphDocumentText]);

  if (!isStreamLoaded(stream) || graphDocumentText === null) {
    const isNotLoaded = !isStreamLoaded(stream);
    return (
      <div className="flex min-h-0 flex-1 flex-col" data-stream-inspect="">
        <GraphDocumentCommandBar command={command} />
        <EmptyState
          icon={FileBraces}
          title={isNotLoaded ? "No graph while the stream is not loaded" : reading.readRefusal === null ? "Reading its graph…" : "Its graph could not be read"}
          explanation={
            isNotLoaded
              ? `The runtime serves a stream's graph only while it is loaded. ${stream.state === "failed" ? "Retry it" : "Start it"} and the graph shows here, as the command prints it.`
              : (reading.readRefusal ?? "The graph shows here as the command prints it.")
          }
        />
      </div>
    );
  }

  const jumpToTopLevelKey = (key: string) => {
    setHighlightedKey(key);
    window.requestAnimationFrame(() => document.getElementById(anchorIdOfTopLevelKey(key))?.scrollIntoView({ block: "start" }));
  };
  return (
    <div className="flex min-h-0 flex-1" data-stream-inspect="">
      <aside aria-label="Graph document outline" className="scrollbar-thin w-56 shrink-0 overflow-y-auto border-r bg-chrome p-2">
        <h2 className="flex h-8 items-center gap-1 px-2 text-xs font-medium text-fg-3">
          Graph <FileBraces className="ml-auto size-3.5 text-fg-3" strokeWidth={1.75} aria-hidden />
        </h2>
        {(graphDocument === null ? [] : outlineOfTheGraphDocument(graphDocument)).map((outlineEntry) => (
          <ListRowButton
            key={outlineEntry.key}
            isSelected={highlightedKey === outlineEntry.key}
            onPressed={() => jumpToTopLevelKey(outlineEntry.key)}
            trailing={
              // fg-3 drops under 4.5:1 on a hovered or selected row over chrome, so the summary reads fg-2 there.
              <span
                className={cn(
                  "ml-auto max-w-[50%] shrink-0 truncate text-xs tabular group-hover/list-row:text-fg-2",
                  highlightedKey === outlineEntry.key ? "text-fg-2" : "text-fg-3",
                )}
              >
                {outlineEntry.summary}
              </span>
            }
          >
            <span className="truncate font-mono text-xs">{outlineEntry.key}</span>
          </ListRowButton>
        ))}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <GraphDocumentCommandBar command={command}>
          <GraphDocumentViewSwitch shownView={shownView} onViewChosen={setShownView} />
          <CopyWordsButton readTextToCopy={() => graphDocumentText} />
        </GraphDocumentCommandBar>
        <div className="scrollbar-thin min-h-0 flex-1 overflow-auto">
          {shownView === "tree" && graphDocument !== null ? (
            <GraphDocumentTree graphDocument={graphDocument} highlightedKey={highlightedKey} />
          ) : (
            <RawGraphDocument graphDocumentText={graphDocumentText} highlightedKey={highlightedKey} />
          )}
        </div>
      </div>
    </div>
  );
}
