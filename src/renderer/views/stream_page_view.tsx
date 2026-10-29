import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router";
import type { ListedStream } from "../../shared/tatolab_backend_contract";
import { PageFrame } from "../design_system/page_frame";
import { isStreamLoaded } from "../presentation/stream_presentation";
import { useStreamActionsUnderWay, useStreamRemovalDialog } from "./stream_action_controls";
import { useStreamRenameDialog } from "./stream_rename_dialog_view";
import { StreamGraphPageView } from "./stream_graph_page_view";
import { StreamInspectPageView } from "./stream_inspect_page_view";
import { StreamLogsPageView } from "./stream_logs_page_view";
import { StreamOverviewPageView } from "./stream_overview_page_view";
import { StreamPageHeaderView, type StreamPageActions } from "./stream_page_header_view";
import { streamPagePath, type StreamPageTab } from "./stream_page_path";
import { useTatolabWindowEnvironment } from "./tatolab_window_context";

/** One stream's page: its header and tabs over the tab shown, its graph and log read on every tab. */
export function StreamPageView({ stream, shownTab }: { stream: ListedStream; shownTab: StreamPageTab }) {
  const { hostedPages, streamGraphReadings, streamLogReadings } = useTatolabWindowEnvironment();
  const isLoaded = isStreamLoaded(stream);
  const [isOverviewDetailsPanelOpen, setIsOverviewDetailsPanelOpen] = useState(false);
  const thisStreamsListing = useMemo(() => [stream], [stream]);
  const { actionsUnderWay, outcomeWords, runStreamAction } = useStreamActionsUnderWay(thisStreamsListing);
  const { askToRemove, removalDialog } = useStreamRemovalDialog((streamToRemove) => runStreamAction("remove_stream", "Remove", streamToRemove));
  const { askToRename, renameDialog } = useStreamRenameDialog();
  const streamPageActions: StreamPageActions = {
    actionUnderWay: actionsUnderWay.get(stream.stream),
    outcome: outcomeWords.get(stream.stream),
    runPrimaryAction: (chosenAction) => runStreamAction(chosenAction.streamAction, chosenAction.label, stream),
    askToRemove: () => askToRemove(stream),
    askToRename: () => askToRename(stream),
  };

  useEffect(() => {
    hostedPages.streamsPage.chooseStream(stream.stream);
  }, [hostedPages, stream]);
  useEffect(() => {
    streamGraphReadings.showStream(stream.stream, isLoaded);
  }, [streamGraphReadings, stream.stream, isLoaded]);
  useEffect(() => () => streamGraphReadings.showStream(null, false), [streamGraphReadings]);
  useEffect(() => {
    streamLogReadings.showStream(stream.stream, isLoaded);
  }, [streamLogReadings, stream.stream, isLoaded]);
  useEffect(() => () => streamLogReadings.showStream(null, false), [streamLogReadings]);

  if (shownTab === "graph" && !isLoaded) return <Navigate to={streamPagePath(stream.stream)} replace />;
  return (
    <PageFrame
      header={
        <StreamPageHeaderView
          stream={stream}
          shownTab={shownTab}
          streamPageActions={streamPageActions}
          overviewDetailsPanel={{ isOpen: isOverviewDetailsPanelOpen, onToggled: setIsOverviewDetailsPanelOpen }}
        />
      }
      data-stream-page={stream.stream}
    >
      {shownTab === "graph" && <StreamGraphPageView stream={stream} />}
      {shownTab === "logs" && <StreamLogsPageView stream={stream} streamPageActions={streamPageActions} />}
      {shownTab === "overview" && (
        <StreamOverviewPageView
          stream={stream}
          streamPageActions={streamPageActions}
          isDetailsPanelOpen={isOverviewDetailsPanelOpen}
        />
      )}
      {shownTab === "inspect" && <StreamInspectPageView stream={stream} />}
      {removalDialog}
      {renameDialog}
    </PageFrame>
  );
}
