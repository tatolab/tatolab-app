import { useId, type ReactNode } from "react";
import type { PortFamily } from "../port_families";
import type { ControlDataAttributes } from "./support/control_data_attributes";

const EMBLEM_WIDTH = 320;
const EMBLEM_HEIGHT = 180;

const IMAGE_GLOWS = [
  { centreX: 110, centreY: 78, radius: 90, colour: "currentColor", opacity: 0.6 },
  { centreX: 214, centreY: 112, radius: 80, colour: "var(--brand)", opacity: 0.5 },
  { centreX: 176, centreY: 60, radius: 60, colour: "var(--studio-family-channels)", opacity: 0.28 },
] as const;

function ImageFrameEmblem() {
  const frameClipId = useId();
  const glowGradientIdPrefix = useId();
  const cornerMarks = ["M 8 34 V 8 H 34", "M 286 8 H 312 V 34", "M 312 146 V 172 H 286", "M 34 172 H 8 V 146"];
  return (
    <>
      <defs>
        <clipPath id={frameClipId}>
          <rect x={8} y={8} width={304} height={164} rx={10} />
        </clipPath>
        {IMAGE_GLOWS.map((glow, index) => (
          <radialGradient key={index} id={`${glowGradientIdPrefix}-${index}`}>
            <stop offset="0%" stopColor={glow.colour} stopOpacity={glow.opacity} />
            <stop offset="100%" stopColor={glow.colour} stopOpacity={0} />
          </radialGradient>
        ))}
      </defs>
      <rect x={8} y={8} width={304} height={164} rx={10} fill="currentColor" fillOpacity={0.05} stroke="currentColor" strokeOpacity={0.22} />
      <g clipPath={`url(#${frameClipId})`}>
        {IMAGE_GLOWS.map((glow, index) => (
          <rect
            key={index}
            className="port-family-placeholder-glow"
            x={glow.centreX - glow.radius}
            y={glow.centreY - glow.radius}
            width={glow.radius * 2}
            height={glow.radius * 2}
            fill={`url(#${glowGradientIdPrefix}-${index})`}
          />
        ))}
      </g>
      {cornerMarks.map((cornerMark) => (
        <path key={cornerMark} d={cornerMark} fill="none" stroke="currentColor" strokeOpacity={0.85} strokeWidth={2} strokeLinecap="round" />
      ))}
    </>
  );
}

/** A sine path twice the emblem's width, so sliding it left by half its width loops without a seam. */
function wavePathOf(wavelength: number, amplitude: number): string {
  const points: string[] = [];
  for (let x = 0; x <= EMBLEM_WIDTH * 2; x += 4) points.push(`${x},${(EMBLEM_HEIGHT / 2 - amplitude * Math.sin((2 * Math.PI * x) / wavelength)).toFixed(2)}`);
  return `M ${points.join(" L ")}`;
}

const CHANNEL_WAVES = [
  { wavelength: 160, amplitude: 36, opacity: 0.9 },
  { wavelength: EMBLEM_WIDTH / 3, amplitude: 22, opacity: 0.5 },
  { wavelength: 80, amplitude: 12, opacity: 0.3 },
] as const;

function ChannelsWavesEmblem() {
  const emblemClipId = useId();
  return (
    <>
      <defs>
        <clipPath id={emblemClipId}>
          <rect x={0} y={0} width={EMBLEM_WIDTH} height={EMBLEM_HEIGHT} />
        </clipPath>
      </defs>
      <line x1={0} x2={EMBLEM_WIDTH} y1={EMBLEM_HEIGHT / 2} y2={EMBLEM_HEIGHT / 2} stroke="currentColor" strokeOpacity={0.15} />
      <g clipPath={`url(#${emblemClipId})`}>
        {CHANNEL_WAVES.map((wave) => (
          <path key={wave.wavelength} className="port-family-placeholder-wave" d={wavePathOf(wave.wavelength, wave.amplitude)} fill="none" stroke="currentColor" strokeOpacity={wave.opacity} strokeWidth={2} strokeLinecap="round" />
        ))}
      </g>
    </>
  );
}

const ARRAY_COLUMNS = 14;
const ARRAY_ROWS = 7;
const ARRAY_CELL_PITCH = 20;
const ARRAY_CELL_SIZE = 16;

