import type { ViewInputEvent } from "@tatolab/tato-app-view-sdk";
import type { ControlledPin, InputControlElementClass, NodeUiElementHost } from "@tatolab/tato-app-view-sdk/node_ui";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import WireMeter, { peakLevelInDecibels } from "../node_ui/wire_meter.ts";
import { aVideoFrameThatCountsItsCloses, NO_STUDIO_CALLS, partOf } from "./control_test_support.ts";

vi.mock("@tatolab/tato-app-view-sdk/node_ui/input_control.css", () => ({ default: new CSSStyleSheet() }));

customElements.define("tato-studio-wire_meter-test", WireMeter);

function mountedMeter(): { control: WireMeter; send: (event: ViewInputEvent) => void } {
  let onEvent: ((event: ViewInputEvent) => void) | null = null;
  const studio: NodeUiElementHost = {
    ...NO_STUDIO_CALLS,
    watchWhatIsWiredInto: (_input, listener) => {
      onEvent = listener;
      return () => undefined;
    },
  };
  const control = new WireMeter();
  const pin: ControlledPin<"audio"> = { declaration: { input_name: "audio_in", label: "audio_in", pin_type: { type: "audio" }, annotations: { control: "meter" }, may_be_unset: false }, surface: "node", studio };
  control.pin = pin;
  control.state = "driven_by_wire";
  control.value = null;
  document.body.append(control);
  return { control, send: (event) => onEvent?.(event) };
}

/** A block of one channel per array of `channelSamples`, as a port viewer reads it. */
function aBlock(channelSamples: number[][]): ViewInputEvent {
  return {
    kind: "message",
    reading: {
      family: "channels",
      start_sample: 0,
      sample_rate: 48000,
      channel_count: channelSamples.length,
      samples_per_channel: channelSamples[0]?.length ?? 0,
      sample_type: "f32",
      channel_waveforms: [],
      channel_samples: channelSamples.map((samples) => Float32Array.from(samples)),
    },
    skipped_since_last_read: 0,
  };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("the meter of an Audio input", () => {
  it("is a class the Studio defines for an Audio input", () => {
    expectTypeOf(WireMeter).toExtend<InputControlElementClass<"audio">>();
  });

  it("reads a block's peak across its channels in decibels below full scale", () => {
    expect(peakLevelInDecibels([Float32Array.from([0.1, -0.5]), Float32Array.from([0.25])])).toBeCloseTo(-6.02, 2);
    expect(peakLevelInDecibels([Float32Array.from([1])])).toBe(0);
    expect(peakLevelInDecibels([Float32Array.from([0, 0])])).toBe(Number.NEGATIVE_INFINITY);
  });

  it("shows the level of each block that arrives, and silence below what it shows", () => {
    const { control, send } = mountedMeter();
    const meter = partOf(control, ".meter-track");
    const words = partOf(control, ".wire-words");
    expect(meter.hidden).toBe(true);
    expect(words.textContent).toBe("Waiting for audio");
    send(aBlock([[0.5, -0.25]]));
    expect(meter.hidden).toBe(false);
    expect(words.textContent).toBe("-6 dB");
    expect(meter.getAttribute("aria-valuenow")).toBe("-6");
    expect(partOf(control, ".meter-fill").style.width).toBe("90.0%");
    send(aBlock([[0, 0]]));
    expect(words.textContent).toBe("Silent");
    expect(partOf(control, ".meter-fill").style.width).toBe("0.0%");
  });

  it("says why it shows no level: nothing wired in, or pictures on its wire", () => {
    const { control, send } = mountedMeter();
    const words = partOf(control, ".wire-words");
    send({ kind: "unwired", because: "Nothing is wired into audio_in." });
    expect(words.textContent).toBe("Nothing is wired into audio_in.");
    expect(partOf(control, ".meter-track").hidden).toBe(true);
    const frame = aVideoFrameThatCountsItsCloses();
    send({ kind: "image_frame", video_frame: frame.videoFrame, format_wire_name: "rgba32", skipped_since_last_read: 0 });
    expect(frame.closes()).toBe(1);
    expect(words.textContent).toBe("What is wired in carries pictures, not audio.");
  });
});
