import { describe, expect, it } from "vitest";
import type { RuntimeOfAnotherAge } from "../../shared/tatolab_backend_contract";
import { presentRuntimeOfAnotherAge, runtimeOfAnotherAgeShownFor } from "./runtime_of_another_age_presentation";

const AN_OLDER_RUNTIME_THE_APP_DID_NOT_START: RuntimeOfAnotherAge = {
  older_side: "runtime",
  runtime_version: "0.68.90",
  runtime_contract: { version: 3, revision: 0 },
  studio_contract: { version: 3, revision: 1 },
  remedy: "quit_the_running_runtime",
};

const A_NEWER_RUNTIME: RuntimeOfAnotherAge = {
  older_side: "studio",
  runtime_version: "0.80.0",
  runtime_contract: { version: 4, revision: 0 },
  studio_contract: { version: 3, revision: 1 },
  remedy: "update_studio",
};

describe("presentRuntimeOfAnotherAge", () => {
  it("names an older runtime, its release and both contracts, and asks for it to be quit so the carried one starts", () => {
    expect(presentRuntimeOfAnotherAge(AN_OLDER_RUNTIME_THE_APP_DID_NOT_START)).toEqual({
      title: "The runtime is older than this Studio",
      explanation: "tatolabd 0.68.90 serves control contract 3, revision 0; this Studio needs contract 3, revision 1. Your projects are untouched.",
      remedy: "Quit the tatolabd that is running. Tato Studio didn't start it, so it leaves it alone; once it has quit, Tato Studio starts the one it carries.",
      offersTheStudioUpdate: false,
      statusBar: "tatolabd 0.68.90 · older than this Studio",
    });
  });

  it("names this Studio the older side and offers its update", () => {
    expect(presentRuntimeOfAnotherAge(A_NEWER_RUNTIME)).toEqual({
      title: "This Studio is older than the runtime",
      explanation: "tatolabd 0.80.0 serves control contract 4, revision 0; this Studio was built for contract 3, revision 1. Your projects are untouched.",
      remedy: "Update Tato Studio.",
      offersTheStudioUpdate: true,
      statusBar: "tatolabd 0.80.0 · newer than this Studio",
    });
  });

  it("asks for the Studio's update when the older runtime is the one it carries and started, and for the runtime's when it carries none", () => {
    const started = presentRuntimeOfAnotherAge({ ...AN_OLDER_RUNTIME_THE_APP_DID_NOT_START, remedy: "update_studio" });
    expect(started.remedy).toBe("Update Tato Studio: the runtime it carries and started is the older one.");
    expect(started.offersTheStudioUpdate).toBe(true);

    const uncarried = presentRuntimeOfAnotherAge({ ...AN_OLDER_RUNTIME_THE_APP_DID_NOT_START, remedy: "update_the_runtime" });
    expect(uncarried.remedy).toBe("Update the tatolabd that is running. This build of Tato Studio carries no runtime of its own.");
    expect(uncarried.offersTheStudioUpdate).toBe(false);
  });
});

describe("runtimeOfAnotherAgeShownFor", () => {
  it("shows a runtime of another age only while it runs", () => {
    expect(runtimeOfAnotherAgeShownFor({ runtime_state: "running", runtime_of_another_age: A_NEWER_RUNTIME })).toBe(A_NEWER_RUNTIME);
    expect(runtimeOfAnotherAgeShownFor({ runtime_state: "starting", runtime_of_another_age: A_NEWER_RUNTIME })).toBeNull();
    expect(runtimeOfAnotherAgeShownFor({ runtime_state: "running", runtime_of_another_age: null })).toBeNull();
  });
});
