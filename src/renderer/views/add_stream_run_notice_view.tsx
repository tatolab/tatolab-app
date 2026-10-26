import { ActionButton } from "../design_system/action_button";
import { WindowNotice } from "../design_system/window_notice";
import { presentAddStreamRunNotice } from "../presentation/add_stream_flow";
import { useAddStreamRunNotice, useTatolabWindowEnvironment } from "./tatolab_window_context";

/** What a run that answered while the add-stream dialog was closed came to, over the bottom right of the window; View opens it on that run. */
export function AddStreamRunNoticeView() {
  const { addStreamFlow } = useTatolabWindowEnvironment();
  const runNotice = useAddStreamRunNotice();
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
          <ActionButton size="small" onPressed={() => addStreamFlow.openDialog(runNotice.source, true)} data-window-notice-action="view">
            View
          </ActionButton>
        }
        data-add-stream-run-notice={runNotice.kind}
      />
      )}
    </div>
  );
}
