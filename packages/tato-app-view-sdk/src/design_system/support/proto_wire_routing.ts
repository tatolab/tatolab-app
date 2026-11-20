// PROTOTYPE for design mocks only. Not for merge.
import { createContext } from "react";

export interface ProtoRect { x: number; y: number; w: number; h: number }
export interface ProtoLink { id: string; sx: number; sy: number; tx: number; ty: number }
type Pt = { x: number; y: number };

const PAD = 14;
const STUB = 20;
const BEND = 60;
const SHARED = 3;

export const ProtoRoutesContext = createContext<ReadonlyMap<string, string> | null>(null);

function uniqSorted(values: number[]): number[] {
  const s = [...new Set(values.map((v) => Math.round(v * 2) / 2))].sort((a, b) => a - b);
  return s;
}

class Heap {
  items: [number, number][] = [];
  push(cost: number, id: number) {
    const a = this.items; a.push([cost, id]);
    let i = a.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (a[p]![0] <= a[i]![0]) break; [a[p], a[i]] = [a[i]!, a[p]!]; i = p; }
  }
  pop(): [number, number] | undefined {
    const a = this.items; if (a.length === 0) return undefined;
    const top = a[0]!; const last = a.pop()!;
    if (a.length > 0) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && a[l]![0] < a[m]![0]) m = l; if (r < a.length && a[r]![0] < a[m]![0]) m = r; if (m === i) break; [a[m], a[i]] = [a[i]!, a[m]!]; i = m; } }
    return top;
  }
}

