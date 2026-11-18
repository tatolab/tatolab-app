import { useState } from "react";
import type { TatolabAppUpdateState } from "../../shared/tatolab_backend_contract";
import { describeBackendRejection, type TatolabBackend } from "../backend/tatolab_backend";
import { presentTatolabAppUpdateAction } from "../presentation/app_update_presentation";

/** A refusal shown under what was refused: the window's lead naming it, then the refusing side's own words. */
export type BackendActionRefusal = { lead: string; words: string };

/** An action run through the backend from a button: pending while it runs, and its refusal, led by `refusalLead`, once refused. */
export function useActionThroughTheBackend(runTheAction: () => Promise<void>, refusalLead: string) {
  const [isPending, setIsPending] = useState(false);
  const [refusal, setRefusal] = useState<BackendActionRefusal | null>(null);
  const run = () => {
    setRefusal(null);
    setIsPending(true);
    runTheAction()
      .catch((rejection: unknown) => setRefusal({ lead: refusalLead, words: describeBackendRejection(rejection) }))
      .finally(() => setIsPending(false));
  };
  return { isPending, refusal, run };
}

/** The updates control for `appUpdate` run through `backend`: check for a newer Tato Studio, or take the one found or staged; `action` is `null` in an app that cannot update itself. */
export function useTatolabAppUpdateAction(backend: Pick<TatolabBackend, "checkForTatolabAppUpdates" | "takeTheNewerTatolabAppVersion">, appUpdate: TatolabAppUpdateState) {
  const action = presentTatolabAppUpdateAction(appUpdate);
  const runTheAction = useActionThroughTheBackend(
    () => (action?.command === "take_the_newer_version" ? backend.takeTheNewerTatolabAppVersion() : backend.checkForTatolabAppUpdates()),
    "Couldn't update Tato Studio:",
  );
  return { action, ...runTheAction };
}
