import { cn } from "cn";
import { ActionButton } from "@tatolab/tato-app-view-sdk/design_system/action_button";
import { RefusalLine } from "@tatolab/tato-app-view-sdk/design_system/refusal_line";
import { TriangleAlert } from "lucide-react";
import type { RuntimeOfAnotherAge } from "../../shared/tatolab_backend_contract";
import { presentTatolabAppUpdate } from "../presentation/app_update_presentation";
import { presentRuntimeOfAnotherAge } from "../presentation/runtime_of_another_age_presentation";
import { useTatolabAppUpdateAction } from "./action_through_the_backend";
import { useTatolabStatus, useTatolabWindowEnvironment } from "./tatolab_window_context";

/**
 * The one notice of a runtime that refused this Studio's control contract, as the status bar's panel and Settings' Runtime show
 * it: the older side, the facts the runtime's record states, and the remedy, with the app's own updates control, and the
 * updater's last failure, when the remedy is updating Tato Studio. `className` sets its outer spacing.
 */
export function RuntimeOfAnotherAgeNotice({ runtimeOfAnotherAge, className }: { runtimeOfAnotherAge: RuntimeOfAnotherAge; className?: string }) {
  const { backend } = useTatolabWindowEnvironment();
  const status = useTatolabStatus();
  const words = presentRuntimeOfAnotherAge(runtimeOfAnotherAge);
  const appUpdateAction = useTatolabAppUpdateAction(backend, status.app_update);
  const updaterFailure = presentTatolabAppUpdate(status.app_update).failure;
  const updateRefusal: { lead?: string; words: string } | null = appUpdateAction.refusal ?? (updaterFailure === null ? null : { words: updaterFailure });
  return (
    <div className={cn("flex max-w-[640px] flex-col gap-1 text-xs", className)} data-runtime-of-another-age={runtimeOfAnotherAge.older_side}>
      <span role="status" className="flex items-center gap-1.5 font-medium text-fg">
        <TriangleAlert className="size-3.5 shrink-0 text-warn" strokeWidth={1.75} aria-hidden />
        {words.title}
      </span>
      <span className="text-fg-2 select-text" data-runtime-of-another-age-facts="">
        {words.explanation}
      </span>
      <span className="text-fg-2" data-runtime-of-another-age-remedy={runtimeOfAnotherAge.remedy}>
        {words.remedy}
      </span>
      {words.offersTheStudioUpdate && appUpdateAction.action !== null && (
        <div className="pt-1">
          <ActionButton
            size="small"
            isDisabled={!appUpdateAction.action.isEnabled || appUpdateAction.isPending}
            onPressed={appUpdateAction.run}
            data-runtime-of-another-age-action="update_studio"
          >
            {appUpdateAction.action.label}
          </ActionButton>
        </div>
      )}
      {words.offersTheStudioUpdate && updateRefusal !== null && <RefusalLine {...updateRefusal} />}
    </div>
  );
}
