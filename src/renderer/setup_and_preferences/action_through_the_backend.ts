import { useState } from "react";
import { describeBackendRejection } from "../backend/tatolab_backend";

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
