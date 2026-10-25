// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { useNavigate } from "react-router";
import { ActionButton } from "../design_system/action_button";
import { WindowNotice } from "../design_system/window_notice";
import { presentAddStreamRunNotice } from "../presentation/add_stream_flow";
import { addStreamPagePath, OPENED_FROM_A_RUN_NOTICE } from "./add_stream_page_path";
import { useAddStreamRunNotice, useTatolabWindowEnvironment } from "./tatolab_window_context";

/** What a run that answered while the Add stream page was not shown came to, over the bottom right of the window; View returns to it. */
export function AddStreamRunNoticeView() {
  const { addStreamFlow } = useTatolabWindowEnvironment();
  const runNotice = useAddStreamRunNotice();
  const navigate = useNavigate();
  const presentation = runNotice === null ? null : presentAddStreamRunNotice(runNotice);
  return (
    <div aria-live="polite" aria-atomic="true">
      {runNotice !== null && presentation !== null && (
      <WindowNotice
        tone={presentation.tone}
        title={presentation.title}
        detail={presentation.detail}
        onDismissed={() => addStreamFlow.dismissRunNotice()}
        actions={
          <ActionButton size="small" onPressed={() => navigate(addStreamPagePath(runNotice.source), { state: OPENED_FROM_A_RUN_NOTICE })} data-window-notice-action="view">
            View
          </ActionButton>
        }
        data-add-stream-run-notice={runNotice.kind}
      />
      )}
    </div>
  );
}