export function routeAll(obstacles: readonly ProtoRect[], links: readonly ProtoLink[]): Map<string, Pt[]> {
  const rects = obstacles.map((r) => ({ x0: r.x - PAD, y0: r.y - PAD, x1: r.x + r.w + PAD, y1: r.y + r.h + PAD }));
  const obsX = rects.flatMap((r) => [r.x0, r.x1]);
  const obsY = rects.flatMap((r) => [r.y0, r.y1]);
  const midsOf = (vals: number[]) => { const s = uniqSorted(vals); const m: number[] = []; for (let i = 0; i + 1 < s.length; i++) m.push((s[i]! + s[i + 1]!) / 2); return m; };
  const allX = [...obsX, ...links.flatMap((l) => [l.sx + STUB, l.tx - STUB])], allY = [...obsY, ...links.flatMap((l) => [l.sy, l.ty])];
  const outer = { x: [Math.min(...allX) - 30, Math.max(...allX) + 30], y: [Math.min(...allY) - 30, Math.max(...allY) + 30] };
  const xs = uniqSorted([...outer.x, ...obsX, ...midsOf(obsX), ...links.flatMap((l) => [l.sx + STUB, l.tx - STUB])]);
  const ys = uniqSorted([...outer.y, ...obsY, ...midsOf(obsY), ...links.flatMap((l) => [l.sy, l.ty])]);
  const nx = xs.length, ny = ys.length;
  const inside = (x: number, y: number) => rects.some((r) => x > r.x0 + 0.1 && x < r.x1 - 0.1 && y > r.y0 + 0.1 && y < r.y1 - 0.1);
  const blocked = new Uint8Array(nx * ny);
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) blocked[j * nx + i] = inside(xs[i]!, ys[j]!) ? 1 : 0;
  // edge open masks: h edge (i,j)->(i+1,j), v edge (i,j)->(i,j+1)
  const hOpen = new Uint8Array(nx * ny), vOpen = new Uint8Array(nx * ny);
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    if (i + 1 < nx) hOpen[j * nx + i] = inside((xs[i]! + xs[i + 1]!) / 2, ys[j]!) ? 0 : 1;
    if (j + 1 < ny) vOpen[j * nx + i] = inside(xs[i]!, (ys[j]! + ys[j + 1]!) / 2) ? 0 : 1;
  }
  const hUse = new Float32Array(nx * ny), vUse = new Float32Array(nx * ny);
  const xi = (x: number) => xs.indexOf(Math.round(x * 2) / 2);
  const yj = (y: number) => ys.indexOf(Math.round(y * 2) / 2);
  const result = new Map<string, Pt[]>();
  // route shorter links first
  const order = [...links].sort((a, b) => Math.abs(a.tx - a.sx) + Math.abs(a.ty - a.sy) - (Math.abs(b.tx - b.sx) + Math.abs(b.ty - b.sy)));
  const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1];
  for (const link of order) {
    const si = xi(link.sx + STUB), sj = yj(link.sy), ti = xi(link.tx - STUB), tj = yj(link.ty);
    const dbg = ((globalThis as { __protoMiss?: string[] }).__protoMiss ??= []);
    if (si < 0 || sj < 0 || ti < 0 || tj < 0) { dbg.push(link.id + ' grid'); continue; }
    const N = nx * ny * 4;
    const dist = new Float64Array(N).fill(Infinity);
    const prev = new Int32Array(N).fill(-1);
    const heap = new Heap();
    const start = (sj * nx + si) * 4 + 0;
    dist[start] = 0; heap.push(0, start);
    let goal = -1;
    const h = (i: number, j: number) => Math.abs(xs[i]! - xs[ti]!) + Math.abs(ys[j]! - ys[tj]!);
    for (;;) {
      const top = heap.pop(); if (!top) break;
      const [, s] = top; const node = s >> 2, dir = s & 3; const i = node % nx, j = (node - i) / nx;
      const d = dist[s]!;
      if (i === ti && j === tj && dir === 0) { goal = s; break; }
      for (let nd = 0; nd < 4; nd++) {
        if (nd === ((dir + 2) & 3)) continue;
        const ni = i + DX[nd]!, nj = j + DY[nd]!;
        if (ni < 0 || nj < 0 || ni >= nx || nj >= ny) continue;
        let open: number, use: number;
        if (nd === 0) { open = hOpen[j * nx + i]!; use = hUse[j * nx + i]!; }
        else if (nd === 2) { open = hOpen[j * nx + ni]!; use = hUse[j * nx + ni]!; }
        else if (nd === 1) { open = vOpen[j * nx + i]!; use = vUse[j * nx + i]!; }
        else { open = vOpen[nj * nx + i]!; use = vUse[nj * nx + i]!; }
        const isEnd = (ni === ti && nj === tj);
        if ((!open && !(isEnd || (i === si && j === sj))) || (blocked[nj * nx + ni] && !isEnd)) continue;
        const len = Math.abs(xs[ni]! - xs[i]!) + Math.abs(ys[nj]! - ys[j]!);
        const cost = d + len * (1 + SHARED * use) + (nd !== dir ? BEND : 0);
        const ns = (nj * nx + ni) * 4 + nd;
        if (cost < dist[ns]!) { dist[ns] = cost; prev[ns] = s; heap.push(cost + h(ni, nj), ns); }
      }
    }
    if (goal < 0) { dbg.push(link.id + ' nopath ' + JSON.stringify(link) + ' sb' + blocked[sj*nx+si] + ' tb' + blocked[tj*nx+ti]); continue; }
    const cells: number[] = [];
    for (let s = goal; s >= 0; s = prev[s]!) cells.push(s);
    cells.reverse();
    const pts: Pt[] = [{ x: link.sx, y: link.sy }];
    let lastNode = -1;
    for (const s of cells) {
      const node = s >> 2; const i = node % nx, j = (node - i) / nx;
      if (lastNode >= 0) {
        const li = lastNode % nx, lj = (lastNode - li) / nx;
        if (lj === j) hUse[j * nx + Math.min(i, li)]! += 1; else vUse[Math.min(j, lj) * nx + i]! += 1;
        if (lj === j) hUse[j * nx + Math.min(i, li)] = hUse[j * nx + Math.min(i, li)]! + 0;
      }
      lastNode = node;
      pts.push({ x: xs[i]!, y: ys[j]! });
    }
    pts.push({ x: link.tx, y: link.ty });
    result.set(link.id, simplify(pts));
  }
  nudge(result);
  return result;
}

function simplify(pts: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of pts) {
    if (out.length > 0 && out.at(-1)!.x === p.x && out.at(-1)!.y === p.y) continue;
    if (out.length >= 2) {
      const a = out.at(-2)!, b = out.at(-1)!;
      if ((a.x === b.x && b.x === p.x) || (a.y === b.y && b.y === p.y)) { out[out.length - 1] = p; continue; }
    }
    out.push(p);
  }
  return out;
}

