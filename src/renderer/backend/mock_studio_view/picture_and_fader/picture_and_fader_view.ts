// The fixture view, written only against the SDK as a view people write is: it draws what is wired
// into its `picture` input and sends its fader on its `fader` output.

import { connectToTatoStudio, type StudioViewInputEvent } from "../../../studio_view_sdk/tato_studio_view_connection";

function elementWithId<ElementType extends HTMLElement>(id: string, elementType: new () => ElementType): ElementType | null {
  const element = document.getElementById(id);
  return element instanceof elementType ? element : null;
}

const pictureCanvas = elementWithId("picture", HTMLCanvasElement);
const pictureStatus = elementWithId("picture-status", HTMLDivElement);
const fader = elementWithId("fader", HTMLInputElement);
const faderValue = elementWithId("fader-value", HTMLOutputElement);
const faderAnswer = elementWithId("fader-answer", HTMLSpanElement);
const pictureContext = pictureCanvas?.getContext("2d") ?? null;

let framesDrawn = 0;

function showThePictureStatus(words: string): void {
  if (pictureStatus !== null) pictureStatus.textContent = words;
}

function drawTheInputEvent(inputEvent: StudioViewInputEvent): void {
  if (inputEvent.kind === "image_frame") {
    const { video_frame: videoFrame } = inputEvent;
    if (pictureCanvas !== null && pictureContext !== null) {
      if (pictureCanvas.width !== videoFrame.displayWidth || pictureCanvas.height !== videoFrame.displayHeight) {
        pictureCanvas.width = videoFrame.displayWidth;
        pictureCanvas.height = videoFrame.displayHeight;
      }
      pictureContext.drawImage(videoFrame, 0, 0);
    }
    videoFrame.close();
    framesDrawn += 1;
    showThePictureStatus(`picture: ${framesDrawn} frames drawn`);
  } else if (inputEvent.kind === "image_pixels") {
    showThePictureStatus(`picture: ${inputEvent.width}×${inputEvent.height} ${inputEvent.format_wire_name} pixels`);
  } else if (inputEvent.kind === "unwired" || inputEvent.kind === "reopening" || inputEvent.kind === "ended") {
    showThePictureStatus(`picture: ${inputEvent.because}`);
  }
}

void connectToTatoStudio().then((connection) => {
  showThePictureStatus(`Connected as ${connection.grant.view_type_id}`);
  connection.watchInput("picture", drawTheInputEvent, (because) => showThePictureStatus(because));
  fader?.addEventListener("input", () => {
    const level = Number(fader.value);
    if (faderValue !== null) faderValue.textContent = level.toFixed(2);
    void connection.sendOutput("fader", level).then((answer) => {
      if (faderAnswer !== null) faderAnswer.textContent = answer.kind === "refused" ? answer.because : "sent";
    });
  });
});
