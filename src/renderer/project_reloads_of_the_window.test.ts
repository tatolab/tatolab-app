import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectReloadsOfTheWindow, type ProjectReloadBackend } from "./project_reloads_of_the_window";
import { MOST_FAILED_STREAM_ACTION_READS_IN_A_ROW, STREAM_ACTION_FOLLOWING_INTERVAL_MILLISECONDS } from "./stream_action_following";
import type { StreamActionDescription, StreamActionFollowed } from "../shared/tatolab_backend_contract";

const HALLWAYS = "/Users/someone/code/hallways";
const DOORWAYS = "/Users/someone/code/doorways";

function reloadDescription(projectDirectory: string, changes: Partial<StreamActionDescription>): StreamActionDescription {
  return { action: `R1-${projectDirectory === HALLWAYS ? 3 : 4}`, project_directory: projectDirectory, kind: "load", state: "queued", step: null, streams: [], failed_because: null, ...changes };
}

function described(description: StreamActionDescription): StreamActionFollowed {
  return { kind: "described", description };
}

/** A backend that queues each project's reload as its own action and answers each read of an action with the next of its answers, the last again once they run out; `null` rejects as the runtime not answering. A cancel is answered `cancelled`, or refused with `cancelRefusal`. */
function scriptedBackend(followedAnswersByAction: Record<string, readonly (StreamActionFollowed | null)[]>, cancelRefusal: string | null = null) {
  const actionsDescribed: string[] = [];
  const actionsCancelled: string[] = [];
  const projectsReloaded: string[] = [];
  const answerIndexByAction = new Map<string, number>();
  const backend: ProjectReloadBackend = {
    reloadProject: async (projectDirectory) => {
      projectsReloaded.push(projectDirectory);
      return { action: reloadDescription(projectDirectory, {}).action, project_directory: projectDirectory };
    },
    describeStreamAction: async (action) => {
      actionsDescribed.push(action);
      const answers = followedAnswersByAction[action] ?? [];
      const answerIndex = answerIndexByAction.get(action) ?? 0;
      answerIndexByAction.set(action, answerIndex + 1);
      const answer = answers[Math.min(answerIndex, answers.length - 1)] ?? null;
      if (answer === null) throw "no runtime answers";
      return answer;
    },
    cancelStreamAction: async (action) => {
      actionsCancelled.push(action);
      if (cancelRefusal !== null) throw cancelRefusal;
      return { action, state: "cancelled" };
    },
  };
  return { backend, actionsDescribed, actionsCancelled, projectsReloaded };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("each project's Reload", () => {
  it("queues run_project, follows the reload each round to its end, then stops reading it", async () => {
    vi.useFakeTimers();
    const { backend, actionsDescribed, projectsReloaded } = scriptedBackend({
      "R1-3": [
        described(reloadDescription(HALLWAYS, { state: "in_progress", step: "compiling" })),
        null,
        described(reloadDescription(HALLWAYS, { state: "done", streams: [{ stream: "hallways-main-1a2b3c", display_name: "main", state: "running" }] })),
      ],
    });
    const projectReloads = new ProjectReloadsOfTheWindow(backend);
    const reloadChanges = vi.fn();
    projectReloads.subscribeToReloads(reloadChanges);

    projectReloads.reload(HALLWAYS);
    expect(projectReloads.readReloadOf(HALLWAYS)).toEqual({ kind: "queuing" });
    await vi.advanceTimersByTimeAsync(0);
    expect(projectReloads.readReloadOf(HALLWAYS)).toMatchObject({ kind: "following", action: "R1-3", description: { state: "in_progress", step: "compiling" } });
    await vi.advanceTimersByTimeAsync(STREAM_ACTION_FOLLOWING_INTERVAL_MILLISECONDS * 2);
    expect(projectReloads.readReloadOf(HALLWAYS)).toMatchObject({ kind: "ended", action: "R1-3", description: { state: "done" } });
    await vi.advanceTimersByTimeAsync(STREAM_ACTION_FOLLOWING_INTERVAL_MILLISECONDS * 3);

    expect(projectsReloaded).toEqual([HALLWAYS]);
    expect(actionsDescribed).toEqual(["R1-3", "R1-3", "R1-3"]);
    expect(reloadChanges).toHaveBeenCalled();
  });

  it("keeps following a reload in a state newer than this app", async () => {
    vi.useFakeTimers();
    const { backend } = scriptedBackend({
      "R1-3": [described(reloadDescription(HALLWAYS, { state: "waiting_for_a_device" })), described(reloadDescription(HALLWAYS, { state: "done" }))],
    });
    const projectReloads = new ProjectReloadsOfTheWindow(backend);

    projectReloads.reload(HALLWAYS);
    await vi.advanceTimersByTimeAsync(0);
    expect(projectReloads.readReloadOf(HALLWAYS)).toMatchObject({ kind: "following", description: { state: "waiting_for_a_device" } });
    await vi.advanceTimersByTimeAsync(STREAM_ACTION_FOLLOWING_INTERVAL_MILLISECONDS);
    expect(projectReloads.readReloadOf(HALLWAYS)).toMatchObject({ kind: "ended", description: { state: "done" } });
  });

  it("asks nothing more while a reload is under way, and follows two projects' reloads apart", async () => {
    vi.useFakeTimers();
    const { backend, projectsReloaded } = scriptedBackend({
      "R1-3": [described(reloadDescription(HALLWAYS, { state: "in_progress", step: "starting" }))],
      "R1-4": [described(reloadDescription(DOORWAYS, { state: "failed", failed_because: "the project directory does not exist" }))],
    });
    const projectReloads = new ProjectReloadsOfTheWindow(backend);

    projectReloads.reload(HALLWAYS);
    projectReloads.reload(HALLWAYS);
    projectReloads.reload(DOORWAYS);
    await vi.advanceTimersByTimeAsync(0);

    expect(projectsReloaded).toEqual([HALLWAYS, DOORWAYS]);
    expect(projectReloads.readReloadOf(HALLWAYS)).toMatchObject({ kind: "following", description: { step: "starting" } });
    expect(projectReloads.readReloadOf(DOORWAYS)).toMatchObject({ kind: "ended", description: { state: "failed", failed_because: "the project directory does not exist" } });
  });

  it("keeps the runtime's refusal to queue a reload in its own words, and puts away only a reload that has ended", async () => {
    vi.useFakeTimers();
    const refusal = "Resource not found: this runtime holds no stream of the project in /Users/someone/code/hallways";
    const { backend } = scriptedBackend({ "R1-4": [described(reloadDescription(DOORWAYS, { state: "queued" }))] });
    const projectReloads = new ProjectReloadsOfTheWindow({
      ...backend,
      reloadProject: async (projectDirectory) => {
        if (projectDirectory === HALLWAYS) throw refusal;
        return backend.reloadProject(projectDirectory);
      },
    });

    projectReloads.reload(HALLWAYS);
    projectReloads.reload(DOORWAYS);
    await vi.advanceTimersByTimeAsync(0);
    expect(projectReloads.readReloadOf(HALLWAYS)).toEqual({ kind: "refused", words: refusal });

    projectReloads.putAwayTheEndedReloadOf(HALLWAYS);
    projectReloads.putAwayTheEndedReloadOf(DOORWAYS);
    expect(projectReloads.readReloadOf(HALLWAYS)).toBeNull();
    expect(projectReloads.readReloadOf(DOORWAYS)).toMatchObject({ kind: "following" });
  });

  it("ends a reload the runtime no longer holds, or whose reads fail too many times in a row, saying why", async () => {
    vi.useFakeTimers();
    const notHeldWords = "Invalid configuration: the stream action `R1-3` is not held";
    const { backend, actionsDescribed } = scriptedBackend({ "R1-3": [{ kind: "not_held", words: notHeldWords }], "R1-4": [null] });
    const projectReloads = new ProjectReloadsOfTheWindow(backend);

    projectReloads.reload(HALLWAYS);
    projectReloads.reload(DOORWAYS);
    await vi.advanceTimersByTimeAsync(STREAM_ACTION_FOLLOWING_INTERVAL_MILLISECONDS * (MOST_FAILED_STREAM_ACTION_READS_IN_A_ROW - 1));

    expect(projectReloads.readReloadOf(HALLWAYS)).toEqual({ kind: "no_longer_followed", action: "R1-3", words: notHeldWords });
    expect(projectReloads.readReloadOf(DOORWAYS)).toEqual({ kind: "no_longer_followed", action: "R1-4", words: "Tatolab could not read the load: no runtime answers" });
    expect(actionsDescribed.filter((action) => action === "R1-3")).toHaveLength(1);
    expect(actionsDescribed.filter((action) => action === "R1-4")).toHaveLength(MOST_FAILED_STREAM_ACTION_READS_IN_A_ROW);
  });

  it("cancels the reload it follows once, says so until the following reads it cancelled, and keeps a declined cancel's words", async () => {
    vi.useFakeTimers();
    const refusal = "Invalid configuration: the stream action `R1-4` is already done, so there is nothing to cancel";
    const { backend, actionsCancelled } = scriptedBackend({
      "R1-3": [described(reloadDescription(HALLWAYS, { state: "queued" })), described(reloadDescription(HALLWAYS, { state: "cancelled" }))],
      "R1-4": [described(reloadDescription(DOORWAYS, { state: "in_progress", step: "compiling" }))],
    });
    const projectReloads = new ProjectReloadsOfTheWindow({
      ...backend,
      cancelStreamAction: async (action) => {
        if (action === "R1-4") {
          actionsCancelled.push(action);
          throw refusal;
        }
        return backend.cancelStreamAction(action);
      },
    });

    projectReloads.cancelTheReloadOf(HALLWAYS);
    projectReloads.reload(HALLWAYS);
    projectReloads.reload(DOORWAYS);
    await vi.advanceTimersByTimeAsync(0);
    projectReloads.cancelTheReloadOf(HALLWAYS);
    projectReloads.cancelTheReloadOf(HALLWAYS);
    projectReloads.cancelTheReloadOf(DOORWAYS);
    expect(projectReloads.readReloadOf(HALLWAYS)).toMatchObject({ kind: "following", cancel: { kind: "asking" } });
    await vi.advanceTimersByTimeAsync(0);
    expect(actionsCancelled).toEqual(["R1-3", "R1-4"]);
    expect(projectReloads.readReloadOf(HALLWAYS)).toMatchObject({ kind: "following", cancel: { kind: "answered" } });
    expect(projectReloads.readReloadOf(DOORWAYS)).toMatchObject({ kind: "following", cancel: { kind: "refused", words: refusal } });

    await vi.advanceTimersByTimeAsync(STREAM_ACTION_FOLLOWING_INTERVAL_MILLISECONDS);
    expect(projectReloads.readReloadOf(HALLWAYS)).toMatchObject({ kind: "ended", description: { state: "cancelled" } });
    expect(projectReloads.readReloadOf(DOORWAYS)).toMatchObject({ kind: "following", description: { step: "compiling" }, cancel: { kind: "refused", words: refusal } });
  });
});
