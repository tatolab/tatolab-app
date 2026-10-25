// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { WindowNotice } from "../design_system/window_notice";
import { presentFirstRunFinishingRefusal } from "../presentation/getting_started_presentation";
import { useFirstRunFinishingRefusalReason, useTatolabWindowEnvironment } from "./tatolab_window_context";

/** Why Get Started could not be remembered, over the bottom right of the window once first run is over, until dismissed. */
export function FirstRunFinishingRefusalNoticeView() {
  const { firstRunFinishingRefusal } = useTatolabWindowEnvironment();
  const refusalReason = useFirstRunFinishingRefusalReason();
  const presentation = refusalReason === null ? null : presentFirstRunFinishingRefusal(refusalReason);
  return (
    <div className="pointer-events-none absolute right-4 bottom-10 z-40" aria-live="assertive" aria-atomic="true">
      {presentation !== null && (
        <WindowNotice
          tone="failure"
          title={presentation.title}
          detail={presentation.detail}
          onDismissed={() => firstRunFinishingRefusal.showRefusalReason(null)}
          data-first-run-finishing-refusal=""
        />
      )}
    </div>
  );
}
