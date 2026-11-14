import { describe, expect, it } from "vitest";
import { isAPinSocketOfTheCardUnmeasured } from "./node_graph_pin_socket_measurement";

describe("isAPinSocketOfTheCardUnmeasured", () => {
  it("holds every socket measured when each input and output socket has a place", () => {
    const measured = { target: [{ id: "input:a" }, { id: "input:b" }], source: [{ id: "output:result" }] };
    expect(isAPinSocketOfTheCardUnmeasured(measured, ["input:a", "input:b"], ["output:result"])).toBe(false);
  });

  it("finds a socket unmeasured before the card's first measure", () => {
    expect(isAPinSocketOfTheCardUnmeasured(undefined, [], ["output:video"])).toBe(true);
  });

  it("finds a socket unmeasured when the card was measured without it, as a card measured before a pin came", () => {
    expect(isAPinSocketOfTheCardUnmeasured({ target: null, source: [] }, [], ["output:video"])).toBe(true);
    expect(isAPinSocketOfTheCardUnmeasured({ target: [{ id: "input:a" }], source: [{ id: "output:result" }] }, ["input:a", "input:b"], ["output:result"])).toBe(true);
  });

  it("tells an input socket from an output socket of the same name", () => {
    expect(isAPinSocketOfTheCardUnmeasured({ target: [{ id: "output:video" }], source: null }, [], ["output:video"])).toBe(true);
  });

  it("asks nothing of a card with no pins", () => {
    expect(isAPinSocketOfTheCardUnmeasured(undefined, [], [])).toBe(false);
  });
});
