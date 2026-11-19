// The fixture view, written in `.ts` on the view SDK and served as written, with no build: its own
// header row after Studio's view-type menu, what is wired into its `picture` input, how the picture
// fits kept in its node's settings, and its fader sent on its `fader` output. It draws with React and
// the design system's parts, which the Studio supplies by name, through `createElement`; its own
// boxes with a stylesheet of its own on the design system's tokens; and the fader's words with a
// library it carries in `vendor/`.

import { connectToTatoApp, type TatoAppViewConnection, type ViewHeaderRow, type ViewInputEvent, type ViewSettings } from "@tatolab/tato-app-view-sdk";
import { PropertyRow } from "@tatolab/tato-app-view-sdk/design_system/property_fields";
import { RefusalLine } from "@tatolab/tato-app-view-sdk/design_system/refusal_line";
import { SegmentedChoiceControl } from "@tatolab/tato-app-view-sdk/design_system/segmented_choice_control";
import { StudioAreaHeaderRowInAFrame } from "@tatolab/tato-app-view-sdk/design_system/studio_area_frame";
import designSystemStyles from "@tatolab/tato-app-view-sdk/design_system/styles/design_system.css" with { type: "css" };
import { useViewReading } from "@tatolab/tato-app-view-sdk/design_system/view_readings";
import { WaitingState } from "@tatolab/tato-app-view-sdk/design_system/waiting_state";
import { createElement, useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import viewStyles from "./picture_and_fader_view.css" with { type: "css" };
import { levelWords } from "./vendor/level_words.js";

type PictureFit = "contain" | "cover";

/** How the picture fits the area, as its node's settings keep it. */
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
  return createElement(
    "div",
    { className: "picture-of-the-input" },
    createElement("canvas", { ref: canvasRef, width: 640, height: 360, style: { objectFit: pictureFit }, "data-fixture-view-picture-fit": pictureFit }),
    createElement("span", { className: "picture-of-the-input-words", "data-fixture-view-picture-status": "" }, `picture: ${pictureWords}`),
  );
}

/** The fader, sent on `fader` as it moves, with Studio's answer beside it. */
function FaderOfTheOutput({ connection }: { connection: TatoAppViewConnection }) {
  const [level, setLevel] = useState(0.5);
  const [answerWords, setAnswerWords] = useState("");
  const faderField = (fieldId: string) =>
    createElement(
      "div",
      { className: "fader-of-the-output-field" },
      createElement("input", {
        id: fieldId,
        type: "range",
        min: 0,
        max: 1,
        step: 0.01,
        value: level,
        onChange: (changeEvent: { currentTarget: HTMLInputElement }) => {
          const nextLevel = changeEvent.currentTarget.valueAsNumber;
          setLevel(nextLevel);
          void connection.sendOutput("fader", nextLevel).then((answer) => setAnswerWords(answer.kind === "refused" ? answer.because : "sent"));
        },
      }),
      createElement("span", { className: "fader-of-the-output-level" }, levelWords(level)),
    );
  return createElement(
    "div",
    { className: "fader-of-the-output" },
    createElement(PropertyRow, { label: "fader", meaning: "Sent on the view's fader output as it moves.", children: faderField }),
    answerWords === "" ? null : createElement("p", { className: "fader-of-the-output-answer", "data-fixture-view-fader-answer": "" }, answerWords),
  );
}

function PictureAndFaderView({ connection }: { connection: TatoAppViewConnection }) {
  const headerRow = useViewReading(useCallback((listener: (headerRow: ViewHeaderRow) => void) => connection.watchHeaderRow(listener), [connection]));
  const settings = useViewReading(useCallback((listener: (settings: ViewSettings) => void) => connection.watchSettings(listener), [connection]));
  const pictureFit = pictureFitOf(settings);
  const [pictureFitRefusal, setPictureFitRefusal] = useState<string | null>(null);
  return createElement(
    "div",
    { className: "picture-and-fader-view" },
    createElement(
      StudioAreaHeaderRowInAFrame,
      { headerRow: headerRow ?? null },
      createElement("span", { className: "header-row-gap" }),
      createElement(SegmentedChoiceControl<PictureFit>, {
        label: "How the picture fits",
        choices: [
          { choice: "contain", label: "Fit" },
          { choice: "cover", label: "Fill" },
        ],
        chosen: pictureFit,
        onChosen: (chosen: PictureFit) => void connection.rememberSettings({ picture_fit: chosen }).then((answer) => setPictureFitRefusal(answer.kind === "refused" ? answer.because : null)),
        dataAttributeOfEachSegment: "data-fixture-view-picture-fit-choice",
      }),
    ),
    pictureFitRefusal === null ? null : createElement(RefusalLine, { lead: "Keeping how the picture fits was refused:", words: pictureFitRefusal, layout: "bar" }),
    createElement(PictureOfTheInput, { connection, pictureFit }),
    createElement(FaderOfTheOutput, { connection }),
  );
}

document.adoptedStyleSheets = [...document.adoptedStyleSheets, designSystemStyles, viewStyles];
const viewRoot = createRoot(document.getElementById("view") ?? document.body);
viewRoot.render(createElement(WaitingState, { title: "Connecting to Tato Studio" }));
void connectToTatoApp().then((connection) => viewRoot.render(createElement(PictureAndFaderView, { connection })));
