import { useState } from "react";
import { ConfirmationDialog } from "@tatolab/tato-app-view-sdk/design_system/confirmation_dialog";
import { describeBackendRejection } from "../backend/tatolab_backend";
import type { TatolabAppUpdateAnnouncement, TatolabAppUpdateAnnouncementAnswer } from "../../shared/tatolab_backend_contract";
import { presentTatolabAppUpdateAnnouncement } from "../presentation/app_update_presentation";
import { useTatolabStatus, useTatolabWindowEnvironment } from "../setup_and_preferences/tatolab_window_context";

/** Which announcement this is, the same across the statuses that carry it. */
function announcementKey(announcement: TatolabAppUpdateAnnouncement): string {
  return `${announcement.kind} ${announcement.version}`;
}

/** The update the app announces over the window: a downloaded version ready to install, or the version the app was just updated to. */
export function AppUpdateAnnouncementDialogView({
  onUpdateInstallChosen,
  onAnswerRefused,
}: {
  onUpdateInstallChosen: () => void;
  onAnswerRefused: (because: string) => void;
}) {
  const { backend } = useTatolabWindowEnvironment();
  const announcementInTheStatus = useTatolabStatus().app_update_announcement;
  const [announcementInTheDialog, setAnnouncementInTheDialog] = useState<TatolabAppUpdateAnnouncement | null>(null);
  const [keyOfTheAnswered, setKeyOfTheAnswered] = useState<string | null>(null);
  const shownAnnouncement = announcementInTheStatus !== null && announcementKey(announcementInTheStatus) !== keyOfTheAnswered ? announcementInTheStatus : null;
  if (shownAnnouncement !== null && (announcementInTheDialog === null || announcementKey(shownAnnouncement) !== announcementKey(announcementInTheDialog))) {
    setAnnouncementInTheDialog(shownAnnouncement);
  }

  const answer = (answerGiven: TatolabAppUpdateAnnouncementAnswer) => {
    if (shownAnnouncement === null) return;
    setKeyOfTheAnswered(announcementKey(shownAnnouncement));
    if (answerGiven === "take_its_action" && shownAnnouncement.kind === "update_ready") onUpdateInstallChosen();
    backend
      .answerTheAppUpdateAnnouncement(shownAnnouncement.kind, shownAnnouncement.version, answerGiven)
      .catch((rejection: unknown) => onAnswerRefused(describeBackendRejection(rejection)));
  };

  return (
    <ConfirmationDialog
      key={announcementInTheDialog === null ? "none" : announcementKey(announcementInTheDialog)}
      isOpen={shownAnnouncement !== null}
      onOpenChange={(isOpen) => {
        if (!isOpen) answer("dismiss");
      }}
      onClosedCompletely={() => setAnnouncementInTheDialog(null)}
      question={announcementInTheDialog === null ? null : presentTatolabAppUpdateAnnouncement(announcementInTheDialog)}
      onConfirmed={() => answer("take_its_action")}
      data-app-update-announcement={announcementInTheDialog?.kind}
    />
  );
}
