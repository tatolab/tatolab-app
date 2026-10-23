// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { Check, ChevronRight, Copy, FileBraces, SquareTerminal } from "lucide-react";
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
import { Button } from "./shadcn/button";
import { joinClassNames } from "./shadcn/class_names";
import { useCopiedConfirmation } from "./stream_action_controls";
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
  // Re-read on each poll, the text changes only where a counter moved; the rest of the lines keep their parts.
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
            className={joinClassNames("flex scroll-mt-2 pr-6 hover:bg-hover", topLevelKey !== null && topLevelKey === highlightedKey && "bg-brand-soft hover:bg-brand-soft")}
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
  const rowClassName = joinClassNames(
    "flex h-[22px] w-full cursor-default items-center gap-1 pr-4 text-left",
    depth === 0 && name === highlightedKey && "bg-brand-soft",
  );
  const rowWords = (
    <>
      <span className="text-fg">{name}</span>
      <span className="text-fg-3">:</span>
      <span className={joinClassNames("truncate select-text", SYNTAX_COLOUR[words.kind])}>{words.text}</span>
    </>
  );
  return (
    <div id={depth === 0 ? anchorIdOfTopLevelKey(name) : undefined} className="scroll-mt-2">
      {canOpen ? (
        <button type="button" aria-expanded={isOpen} onClick={() => togglePath(path)} className={joinClassNames(rowClassName, "hover:bg-hover")} style={{ paddingLeft: 12 + depth * 16 }}>
          <ChevronRight className={joinClassNames("size-3.5 shrink-0 text-fg-3 transition-transform", isOpen && "rotate-90")} strokeWidth={1.75} aria-hidden />
          {rowWords}
        </button>
      ) : (
        <div className={rowClassName} style={{ paddingLeft: 12 + depth * 16 }}>
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
    <div className="flex h-7 shrink-0 items-center rounded-md bg-well p-0.5" role="group" aria-label="Show the graph document">
      {(["raw", "tree"] as const).map((view) => (
        <button
          key={view}
          type="button"
          aria-pressed={shownView === view}
          data-graph-document-view-choice={view}
          onClick={() => onViewChosen(view)}
          className={joinClassNames(
            "flex h-6 items-center rounded-[5px] px-2.5 text-fg-2 transition-colors hover:text-fg",
            shownView === view && "bg-raised text-fg shadow-(--shadow-segment)",
          )}
        >
          {view === "raw" ? "Raw" : "Tree"}
        </button>
      ))}
    </div>
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
  const { wasCopied, copy } = useCopiedConfirmation(graphDocumentText ?? "");

  if (!isStreamLoaded(stream) || graphDocumentText === null) {
    const isNotLoaded = !isStreamLoaded(stream);
    return (
      <div className="flex min-h-0 flex-1 flex-col" data-stream-inspect="">
        <GraphDocumentCommandBar command={command} />
        <div className="grid flex-1 place-items-center px-8">
          <div className="max-w-md text-center">
            <FileBraces className="mx-auto size-5 text-fg-3" strokeWidth={1.5} aria-hidden />
            <div className="mt-2.5 text-fg">{isNotLoaded ? "No graph while the stream is not loaded" : reading.readRefusal === null ? "Reading its graph…" : "Its graph could not be read"}</div>
            <p className="mt-1 text-fg-3 select-text">
              {isNotLoaded
                ? `The runtime serves a stream's graph only while it is loaded. ${stream.state === "failed" ? "Retry it" : "Start it"} and the graph shows here, as the command prints it.`
                : (reading.readRefusal ?? "The graph shows here as the command prints it.")}
            </p>
          </div>
        </div>
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
          <button
            key={outlineEntry.key}
            type="button"
            onClick={() => jumpToTopLevelKey(outlineEntry.key)}
            className={joinClassNames(
              "group flex h-7 w-full cursor-default items-center gap-2 rounded-md px-2 text-left text-fg-2 transition-colors hover:bg-hover hover:text-fg",
              highlightedKey === outlineEntry.key && "bg-selected text-fg",
            )}
          >
            <span className="truncate font-mono text-xs">{outlineEntry.key}</span>
            {/* fg-3 drops under 4.5:1 on a hovered or selected row over chrome, so the summary reads fg-2 there. */}
            <span
              className={joinClassNames(
                "ml-auto max-w-[50%] shrink-0 truncate text-xs tabular group-hover:text-fg-2",
                highlightedKey === outlineEntry.key ? "text-fg-2" : "text-fg-3",
              )}
            >
              {outlineEntry.summary}
            </span>
          </button>
        ))}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <GraphDocumentCommandBar command={command}>
          <GraphDocumentViewSwitch shownView={shownView} onViewChosen={setShownView} />
          <Button variant="outline" className="w-[84px]" onClick={copy}>
            {wasCopied ? <Check aria-hidden /> : <Copy aria-hidden />} {wasCopied ? "Copied" : "Copy"}
          </Button>
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
