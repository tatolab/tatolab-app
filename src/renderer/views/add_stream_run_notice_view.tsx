import { ActionButton } from "../design_system/action_button";
import { WindowNotice } from "../design_system/window_notice";
import { presentAddStreamRunNotice } from "../presentation/add_stream_flow";
import { useAddStreamRunNotice, useTatolabStatus, useTatolabWindowEnvironment } from "./tatolab_window_context";

/** Where a load followed while the add-project dialog is closed has got to, or what it came to, over the bottom right of the window; Cancel ends it early and View opens the dialog on it. */
export function AddStreamRunNoticeView() {
  const { addStreamFlow } = useTatolabWindowEnvironment();
  const status = useTatolabStatus();
  const runNotice = useAddStreamRunNotice();
  const presentation = runNotice === null ? null : presentAddStreamRunNotice(runNotice, status.streams);
  return (
    <div aria-live="polite" aria-atomic="true">
      {runNotice !== null && presentation !== null && (
        <WindowNotice
          tone={presentation.tone}
          title={presentation.title}
          detail={presentation.detail}
          onDismissed={() => addStreamFlow.dismissRunNotice()}
          actions={
            <>
              {presentation.isUnderWay && (
                <ActionButton size="small" isDisabled={!presentation.canCancel} onPressed={() => addStreamFlow.cancelTheLoad()} data-window-notice-action="cancel_the_load">
                  Cancel
                </ActionButton>
              )}
              <ActionButton size="small" onPressed={() => addStreamFlow.openDialog(runNotice.source, true)} data-window-notice-action="view">
                View
              </ActionButton>
            </>
          }
          data-add-stream-run-notice={runNotice.kind}
        />
      )}
    </div>
  );
}
