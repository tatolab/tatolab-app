// The fixture view, made with the view SDK and drawn with its design kit as any view may be: its
// own header row after Studio's view-type menu, what is wired into its `picture` input, how the
// picture fits kept in its area's settings, and its fader sent on its `fader` output.

import "@tatolab/tato-app-view-sdk/kit/styles/kit.css";
import { connectToTatoApp, type TatoAppViewConnection, type ViewHeaderRow, type ViewInputEvent, type ViewSettings } from "@tatolab/tato-app-view-sdk";
import { PropertyRow } from "@tatolab/tato-app-view-sdk/kit/property_fields";
import { SegmentedChoiceControl } from "@tatolab/tato-app-view-sdk/kit/segmented_choice_control";
import { StudioAreaHeaderRowInAFrame } from "@tatolab/tato-app-view-sdk/kit/studio_area_frame";
import { useViewReading } from "@tatolab/tato-app-view-sdk/kit/view_readings";
import { WaitingState } from "@tatolab/tato-app-view-sdk/kit/waiting_state";
import { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

type PictureFit = "contain" | "cover";

/** How the picture fits the area, as the area's settings keep it. */
function pictureFitOf(settings: ViewSettings): PictureFit {
  return settings?.["picture_fit"] === "cover" ? "cover" : "contain";
}

/** What is wired into `picture`, drawn on a canvas, with what the input last said beside it. */
function PictureOfTheInput({ connection, pictureFit }: { connection: TatoAppViewConnection; pictureFit: PictureFit }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pictureWords, setPictureWords] = useState("Waiting for the picture");
  useEffect(() => {
    let framesDrawn = 0;
    const drawTheInputEvent = (inputEvent: ViewInputEvent) => {
      if (inputEvent.kind === "image_frame") {
        const { video_frame: videoFrame } = inputEvent;
        const canvas = canvasRef.current;
        const canvasContext = canvas?.getContext("2d") ?? null;
        if (canvas !== null && canvasContext !== null) {
          if (canvas.width !== videoFrame.displayWidth || canvas.height !== videoFrame.displayHeight) {
            canvas.width = videoFrame.displayWidth;
            canvas.height = videoFrame.displayHeight;
          }
          canvasContext.drawImage(videoFrame, 0, 0);
        }
        videoFrame.close();
        framesDrawn += 1;
        setPictureWords(`${framesDrawn} frames drawn`);
      } else if (inputEvent.kind === "image_pixels") {
        setPictureWords(`${inputEvent.width}×${inputEvent.height} ${inputEvent.format_wire_name} pixels`);
      } else if (inputEvent.kind === "unwired" || inputEvent.kind === "reopening" || inputEvent.kind === "ended") {
        setPictureWords(inputEvent.because);
      }
    };
    return connection.watchInput("picture", drawTheInputEvent, setPictureWords);
  }, [connection]);
  return (
    <div className="relative min-h-0 flex-1">
      <canvas ref={canvasRef} width={640} height={360} className="block size-full" style={{ objectFit: pictureFit }} data-fixture-view-picture-fit={pictureFit} />
      <span className="absolute top-2 left-3 text-xs text-fg-3" data-fixture-view-picture-status="">
        picture: {pictureWords}
      </span>
    </div>
  );
}

/** The fader, sent on `fader` as it moves, with Studio's answer beside it. */
function FaderOfTheOutput({ connection }: { connection: TatoAppViewConnection }) {
  const [level, setLevel] = useState(0.5);
  const [answerWords, setAnswerWords] = useState("");
  return (
    <div className="flex flex-col gap-1 border-t border-studio-area-header-line px-3 py-2">
      <PropertyRow label="fader" meaning="Sent on the view's fader output as it moves.">
        {(fieldId) => (
          <div className="flex items-center gap-2">
            <input
              id={fieldId}
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={level}
              className="min-w-0 flex-1 accent-brand"
              onChange={(changeEvent) => {
                const nextLevel = Number(changeEvent.target.value);
                setLevel(nextLevel);
                void connection.sendOutput("fader", nextLevel).then((answer) => setAnswerWords(answer.kind === "refused" ? answer.because : "sent"));
              }}
            />
            <span className="w-9 text-right font-mono text-xs tabular-nums text-fg-2">{level.toFixed(2)}</span>
          </div>
        )}
      </PropertyRow>
      {answerWords !== "" && (
        <p className="text-xs text-fg-3" data-fixture-view-fader-answer="">
          {answerWords}
        </p>
      )}
    </div>
  );
}

function PictureAndFaderView({ connection }: { connection: TatoAppViewConnection }) {
  const headerRow = useViewReading(useCallback((listener: (headerRow: ViewHeaderRow) => void) => connection.watchHeaderRow(listener), [connection]));
  const settings = useViewReading(useCallback((listener: (settings: ViewSettings) => void) => connection.watchSettings(listener), [connection]));
  const pictureFit = pictureFitOf(settings ?? null);
  return (
    <div className="flex h-screen flex-col bg-studio-area text-fg">
      <StudioAreaHeaderRowInAFrame headerRow={headerRow ?? { leading_inset_px: 0, height_px: 30 }}>
        <span className="flex-1" />
        <SegmentedChoiceControl
          label="How the picture fits"
          choices={[
            { choice: "contain", label: "Fit" },
            { choice: "cover", label: "Fill" },
          ]}
          chosen={pictureFit}
          onChosen={(chosen) => void connection.rememberSettings({ picture_fit: chosen })}
          dataAttributeOfEachSegment="data-fixture-view-picture-fit-choice"
        />
      </StudioAreaHeaderRowInAFrame>
      <PictureOfTheInput connection={connection} pictureFit={pictureFit} />
      <FaderOfTheOutput connection={connection} />
    </div>
  );
}

const viewRoot = createRoot(document.getElementById("view") ?? document.body);
viewRoot.render(<WaitingState title="Connecting to Tato Studio" />);
void connectToTatoApp().then((connection) => viewRoot.render(<PictureAndFaderView connection={connection} />));