function ArrayGridEmblem() {
  const centreColumn = (ARRAY_COLUMNS - 1) / 2;
  const centreRow = (ARRAY_ROWS - 1) / 2;
  return (
    <>
      {Array.from({ length: ARRAY_ROWS * ARRAY_COLUMNS }, (_, index) => {
        const column = index % ARRAY_COLUMNS;
        const row = Math.floor(index / ARRAY_COLUMNS);
        const distanceFromTheCentre = Math.hypot(column - centreColumn, row - centreRow);
        return (
          <rect
            key={index}
            className="port-family-placeholder-value"
            x={EMBLEM_WIDTH / 2 + (column - centreColumn) * ARRAY_CELL_PITCH - ARRAY_CELL_SIZE / 2}
            y={EMBLEM_HEIGHT / 2 + (row - centreRow) * ARRAY_CELL_PITCH - ARRAY_CELL_SIZE / 2}
            width={ARRAY_CELL_SIZE}
            height={ARRAY_CELL_SIZE}
            rx={2}
            fill="currentColor"
            style={{ animationDelay: `${(-distanceFromTheCentre * 0.22).toFixed(2)}s` }}
          />
        );
      })}
    </>
  );
}

const PACKETS_UNIT_HEIGHTS = [70, 42, 50, 38, 56, 44, 120, 48, 40, 60, 36, 52, 128, 46, 54, 40, 58, 44];

function PacketsUnitsEmblem() {
  const unitPitch = 16;
  const firstUnitX = (EMBLEM_WIDTH - unitPitch * PACKETS_UNIT_HEIGHTS.length) / 2 + 4;
  return (
    <>
      <line x1={firstUnitX - 8} x2={EMBLEM_WIDTH - firstUnitX + 8} y1={160} y2={160} stroke="currentColor" strokeOpacity={0.2} />
      {PACKETS_UNIT_HEIGHTS.map((unitHeight, index) => {
        const startsAGroup = unitHeight > 100;
        return (
          <rect
            key={index}
            className="port-family-placeholder-unit"
            x={firstUnitX + index * unitPitch}
            y={160 - unitHeight}
            width={startsAGroup ? 10 : 8}
            height={unitHeight}
            rx={2}
            fill="currentColor"
            fillOpacity={startsAGroup ? 0.95 : 0.5}
            style={{ animationDelay: `${(-index * 0.13).toFixed(2)}s` }}
          />
        );
      })}
    </>
  );
}

const RECORD_VALUE_WIDTHS = [120, 84, 140, 66, 104];

function RecordsRowsEmblem() {
  return (
    <>
      {RECORD_VALUE_WIDTHS.map((valueWidth, row) => (
        <g key={row} className="port-family-placeholder-row" style={{ animationDelay: `${(row * 0.22).toFixed(2)}s` }}>
          <rect x={48} y={24 + row * 28} width={64} height={10} rx={5} fill="currentColor" fillOpacity={0.55} />
          <rect x={128} y={24 + row * 28} width={valueWidth} height={10} rx={5} fill="currentColor" />
        </g>
      ))}
    </>
  );
}

function UnknownFamilyFramesEmblem() {
  return (
    <>
      {[0, 1, 2].map((frame) => (
        <rect key={frame} className="port-family-placeholder-frame" x={16} y={8} width={EMBLEM_WIDTH - 32} height={EMBLEM_HEIGHT - 16} rx={14} fill="none" stroke="currentColor" strokeWidth={1.5} />
      ))}
    </>
  );
}

function PortFamilyEmblem({ family }: { family: PortFamily | null }) {
  if (family === "image") return <ImageFrameEmblem />;
  if (family === "channels") return <ChannelsWavesEmblem />;
  if (family === "array") return <ArrayGridEmblem />;
  if (family === "packets") return <PacketsUnitsEmblem />;
  if (family === "records") return <RecordsRowsEmblem />;
  return <UnknownFamilyFramesEmblem />;
}

/** What a port's preview shows while nothing live reaches it: its family's emblem, what it previews, when it will show live, and, folded under Details, words such as the runtime's own. */
export function PortFamilyPlaceholder({
  family,
  title,
  explanation,
  details,
  ...controlDataAttributes
}: {
  /** The family the previewed port carries; `null` draws a neutral emblem. */
  family: PortFamily | null;
  title: string;
  explanation: string;
  details?: ReactNode;
} & ControlDataAttributes) {
  return (
    <div className="port-family-placeholder" data-family={family ?? undefined} {...controlDataAttributes}>
      <svg className="port-family-placeholder-emblem" viewBox={`0 0 ${EMBLEM_WIDTH} ${EMBLEM_HEIGHT}`} aria-hidden>
        <PortFamilyEmblem family={family} />
      </svg>
      <div className="flex max-w-md flex-col items-center gap-1 text-center">
        <div className="text-sm text-fg">{title}</div>
        <div className="text-2xs text-fg-3">{explanation}</div>
        {details !== undefined && (
          <details className="mt-1 text-2xs text-fg-3" data-port-family-placeholder-details="">
            <summary className="cursor-pointer select-none hover:text-fg-2">Details</summary>
            <div className="mt-1 break-words select-text">{details}</div>
          </details>
        )}
      </div>
    </div>
  );
}
