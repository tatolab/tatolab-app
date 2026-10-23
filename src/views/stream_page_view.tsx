// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { useEffect, useMemo } from "react";
import { Navigate } from "react-router";
import type { ListedStream } from "../backend/tatolab_backend_contract";
import { isStreamLoaded } from "../presentation/stream_presentation";
import { useStreamActionsUnderWay, useStreamRemovalDialog } from "./stream_action_controls";
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
  const thisStreamsListing = useMemo(() => [stream], [stream]);
  const { actionsUnderWay, outcomeWords, runStreamAction } = useStreamActionsUnderWay(thisStreamsListing);
  const { askToRemove, removalDialog } = useStreamRemovalDialog((streamToRemove) => runStreamAction("remove_stream", "Remove", streamToRemove));
  const streamPageActions: StreamPageActions = {
    actionUnderWay: actionsUnderWay.get(stream.name),
    outcome: outcomeWords.get(stream.name),
    runPrimaryAction: (chosenAction) => runStreamAction(chosenAction.streamAction, chosenAction.label, stream),
    askToRemove: () => askToRemove(stream),
  };

  useEffect(() => {
    hostedPages.streamsPage.chooseStream(stream.name);
  }, [hostedPages, stream]);
  useEffect(() => {
    streamGraphReadings.showStream(stream.name, isLoaded);
  }, [streamGraphReadings, stream.name, isLoaded]);
  useEffect(() => () => streamGraphReadings.showStream(null, false), [streamGraphReadings]);
  useEffect(() => {
    streamLogReadings.showStream(stream.name, isLoaded);
  }, [streamLogReadings, stream.name, isLoaded]);
  useEffect(() => () => streamLogReadings.showStream(null, false), [streamLogReadings]);

  if (shownTab === "graph" && !isLoaded) return <Navigate to={streamPagePath(stream.name)} replace />;
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-stream-page={stream.name}>
      <StreamPageHeaderView stream={stream} shownTab={shownTab} streamPageActions={streamPageActions} />
      {shownTab === "graph" && <StreamGraphPageView stream={stream} />}
      {shownTab === "logs" && <StreamLogsPageView stream={stream} streamPageActions={streamPageActions} />}
      {shownTab === "overview" && <StreamOverviewPageView stream={stream} streamPageActions={streamPageActions} />}
      {shownTab === "inspect" && <StreamInspectPageView stream={stream} />}
      {removalDialog}
    </div>
  );
}
