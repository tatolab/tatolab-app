import { cn } from "cn";
import { ChevronRight, FileBraces } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import type { ListedStream } from "../../shared/tatolab_backend_contract";
import {
  readTheGraphDocument,
  syntaxPartsOfAJsonLine,
  type GraphDocumentValue,
  type JsonSyntaxKind,
} from "../presentation/stream_graph_document_presentation";
import { isStreamLoaded } from "../presentation/stream_presentation";
import { CopyWordsButton } from "../design_system/copy_words_button";
import { EmptyState } from "../design_system/empty_state";
import { ListRowButton } from "../design_system/list_row_button";
import { SegmentedChoiceControl } from "../design_system/segmented_choice_control";
import { useStreamGraphReading } from "./tatolab_window_context";

const SYNTAX_COLOUR: Record<JsonSyntaxKind, string> = {
  key: "text-fg",
  string: "text-fg-2",
  number: "text-brand-text",
  literal: "text-brand-text italic",
  punctuation: "text-fg-3",
};

/** Whether Inspect shows the document as the runtime wrote it, or as a tree to fold. */
type GraphDocumentView = "raw" | "tree";

function RawGraphDocument({ graphDocumentText }: { graphDocumentText: string }) {
  // A poll that brings the same text renders nothing new; one that moves a counter replaces only the text that changed.
  const lines = useMemo(() => graphDocumentText.split("\n").map((line) => syntaxPartsOfAJsonLine(line)), [graphDocumentText]);
  const gutterWidth = `calc(${String(lines.length).length}ch + 2rem)`;
  return (
    <div className="min-w-max py-2 font-mono text-xs leading-5 select-text" data-graph-document-view="raw">
      {lines.map((syntaxParts, lineIndex) => {
        return (
          <div key={lineIndex} className="flex pr-6 hover:bg-hover">
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
}: {
  name: string;
  value: GraphDocumentValue;
  path: string;
  depth: number;
  openPaths: ReadonlySet<string>;
  togglePath: (path: string) => void;
}) {
  const children: [string, GraphDocumentValue][] =
    value.kind === "object" ? value.entries : value.kind === "array" ? value.items.map((item, itemIndex) => [String(itemIndex), item]) : [];
  const canOpen = value.kind === "object" || value.kind === "array";
  const isOpen = openPaths.has(path);
  const words = scalarWords(value);
  const rowWords = (
    <>
      <span className="text-fg">{name}</span>
      <span className="text-fg-3">:</span>
      <span className={cn("truncate select-text", SYNTAX_COLOUR[words.kind])}>{words.text}</span>
    </>
  );
  return (
    <div>
      {canOpen ? (
        <ListRowButton
          aria-expanded={isOpen}
          onPressed={() => togglePath(path)}
          className="h-[22px] gap-1 rounded-none pr-4 font-mono text-xs"
          style={{ paddingLeft: 12 + depth * 16 }}
        >
          <ChevronRight className={cn("size-3.5 shrink-0 text-fg-3 transition-transform", isOpen && "rotate-90")} strokeWidth={1.75} aria-hidden />
          {rowWords}
        </ListRowButton>
      ) : (
        <div className="flex h-[22px] w-full items-center gap-1 pr-4" style={{ paddingLeft: 12 + depth * 16 }}>
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
            />
          ))}
        </div>
      )}
    </div>
  );
}

function GraphDocumentTree({ graphDocument }: { graphDocument: GraphDocumentValue }) {
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
        <GraphDocumentTreeNode key={key} name={key} value={value} path={`$.${key}`} depth={0} openPaths={openPaths} togglePath={togglePath} />
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

/** Inspect's bar over the document: which view of it shows, and Copy. */
function GraphDocumentBar({ children }: { children: ReactNode }) {
  return <div className="flex h-10 shrink-0 items-center justify-end gap-2 border-b px-4">{children}</div>;
}

/** Inspect: the `graph` document of the loaded stream as the runtime gives it, raw or as a tree to fold. */
export function StreamInspectPageView({ stream }: { stream: ListedStream }) {
  const reading = useStreamGraphReading(stream.stream);
  const [shownView, setShownView] = useState<GraphDocumentView>("raw");
  const graphDocumentText = reading.graphSource === "loaded" ? (reading.graph?.graph_document_text ?? null) : null;
  const graphDocument = useMemo(() => (graphDocumentText === null ? null : readTheGraphDocument(graphDocumentText)), [graphDocumentText]);

  if (!isStreamLoaded(stream) || graphDocumentText === null) {
    const isNotLoaded = !isStreamLoaded(stream);
    return (
      <div className="flex min-h-0 flex-1 flex-col" data-stream-inspect="">
        <EmptyState
          icon={FileBraces}
          title={isNotLoaded ? "No graph while the stream is not loaded" : reading.readRefusal === null ? "Reading its graph…" : "Its graph could not be read"}
          explanation={
            isNotLoaded
              ? `The runtime serves a stream's graph only while it is loaded. ${stream.state === "failed" ? "Retry it" : "Start it"} and the graph shows here.`
              : (reading.readRefusal ?? "The graph shows here once the runtime gives it.")
          }
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1" data-stream-inspect="">
      <div className="flex min-w-0 flex-1 flex-col">
        <GraphDocumentBar>
          <GraphDocumentViewSwitch shownView={shownView} onViewChosen={setShownView} />
          <CopyWordsButton readTextToCopy={() => graphDocumentText} />
        </GraphDocumentBar>
        <div className="scrollbar-thin min-h-0 flex-1 overflow-auto">
          {shownView === "tree" && graphDocument !== null ? (
            <GraphDocumentTree graphDocument={graphDocument} />
          ) : (
            <RawGraphDocument graphDocumentText={graphDocumentText} />
          )}
        </div>
      </div>
    </div>
  );
}
