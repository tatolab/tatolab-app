import { expect, test } from "vitest";
import { bytesOfTheResponse, bytesTotalAnnouncedBy } from "./https_response_bytes.js";
import { failedWith, succeeded } from "./result.js";

/** A 200 response whose body arrives in `runs`, with `headers`, erroring after them with `failure` where given. */
function responseOfRuns(runs: string[], headers: Record<string, string> = {}, failure: Error | null = null): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const run of runs) controller.enqueue(new TextEncoder().encode(run));
      if (failure === null) controller.close();
      else controller.error(failure);
    },
  });
  return new Response(body, { status: 200, headers });
}

/** A following that records each run of bytes told. */
function bytesRecorded() {
  const told: [number, number | null][] = [];
  return { told, following: { bytesRead: (bytesRead: number, bytesTotal: number | null) => told.push([bytesRead, bytesTotal]), stopped: new AbortController().signal } };
}

test("a body read in several runs tells each with the Content-Length's total, and answers every byte", async () => {
  const { told, following } = bytesRecorded();
  expect(await bytesOfTheResponse(responseOfRuns(["abc", "defg", "h"], { "content-length": "8" }), 100, following)).toEqual(succeeded(Buffer.from("abcdefgh")));
  expect(told).toEqual([
    [3, 8],
    [7, 8],
    [8, 8],
  ]);
});

test("a Content-Length that is missing, not a count, or of an encoded body gives no total", () => {
  expect(bytesTotalAnnouncedBy(new Response("x"))).toBeNull();
  expect(bytesTotalAnnouncedBy(new Response("x", { headers: { "content-length": "12abc" } }))).toBeNull();
  expect(bytesTotalAnnouncedBy(new Response("x", { headers: { "content-length": "40", "content-encoding": "gzip" } }))).toBeNull();
  expect(bytesTotalAnnouncedBy(new Response("x", { headers: { "content-length": " 40 ", "content-encoding": "identity" } }))).toBe(40);
});

test("a body over the largest byte count is refused by its Content-Length before reading, and as it is read where none is announced", async () => {
  const { told, following } = bytesRecorded();
  expect(await bytesOfTheResponse(responseOfRuns(["abcdef"], { "content-length": "6" }), 5, following)).toEqual(failedWith("it is 6 bytes, over the 5 a download may be"));
  expect(told).toEqual([]);
  expect(await bytesOfTheResponse(responseOfRuns(["abc", "def"]), 5, following)).toEqual(failedWith("it is over the 5 bytes a download may be"));
  expect(told).toEqual([[3, null]]);
});

test("a body that stops partway, as an aborted download's does, is refused in the failure's words", async () => {
  const { following } = bytesRecorded();
  expect(await bytesOfTheResponse(responseOfRuns(["abc"], {}, new Error("This operation was aborted")), 100, following)).toEqual(failedWith("This operation was aborted"));
});

test("a status other than 200 is refused naming it", async () => {
  expect(await bytesOfTheResponse(new Response("gone", { status: 404, statusText: "Not Found" }), 100, null)).toEqual(failedWith("HTTP 404 Not Found"));
});