/** Spreads segments that share a channel so they run side by side instead of on top of each other. */
function nudge(routes: Map<string, Pt[]>) {
  const GAP = 7;
  type Seg = { id: string; k: number; at: number; lo: number; hi: number; vertical: boolean };
  const segs: Seg[] = [];
  for (const [id, pts] of routes) for (let k = 1; k + 2 < pts.length + 1 && k + 1 < pts.length - 0; k++) {
    if (k === 0 || k + 1 >= pts.length - 0) continue;
    const a = pts[k]!, b = pts[k + 1]!;
    if (k + 1 === pts.length - 1) continue; // last segment attaches to the pin
    if (a.x === b.x) segs.push({ id, k, at: a.x, lo: Math.min(a.y, b.y), hi: Math.max(a.y, b.y), vertical: true });
    else if (k > 1 && a.y === b.y) segs.push({ id, k, at: a.y, lo: Math.min(a.x, b.x), hi: Math.max(a.x, b.x), vertical: false });
  }
  const groups = new Map<string, Seg[]>();
  for (const s of segs) { const key = `${s.vertical}:${s.at}`; groups.set(key, [...(groups.get(key) ?? []), s]); }
  for (const group of groups.values()) {
    // cluster overlapping segments
    group.sort((a, b) => a.lo - b.lo);
    const clusters: Seg[][] = [];
    for (const s of group) { const c = clusters.at(-1); if (c && c.some((o) => o.lo < s.hi - 1 && s.lo < o.hi - 1)) c.push(s); else clusters.push([s]); }
    for (const c of clusters) {
      if (c.length < 2) continue;
      // order by where they come from so they don't cross: by the other end's coordinate
      c.sort((a, b) => {
        const pa = routes.get(a.id)!, pb = routes.get(b.id)!;
        return a.vertical ? pa[a.k - 1]!.y - pb[b.k - 1]!.y : pa[a.k - 1]!.x - pb[b.k - 1]!.x;
      });
      c.forEach((s, n) => {
        const off = (n - (c.length - 1) / 2) * GAP;
        const pts = routes.get(s.id)!;
        if (s.vertical) { pts[s.k] = { ...pts[s.k]!, x: pts[s.k]!.x + off }; pts[s.k + 1] = { ...pts[s.k + 1]!, x: pts[s.k + 1]!.x + off }; }
        else { pts[s.k] = { ...pts[s.k]!, y: pts[s.k]!.y + off }; pts[s.k + 1] = { ...pts[s.k + 1]!, y: pts[s.k + 1]!.y + off }; }
      });
    }
  }
}

/** A polyline drawn with rounded corners, so it reads as one smooth curve. */
export function roundedPath(pts: readonly Pt[], radius: number): string {
  if (pts.length < 2) return "";
  let d = `M ${pts[0]!.x} ${pts[0]!.y}`;
  for (let k = 1; k < pts.length - 1; k++) {
    const a = pts[k - 1]!, b = pts[k]!, c = pts[k + 1]!;
    const lin = Math.hypot(b.x - a.x, b.y - a.y), lout = Math.hypot(c.x - b.x, c.y - b.y);
    const r = Math.min(radius, lin / 2, lout / 2);
    const p1 = { x: b.x - ((b.x - a.x) / (lin || 1)) * r, y: b.y - ((b.y - a.y) / (lin || 1)) * r };
    const p2 = { x: b.x + ((c.x - b.x) / (lout || 1)) * r, y: b.y + ((c.y - b.y) / (lout || 1)) * r };
    d += ` L ${p1.x} ${p1.y} Q ${b.x} ${b.y} ${p2.x} ${p2.y}`;
  }
  d += ` L ${pts.at(-1)!.x} ${pts.at(-1)!.y}`;
  return d;
}

export function protoFlag(name: string): boolean {
  try { return (localStorage.getItem("proto") ?? "").split(",").includes(name); } catch { return false; }
}

import { useStore, type ReactFlowState } from "@xyflow/react";
import { useMemo } from "react";

