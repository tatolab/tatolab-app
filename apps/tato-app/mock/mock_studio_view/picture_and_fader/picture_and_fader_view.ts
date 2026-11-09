// The fixture view, written only against the view SDK as any view is: it draws its own header row
// after Studio's view-type menu, draws what is wired into its `picture` input, keeps how the picture
// fits in its area's settings, and sends its fader on its `fader` output.

import { connectToTatoApp, type ViewInputEvent, type ViewSettings } from "@tatolab/tato-app-view-sdk";

function elementWithId<ElementType extends HTMLElement>(id: string, elementType: new () => ElementType): ElementType | null {
  const element = document.getElementById(id);
  return element instanceof elementType ? element : null;
}

const pictureCanvas = elementWithId("picture", HTMLCanvasElement);
const pictureStatus = elementWithId("picture-status", HTMLDivElement);
const fader = elementWithId("fader", HTMLInputElement);
const faderValue = elementWithId("fader-value", HTMLOutputElement);
const faderAnswer = elementWithId("fader-answer", HTMLSpanElement);
const pictureFitButton = elementWithId("picture-fit", HTMLButtonElement);
const pictureContext = pictureCanvas?.getContext("2d") ?? null;

let framesDrawn = 0;

function showThePictureStatus(words: string): void {
  if (pictureStatus !== null) pictureStatus.textContent = words;
}

function drawTheInputEvent(inputEvent: ViewInputEvent): void {
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

/** How the picture fits the area, as the area's settings keep it. */
function pictureFitOf(settings: ViewSettings): "contain" | "cover" {
  return settings?.["picture_fit"] === "cover" ? "cover" : "contain";
}

void connectToTatoApp().then((connection) => {
  showThePictureStatus(`Connected as ${connection.grant.view_type_id}`);
  connection.watchHeaderRow((headerRow) => {
    document.documentElement.style.setProperty("--header-row-inset", `${headerRow.leading_inset_px}px`);
    document.documentElement.style.setProperty("--header-row-height", `${headerRow.height_px}px`);
  });
  let pictureFit: "contain" | "cover" = "contain";
  connection.watchSettings((settings) => {
    pictureFit = pictureFitOf(settings);
    if (pictureCanvas !== null) pictureCanvas.dataset["pictureFit"] = pictureFit;
    if (pictureFitButton !== null) pictureFitButton.textContent = pictureFit === "contain" ? "Fit" : "Fill";
  });
  pictureFitButton?.addEventListener("click", () => {
    void connection.rememberSettings({ picture_fit: pictureFit === "contain" ? "cover" : "contain" });
  });
  connection.watchInput("picture", drawTheInputEvent, (because) => showThePictureStatus(because));
  fader?.addEventListener("input", () => {
    const level = Number(fader.value);
    if (faderValue !== null) faderValue.textContent = level.toFixed(2);
    void connection.sendOutput("fader", level).then((answer) => {
      if (faderAnswer !== null) faderAnswer.textContent = answer.kind === "refused" ? answer.because : "sent";
    });
  });
});
