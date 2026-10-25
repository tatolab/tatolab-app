// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { useState } from "react";
import { describeBackendRejection, type TatolabBackend } from "../backend/tatolab_backend";
import type { RuntimeBannerAction } from "../presentation/runtime_presentation";

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

/** The command each action that brings the runtime back runs. */
export function runBannerAction(backend: TatolabBackend, action: RuntimeBannerAction): Promise<void> {
  switch (action) {
    case "turn_on_run_tatolab":
    case "retry_run_tatolab":
      return backend.setRunTatolab(true);
    case "open_login_items":
      return backend.openLoginItemsSettings();
    case "register_the_runtime_again":
      return backend.registerTheRuntimeAgain();
  }
}
