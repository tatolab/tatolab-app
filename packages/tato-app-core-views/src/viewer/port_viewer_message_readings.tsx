import { KeyValueRows, type KeyValueRow } from "@tatolab/tato-app-view-sdk/design_system/key_value_rows";
import type { JsonValue, PortViewerArrayAttributeReading, PortViewerChannelWaveform, PortViewerMessageReading } from "@tatolab/tato-app-view-sdk";
import { VALUES_UNCHECKED_MEANING } from "../shared/port_stream_facts_words";

/** One Packets unit the Node visualizer has read: when it was stamped, how many bytes it carried, and whether it was a keyframe. */
export type PacketsUnitSeen = { timestamp_ns: number; byte_length: number; starts_group: boolean };

/** How long a span of Packets units the Node visualizer keeps to draw and to measure the bitrate over. */
export const PACKETS_UNITS_KEPT_FOR_NS = 5_000_000_000;

const NANOSECONDS_PER_SECOND = 1_000_000_000;

/** `unitsSeen` with `reading`'s unit added, dropping units older than [`PACKETS_UNITS_KEPT_FOR_NS`] before it, and every unit after it when the stamps went back. */
export function packetsUnitsSeenWith(unitsSeen: readonly PacketsUnitSeen[], reading: Extract<PortViewerMessageReading, { family: "packets" }>): PacketsUnitSeen[] {
  const unit: PacketsUnitSeen = { timestamp_ns: reading.timestamp_ns, byte_length: reading.byte_length, starts_group: reading.starts_group };
  return [...unitsSeen.filter((unitSeen) => unitSeen.timestamp_ns < unit.timestamp_ns && unit.timestamp_ns - unitSeen.timestamp_ns <= PACKETS_UNITS_KEPT_FOR_NS), unit];
}

/** The bitrate of the last second of `unitsSeen` in bits per second, the time between their last two keyframes, and how many units they hold. */
export function packetsFactsOf(unitsSeen: readonly PacketsUnitSeen[]): { bits_per_second: number | null; keyframe_interval_ns: number | null; keyframes: number } {
  const latest = unitsSeen.at(-1);
  if (latest === undefined) return { bits_per_second: null, keyframe_interval_ns: null, keyframes: 0 };
  const lastSecond = unitsSeen.filter((unit) => latest.timestamp_ns - unit.timestamp_ns < NANOSECONDS_PER_SECOND);
  const spanNs = latest.timestamp_ns - (lastSecond[0]?.timestamp_ns ?? latest.timestamp_ns);
  const bytesInTheSpan = lastSecond.slice(1).reduce((bytes, unit) => bytes + unit.byte_length, 0);
  const keyframeStamps = unitsSeen.filter((unit) => unit.starts_group).map((unit) => unit.timestamp_ns);
  const [secondToLastKeyframe, lastKeyframe] = keyframeStamps.slice(-2);
  return {
    bits_per_second: spanNs > 0 ? (bytesInTheSpan * 8 * NANOSECONDS_PER_SECOND) / spanNs : null,
    keyframe_interval_ns: secondToLastKeyframe !== undefined && lastKeyframe !== undefined ? lastKeyframe - secondToLastKeyframe : null,
    keyframes: keyframeStamps.length,
  };
}

/** A record's fields as rows, a nested map's fields under their dotted path, each other value as JSON. */
export function recordRowsOf(record: JsonValue, pathSoFar = ""): KeyValueRow[] {
  if (typeof record !== "object" || record === null || Array.isArray(record)) return [[pathSoFar === "" ? "value" : pathSoFar, JSON.stringify(record)]];
  return Object.entries(record).flatMap(([fieldName, fieldValue]) => {
    const fieldPath = pathSoFar === "" ? fieldName : `${pathSoFar}.${fieldName}`;
    if (typeof fieldValue === "object" && fieldValue !== null && !Array.isArray(fieldValue)) return recordRowsOf(fieldValue, fieldPath);
    return [[fieldPath, typeof fieldValue === "string" ? fieldValue : JSON.stringify(fieldValue)] as const];
  });
}

