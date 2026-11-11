import { useState } from "react";
import { NoticeDialog } from "@tatolab/tato-app-view-sdk/design_system/notice_dialog";
import type { StudioWarningKind } from "../../shared/tatolab_backend_contract";
import { describeBackendRejection } from "../backend/tatolab_backend";
import { presentStudioWarning, studioWarningWhoseDialogIsDue } from "../presentation/studio_warnings_presentation";
import { useTatolabStatus, useTatolabWindowEnvironment } from "../setup_and_settings/tatolab_window_context";

/** The dialog of a warning that holds, shown the first time the app opens while it holds; acknowledging it in one window closes it in every window. */
export function StudioWarningDialogView({ onDismissRefused }: { onDismissRefused: (because: string) => void }) {
  const { backend } = useTatolabWindowEnvironment();
  const warningWhoseDialogIsDue = studioWarningWhoseDialogIsDue(useTatolabStatus().studio_warnings);
  const [kindAcknowledged, setKindAcknowledged] = useState<StudioWarningKind | null>(null);
  const [kindInTheDialog, setKindInTheDialog] = useState<StudioWarningKind | null>(null);
  const shownKind = warningWhoseDialogIsDue !== null && warningWhoseDialogIsDue.kind !== kindAcknowledged ? warningWhoseDialogIsDue.kind : null;
  if (shownKind !== null && shownKind !== kindInTheDialog) setKindInTheDialog(shownKind);

  const acknowledge = () => {
    if (shownKind === null) return;
    setKindAcknowledged(shownKind);
    backend.dismissTheStudioWarningDialog(shownKind).catch((rejection: unknown) => onDismissRefused(describeBackendRejection(rejection)));
  };

  const wordsInTheDialog = kindInTheDialog === null ? null : presentStudioWarning(kindInTheDialog);
  return (
    <NoticeDialog
      isOpen={shownKind !== null}
      onAcknowledged={acknowledge}
      onClosedCompletely={() => setKindInTheDialog(null)}
      notice={wordsInTheDialog === null ? null : { ...wordsInTheDialog, acknowledgeWords: "OK" }}
      data-studio-warning-dialog={kindInTheDialog ?? undefined}
    />
  );
}
