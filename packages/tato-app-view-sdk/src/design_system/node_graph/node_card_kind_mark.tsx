import { CircleQuestionMark, Cpu, Layers, Link, type LucideIcon, type LucideProps } from "lucide-react";
import type { NodeGraphCardKind, NodeGraphFunctionLanguage } from "../support/node_graph_canvas_contract";

/** A shaded sphere, the material ball node editors draw for a shader, in Lucide's 24-unit grid and stroke. */
function ShadedSphere(props: LucideProps) {
  const { size = 24, strokeWidth = 2, ...rest } = props;
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...rest}>
      <path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
      <path d="M5.5 15.5a9 9 0 0 0 13 0" />
      <path d="M9 7.5a4 4 0 0 0-1.5 2" />
    </svg>
  );
}

/** A kind's icon, or `fn`, the letters a function shows in its place. */
type KindMark = LucideIcon | typeof ShadedSphere | "fn";

/** How each kind of node is named and marked. */
const MARK_OF_THE_KIND: Record<NodeGraphCardKind["look"], { words: string; mark: KindMark }> = {
  process: { words: "Process node", mark: Cpu },
  shader: { words: "Shader node", mark: ShadedSphere },
  function: { words: "Function node", mark: "fn" },
  subgraph: { words: "Subgraph", mark: Layers },
  placed_stream: { words: "Placed stream", mark: Link },
  unknown: { words: "Kind not known", mark: CircleQuestionMark },
};

/** A function language's name as its header tag writes it. */
const LANGUAGE_WORDS: Record<NodeGraphFunctionLanguage, string> = { python: "Python", rust: "Rust" };

/** What the header says a node of `kind` is, as its mark is labelled and its pointer tooltip reads. */
export function nodeGraphCardKindWords(kind: NodeGraphCardKind): string {
  const words = MARK_OF_THE_KIND[kind.look].words;
  return kind.look === "function" && kind.language !== null ? `${words} in ${LANGUAGE_WORDS[kind.language]}` : words;
}

/** The square that leads a card's header with its kind's icon, filled in its kind's colour. */
export function NodeGraphCardKindMark({ kind }: { kind: NodeGraphCardKind }) {
  const words = nodeGraphCardKindWords(kind);
  return (
    <span className="node-graph-card-kind-mark" role="img" aria-label={words} title={words} data-node-graph-card-kind={kind.look}>
      <KindGlyph mark={MARK_OF_THE_KIND[kind.look].mark} />
    </span>
  );
}

/** A kind's icon inside its mark, or the letters that stand in for one. */
function KindGlyph({ mark: Mark }: { mark: KindMark }) {
  if (Mark === "fn") return <span aria-hidden className="node-graph-card-kind-mark-letters">fn</span>;
  return <Mark className="size-[11px]" strokeWidth={2.6} aria-hidden />;
}

/** The tag at a function card header's right naming the language its code is in; none on any other card, or where the language is not known. */
export function NodeGraphCardLanguageTag({ kind }: { kind: NodeGraphCardKind }) {
  if (kind.look !== "function" || kind.language === null) return null;
  return (
    <span className="node-graph-card-language-tag shrink-0" data-node-graph-card-language={kind.language}>
      {LANGUAGE_WORDS[kind.language]}
    </span>
  );
}
