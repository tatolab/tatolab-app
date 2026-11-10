import { startTheCoreView } from "../shared/core_view_page";
import { StreamGraphView } from "./stream_graph_view";

startTheCoreView((connection) => <StreamGraphView connection={connection} />);
