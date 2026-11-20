// @vitest-environment happy-dom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import type { NodeOfABody } from "../pin_model/controlled_inputs";
import type { InputControlBinder } from "../pin_services/input_control_binding";
import type { NodeBodyShown } from "../pin_services/node_body_binding";
import { InputControlBinderContext } from "./input_control_mount";
import { NodeBodyMount } from "./node_body_mount";

const MIX_ADDRESS = { graph: { project_folder: "/projects/demo", stream_asset: "11111111-2222-3333-4444-555555555555", level: [] }, node_id: "FADE-ID", input: "mix", member: null };
const nodeWithMix = (label: string): NodeOfABody => ({
  node_type: "nodes.crossfade:Crossfade",
  project_folder: "/projects/demo",
  inputs: [{ declaration: { input_name: "mix", label, pin_type: { type: "float" }, annotations: {}, may_be_unset: false }, value_address: MIX_ADDRESS, rebuilds_its_node: false, wiring: null }],
});

/** A binder whose one body slot shows what the test tells it, and which counts each bind and each node it is told. */
function binderUnderTest() {
  const tellers: ((shown: NodeBodyShown) => void)[] = [];
  const updates: { node: NodeOfABody; readOnly: boolean }[] = [];
  const binder: InputControlBinder = {
    bindInputControl: () => {
      throw new Error("the card binds no control here");
    },
    bindOwnField: () => {
      throw new Error("the card binds no own field");
    },
    bindNodeBody: (_host, _node, _readOnly, whenShown = () => undefined) => {
      tellers.push(whenShown);
      whenShown("pending");
      return { update: (node, readOnly) => updates.push({ node, readOnly }), unbind: () => undefined };
    },
  };
  const show = (shown: NodeBodyShown) =>
    act(() => {
      for (const tell of tellers) tell(shown);
    });
  return { binder, show, updates, binds: () => tellers.length };
}

afterEach(cleanup);

function BodyOf({ binder, node, readOnly = false }: { binder: InputControlBinder; node: NodeOfABody; readOnly?: boolean }) {
  return (
    <InputControlBinderContext value={binder}>
      <NodeBodyMount node={node} readOnly={readOnly} />
    </InputControlBinderContext>
  );
}

test("the body's slot is hidden while it loads and where its node type has none, shown once the body is drawn, and binds once while an equal node is drawn again", () => {
  const { binder, show, updates, binds } = binderUnderTest();
  const { container, rerender } = render(<BodyOf binder={binder} node={nodeWithMix("mix")} />);
  const slot = () => container.querySelector("[data-node-graph-card-body]");
  expect(slot()?.classList.contains("hidden")).toBe(true);

  show("body");
  expect(slot()?.classList.contains("hidden")).toBe(false);
  expect(slot()?.getAttribute("class")).toContain("nodrag nopan");

  rerender(<BodyOf binder={binder} node={nodeWithMix("mix")} />);
  expect(updates).toHaveLength(1);
  rerender(<BodyOf binder={binder} node={nodeWithMix("Mix")} readOnly />);
  expect(updates.at(-1)).toEqual({ node: nodeWithMix("Mix"), readOnly: true });

  show("no_body");
  expect(slot()?.classList.contains("hidden")).toBe(true);
  expect(binds()).toBe(1);
});
