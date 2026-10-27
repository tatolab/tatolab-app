import { afterEach, describe, expect, it, vi } from "vitest";
import type { RelaysDescription } from "../shared/tatolab_backend_contract";
import { RelayReadings } from "./relay_readings";

afterEach(() => {
  vi.useRealTimers();
});

const DESCRIBED: RelaysDescription = {
  relays: [{ relay_id: "local-loopback", adapter: "local", built_in: true, settings: { port: 4443 }, secrets: {}, connection_state: { state: "joined" } }],
  adapters: [],
};
const DESCRIBED_WITH_A_JOINING_RELAY: RelaysDescription = {
  relays: [...DESCRIBED.relays, { relay_id: "cloudflare-1", adapter: "cloudflare", built_in: false, settings: {}, secrets: { relay_url: "set" }, connection_state: { state: "joining" } }],
  adapters: [],
};

function relayChangesThatAnswer(describeRelays: () => Promise<RelaysDescription>) {
  return {
    describeRelays: vi.fn(describeRelays),
    addRelay: vi.fn(async () => "cloudflare-1"),
    configureRelay: vi.fn(async () => {}),
    removeRelay: vi.fn(async (relayId: string): Promise<void> => {
      throw `the relay \`${relayId}\` is built in and is never removed`;
    }),
  };
}

describe("the runtime's relays", () => {
  it("are read only while a page shows them and the window lets them poll, every interval", async () => {
    vi.useFakeTimers();
    const backend = relayChangesThatAnswer(async () => DESCRIBED);
    const readings = new RelayReadings(backend, 3_000);

    readings.setPollingAllowed(true);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(backend.describeRelays).not.toHaveBeenCalled();

    const stopShowing = readings.subscribeToReading(() => {});
    await vi.advanceTimersByTimeAsync(0);
    expect(readings.readLatestReading()).toEqual({ kind: "read", description: DESCRIBED });
    await vi.advanceTimersByTimeAsync(3_000);
    expect(backend.describeRelays).toHaveBeenCalledTimes(2);

    readings.setPollingAllowed(false);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(backend.describeRelays).toHaveBeenCalledTimes(2);
    stopShowing();
  });

  it("are read again at once after a change, whether it was carried out or refused, and the change answers in the runtime's words", async () => {
    vi.useFakeTimers();
    let described = DESCRIBED;
    const backend = relayChangesThatAnswer(async () => described);
    const readings = new RelayReadings(backend, 60_000);
    readings.setPollingAllowed(true);
    readings.subscribeToReading(() => {});
    await vi.advanceTimersByTimeAsync(0);

    described = DESCRIBED_WITH_A_JOINING_RELAY;
    expect(await readings.addRelay("cloudflare", { relay_url: "typed-in-the-test" })).toBe("cloudflare-1");
    await vi.advanceTimersByTimeAsync(0);
    expect(readings.readLatestReading()).toEqual({ kind: "read", description: DESCRIBED_WITH_A_JOINING_RELAY });
    expect(backend.addRelay).toHaveBeenCalledWith("cloudflare", { relay_url: "typed-in-the-test" });

    await expect(readings.removeRelay("local-loopback")).rejects.toBe("the relay `local-loopback` is built in and is never removed");
    await vi.advanceTimersByTimeAsync(0);
    expect(backend.describeRelays).toHaveBeenCalledTimes(3);
  });

  it("keep what was last read beside a refused read, and forget it when the runtime's state changes", async () => {
    vi.useFakeTimers();
    const describeRelays = vi
      .fn<() => Promise<RelaysDescription>>()
      .mockResolvedValueOnce(DESCRIBED)
      .mockRejectedValueOnce("`list_relays` answered with no text")
      .mockResolvedValue(DESCRIBED_WITH_A_JOINING_RELAY);
    const readings = new RelayReadings({ ...relayChangesThatAnswer(async () => DESCRIBED), describeRelays }, 3_000);
    readings.setPollingAllowed(true);
    readings.subscribeToReading(() => {});
    await vi.advanceTimersByTimeAsync(3_000);

    expect(readings.readLatestReading()).toEqual({ kind: "refused", refusal: "`list_relays` answered with no text", lastDescription: DESCRIBED });

    readings.forgetAndReadAgainAsTheRuntimesStateChanged();
    expect(readings.readLatestReading()).toEqual({ kind: "not_read" });
    await vi.advanceTimersByTimeAsync(0);
    expect(readings.readLatestReading()).toEqual({ kind: "read", description: DESCRIBED_WITH_A_JOINING_RELAY });
  });
});
