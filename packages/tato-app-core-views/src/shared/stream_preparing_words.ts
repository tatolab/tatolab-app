import type { ListedStream } from "@tatolab/tato-app-view-sdk/studio_readings";

/** What a view says of a stream the runtime lists `preparing` or `stopping`, naming the step under way; `null` for a stream in any other state. */
export function streamPreparingWords(listedStream: ListedStream | undefined, streamWords: string): { title: string; explanation: string } | null {
  if (listedStream === undefined) return null;
  if (listedStream.state === "stopping") return { title: `${streamWords} is stopping`, explanation: "The runtime is stopping its nodes." };
  if (listedStream.state !== "preparing") return null;
  return { title: `${streamWords} is preparing`, explanation: preparingStepWords(listedStream.step) };
}

/** A preparing stream's step: a step newer than this app in its own spelling; `null` while its action waits in its project's queue. */
export function preparingStepWords(step: string | null): string {
  switch (step) {
    case null:
      return "Waiting for the project's other stream actions to finish…";
    case "reading_the_graph_documents":
      return "Reading the stream's graph…";
    case "making_the_venv":
      return "Installing the project's Python packages…";
    case "starting":
      return "Starting its nodes…";
    default:
      return `${step}…`;
  }
}