function decibelsFullScaleWords(level: number): string {
  return level <= 0 ? "−∞ dBFS" : `${(20 * Math.log10(level)).toFixed(1)} dBFS`;
}

function numberWords(value: number): string {
  if (Number.isInteger(value)) return value.toString();
  return Math.abs(value) >= 1_000 || Math.abs(value) < 0.001 ? value.toExponential(3) : value.toFixed(4);
}

function bitsPerSecondWords(bitsPerSecond: number): string {
  if (bitsPerSecond >= 1_000_000) return `${(bitsPerSecond / 1_000_000).toFixed(2)} Mbit/s`;
  return `${(bitsPerSecond / 1_000).toFixed(1)} kbit/s`;
}

const WAVEFORM_HEIGHT = 100;

function ChannelWaveformDrawing({ waveform, channel }: { waveform: PortViewerChannelWaveform; channel: number }) {
  const columnCount = waveform.column_minimums.length;
  const yOf = (sample: number) => (WAVEFORM_HEIGHT / 2) * (1 - Math.max(-1, Math.min(1, sample)));
  const upperEdge = waveform.column_maximums.map((maximum, column) => `${column},${yOf(maximum).toFixed(2)}`);
  const lowerEdge = waveform.column_minimums.map((minimum, column) => `${column},${yOf(minimum).toFixed(2)}`).reverse();
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1" data-viewer-channel={channel}>
      <div className="flex items-baseline justify-between text-2xs text-fg-3">
        <span>Channel {channel + 1}</span>
        <span className="font-mono">
          peak {decibelsFullScaleWords(waveform.peak)} · RMS {decibelsFullScaleWords(waveform.rms)}
        </span>
      </div>
      <svg viewBox={`0 0 ${Math.max(columnCount - 1, 1)} ${WAVEFORM_HEIGHT}`} preserveAspectRatio="none" className="min-h-0 w-full flex-1 rounded-sm bg-well" role="img" aria-label={`Waveform of channel ${channel + 1}`}>
        <line x1={0} x2={Math.max(columnCount - 1, 1)} y1={WAVEFORM_HEIGHT / 2} y2={WAVEFORM_HEIGHT / 2} className="stroke-line" strokeWidth={0.5} vectorEffect="non-scaling-stroke" />
        <polygon points={[...upperEdge, ...lowerEdge].join(" ")} className="fill-brand stroke-brand" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}

function ChannelsReading({ reading }: { reading: Extract<PortViewerMessageReading, { family: "channels" }> }) {
  const blockMs = (reading.samples_per_channel / reading.sample_rate) * 1_000;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-3" data-viewer-reading="channels">
      <div className="font-mono text-2xs text-fg-3">
        {reading.channel_count} ch · {reading.sample_rate} Hz · {reading.sample_type} · {reading.samples_per_channel} samples ({blockMs.toFixed(1)} ms) · at{" "}
        {(reading.start_sample / reading.sample_rate).toFixed(2)} s
      </div>
      {reading.channel_waveforms.map((waveform, channel) => (
        <ChannelWaveformDrawing key={channel} waveform={waveform} channel={channel} />
      ))}
    </div>
  );
}

function arrayAttributeRow(attribute: PortViewerArrayAttributeReading): KeyValueRow {
  const shapeWords = `${attribute.dtype}[${attribute.shape.join(" × ")}]`;
  if (attribute.residency === "gpu") return [attribute.name, `${shapeWords} · on the GPU`];
  if (attribute.statistics === null) return [attribute.name, `${shapeWords} · no statistics for ${attribute.dtype}`];
  const { minimum, maximum, mean, element_count } = attribute.statistics;
  return [attribute.name, `${shapeWords} · min ${numberWords(minimum)} · max ${numberWords(maximum)} · mean ${numberWords(mean)} · ${element_count} values`];
}