const routingInputs = (s: ReactFlowState): string => {
  const obstacles: ProtoRect[] = [];
  const handles = new Map<string, { abs: { x: number; y: number }; bounds: ReturnType<typeof getBounds> }>();
  for (const [id, n] of s.nodeLookup) {
    if (n.type === "node_graph_frame") continue;
    const w = n.measured.width ?? 0, h = n.measured.height ?? 0;
    if (w === 0) continue;
    obstacles.push({ x: n.internals.positionAbsolute.x, y: n.internals.positionAbsolute.y, w, h });
    handles.set(id, { abs: n.internals.positionAbsolute, bounds: getBounds(n.internals.handleBounds) });
  }
  const links: ProtoLink[] = [];
  for (const e of s.edges) {
    const src = handles.get(e.source), tgt = handles.get(e.target);
    const sh = src?.bounds.source?.find((b) => b.id === e.sourceHandle);
    const th = tgt?.bounds.target?.find((b) => b.id === e.targetHandle);
    if (!src || !tgt || !sh || !th) continue;
    links.push({ id: e.id, sx: Math.round(src.abs.x + sh.x + sh.width), sy: Math.round(src.abs.y + sh.y + sh.height / 2), tx: Math.round(tgt.abs.x + th.x), ty: Math.round(tgt.abs.y + th.y + th.height / 2) });
  }
  return JSON.stringify({ obstacles, links });
};
function getBounds(b: unknown) { return (b ?? {}) as { source?: { id?: string | null; x: number; y: number; width: number; height: number }[] | null; target?: { id?: string | null; x: number; y: number; width: number; height: number }[] | null }; }

export function useProtoRoutes(enabled: boolean): ReadonlyMap<string, string> | null {
  const key = useStore((s) => (enabled ? routingInputs(s) : ""));
  return useMemo(() => {
    if (!enabled || key === "") return null;
    const { obstacles, links } = JSON.parse(key) as { obstacles: ProtoRect[]; links: ProtoLink[] };
    const t0 = performance.now();
    const routes = routeAll(obstacles, links);
    (globalThis as { __protoRouteMs?: number }).__protoRouteMs = performance.now() - t0;
    return new Map([...routes].map(([id, pts]) => [id, roundedPath(pts, protoFlag("curves") ? 1000 : 18)]));
  }, [enabled, key]);
}

import { layOutNodeGraph, type NodeGraphLayoutLink, type NodeGraphLayoutNode, type NodeGraphPosition } from "./node_graph_layout";
import { NODE_GRAPH_FRAME_PADDING, NODE_GRAPH_FRAME_TITLE_ROOM } from "./node_graph_editing";

export interface ProtoTidyNode extends NodeGraphLayoutNode { frame_id: string | null; old: NodeGraphPosition }
export interface ProtoTidyNote { note_id: string; position: NodeGraphPosition; size: { width: number; height: number } }

function columnsOf(ids: string[], links: NodeGraphLayoutLink[]): Map<string, number> {
  const up = new Map<string, string[]>();
  for (const l of links) up.set(l.target_node_id, [...(up.get(l.target_node_id) ?? []), l.source_node_id]);
  const col = new Map<string, number>(); const busy = new Set<string>();
  const of = (id: string): number => { const c = col.get(id); if (c !== undefined) return c; if (busy.has(id)) return -1; busy.add(id); let v = 0; for (const u of up.get(id) ?? []) v = Math.max(v, of(u) + 1); busy.delete(id); col.set(id, v); return v; };
  ids.forEach(of); return col;
}