function PacketsReading({ reading, unitsSeen }: { reading: Extract<PortViewerMessageReading, { family: "packets" }>; unitsSeen: readonly PacketsUnitSeen[] }) {
  const facts = packetsFactsOf(unitsSeen);
  const firstStampNs = unitsSeen[0]?.timestamp_ns ?? reading.timestamp_ns;
  const largestUnit = Math.max(1, ...unitsSeen.map((unit) => unit.byte_length));
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-3" data-viewer-reading="packets">
      <KeyValueRows
        look="fields"
        rows={[
          ["codec", reading.codec === "" ? "none (a plain byte stream)" : reading.codec],
          ["bitrate", facts.bits_per_second === null ? "measuring…" : bitsPerSecondWords(facts.bits_per_second)],
          ["keyframe every", facts.keyframe_interval_ns === null ? "waiting for two keyframes" : `${(facts.keyframe_interval_ns / NANOSECONDS_PER_SECOND).toFixed(2)} s`],
          ["latest unit", `${reading.byte_length} bytes${reading.starts_group ? " · keyframe" : ""}`],
        ]}
      />
      <svg viewBox={`0 0 ${PACKETS_UNITS_KEPT_FOR_NS / 1_000_000} 100`} preserveAspectRatio="none" className="min-h-0 w-full flex-1 rounded-sm bg-well" role="img" aria-label="The last five seconds of units, keyframes marked">
        {unitsSeen.map((unit) => {
          const x = (unit.timestamp_ns - firstStampNs) / 1_000_000;
          const height = Math.max(2, (unit.byte_length / largestUnit) * 96);
          return (
            <rect
              key={unit.timestamp_ns}
              x={x}
              y={100 - height}
              width={unit.starts_group ? 24 : 12}
              height={height}
              className={unit.starts_group ? "fill-warn" : "fill-brand"}
              data-viewer-packets-unit={unit.starts_group ? "keyframe" : "delta"}
            />
          );
        })}
      </svg>
      <div className="text-2xs text-fg-3">Units of the last five seconds by size, keyframes in amber. Decoding a picture from them comes later.</div>
    </div>
  );
}

/** What the Node visualizer shows of a port of a family other than Image: the latest message, read by its family. */
export function PortViewerMessageReadingShown({
  reading,
  unitsSeen,
  messagesRead,
  valuesChecked,
}: {
  reading: PortViewerMessageReading;
  unitsSeen: readonly PacketsUnitSeen[];
  messagesRead: number;
  /** The port's `values_checked` mark: `false` on a Records port, whose values no type checks. */
  valuesChecked: boolean | null;
}) {
  if (reading.family === "channels") return <ChannelsReading reading={reading} />;
  if (reading.family === "packets") return <PacketsReading reading={reading} unitsSeen={unitsSeen} />;
  if (reading.family === "records") {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto p-3" data-viewer-reading="records">
        <div className="text-2xs text-fg-3">
          The latest record of {messagesRead} read.
          {valuesChecked === false && (
            <>
              {" "}
              <span className="text-warn-text" title={VALUES_UNCHECKED_MEANING} data-viewer-values-unchecked="">
                Values unchecked:
              </span>{" "}
              {VALUES_UNCHECKED_MEANING}
            </>
          )}
        </div>
        <KeyValueRows look="fields" rows={recordRowsOf(reading.record)} />
      </div>
    );
  }
  if (reading.family === "array") {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto p-3" data-viewer-reading="array">
        <div className="text-2xs text-fg-3">
          {reading.attributes.length} attribute{reading.attributes.length === 1 ? "" : "s"} in the latest frame of {messagesRead} read.
        </div>
        <KeyValueRows look="fields" rows={reading.attributes.map(arrayAttributeRow)} />
      </div>
    );
  }
  if (reading.family === "unreadable") {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-2 p-3" data-viewer-reading="unreadable">
        <div className="text-sm text-danger-text">The latest {reading.port_family} message did not read</div>
        <div className="text-2xs text-fg-3">{reading.because}</div>
      </div>
    );
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 p-3" data-viewer-reading="bytes">
      <div className="text-2xs text-fg-3">
        {messagesRead} messages read; the latest is {reading.byte_length} bytes that no family describes.
      </div>
    </div>
  );
}