/** Each frame's cards laid out on their own as layers, long links given a lane through the columns they cross, then the frames stacked in the order wires flow between them. */
export function protoTidy(nodes: readonly ProtoTidyNode[], links: readonly NodeGraphLayoutLink[], frameOrder: readonly string[], notes: readonly ProtoTidyNote[]): { cards: Map<string, NodeGraphPosition>; notes: Map<string, NodeGraphPosition> } {
  const groups = new Map<string | null, ProtoTidyNode[]>();
  for (const n of nodes) groups.set(n.frame_id, [...(groups.get(n.frame_id) ?? []), n]);
  const order = [...frameOrder.filter((f) => groups.has(f)), ...(groups.has(null) ? [null] : [])];
  const cards = new Map<string, NodeGraphPosition>(); const notePos = new Map<string, NodeGraphPosition>();
  const bboxOf = (ps: { x: number; y: number; w: number; h: number }[]) => ({ x: Math.min(...ps.map((p) => p.x)), y: Math.min(...ps.map((p) => p.y)), r: Math.max(...ps.map((p) => p.x + p.w)), b: Math.max(...ps.map((p) => p.y + p.h)) });
  const groupOld = new Map<string | null, ReturnType<typeof bboxOf>>();
  for (const [g, ns] of groups) groupOld.set(g, bboxOf(ns.map((n) => ({ x: n.old.x, y: n.old.y, w: n.card_width, h: n.card_height ?? 60 }))));
  // notes: inside a frame's old box, or beside the nearest one
  const notesInside = new Map<string | null, ProtoTidyNote[]>(); const notesOutside = new Map<string | null, ProtoTidyNote[]>();
  for (const note of notes) {
    const cx = note.position.x + note.size.width / 2, cy = note.position.y + note.size.height / 2;
    let best: string | null = order[0] ?? null, bestD = Infinity, inside = false;
    for (const g of order) { const b = groupOld.get(g)!; const isIn = cx >= b.x && cx <= b.r && cy >= b.y && cy <= b.b; const d = Math.hypot(Math.max(b.x - cx, 0, cx - b.r), Math.max(b.y - cy, 0, cy - b.b)); if (isIn) { best = g; inside = true; break; } if (d < bestD) { bestD = d; best = g; } }
    const m = inside ? notesInside : notesOutside; m.set(best, [...(m.get(best) ?? []), note]);
  }
  let cursorY = 0;
  for (const g of order) {
    const ns = groups.get(g)!; const ids = new Set(ns.map((n) => n.node_id));
    const inner = links.filter((l) => ids.has(l.source_node_id) && ids.has(l.target_node_id));
    const col = columnsOf([...ids], inner);
    const virtual: NodeGraphLayoutNode[] = []; const vlinks: NodeGraphLayoutLink[] = [];
    // a node nothing feeds sits one column before the first node it feeds, not at the far left
    for (const id of ids) {
      if (inner.some((l) => l.target_node_id === id)) continue;
      const downs = inner.filter((l) => l.source_node_id === id).map((l) => col.get(l.target_node_id)!);
      if (downs.length === 0) continue;
      const want = Math.min(...downs) - 1;
      let prev: string | null = null;
      for (let c = 0; c < want; c++) { const vid = `pull:${id}:${c}`; virtual.push({ node_id: vid, input_pin_names: ["i"], output_pin_names: ["o"], shows_failure_words: false, is_collapsed: true, card_width: 0, card_height: 1 }); if (prev !== null) vlinks.push({ source_node_id: prev, source_pin: "o", target_node_id: vid, target_pin: "i" }); prev = vid; }
      if (prev !== null) vlinks.push({ source_node_id: prev, source_pin: "o", target_node_id: id, target_pin: "__pull" });
      col.set(id, Math.max(0, want));
    }
    for (const l of inner) {
      const a = col.get(l.source_node_id)!, b = col.get(l.target_node_id)!;
      if (b - a <= 1) { vlinks.push(l); continue; }
      let prev = { id: l.source_node_id, pin: l.source_pin };
      for (let c = a + 1; c < b; c++) { const id = `lane:${l.source_node_id}:${l.source_pin}:${l.target_node_id}:${l.target_pin}:${c}`; virtual.push({ node_id: id, input_pin_names: ["i"], output_pin_names: ["o"], shows_failure_words: false, is_collapsed: true, card_width: 0, card_height: 4 }); vlinks.push({ source_node_id: prev.id, source_pin: prev.pin, target_node_id: id, target_pin: "i" }); prev = { id, pin: "o" }; }
      vlinks.push({ source_node_id: prev.id, source_pin: prev.pin, target_node_id: l.target_node_id, target_pin: l.target_pin });
    }
    const laid = layOutNodeGraph([...ns, ...virtual], vlinks);
    const real = ns.map((n) => ({ id: n.node_id, ...laid.get(n.node_id)!, w: n.card_width, h: n.card_height ?? 60 }));
    const box = bboxOf(real);
    const frameTop = g === null ? 0 : NODE_GRAPH_FRAME_PADDING + NODE_GRAPH_FRAME_TITLE_ROOM;
    // notes beside the frame go above it
    const outside = notesOutside.get(g) ?? [];
    let top = cursorY;
    for (const note of outside) { notePos.set(note.note_id, { x: -NODE_GRAPH_FRAME_PADDING, y: top }); top += note.size.height + 24; }
    const dy = top + frameTop - box.y, dx = -box.x;
    for (const r of real) cards.set(r.id, { x: Math.round(r.x + dx), y: Math.round(r.y + dy) });
    let bottom = box.b + dy;
    for (const note of notesInside.get(g) ?? []) { notePos.set(note.note_id, { x: 0, y: Math.round(bottom + 40) }); bottom += 40 + note.size.height; }
    cursorY = bottom + NODE_GRAPH_FRAME_PADDING + 72;
  }
  return { cards, notes: notePos };
}
