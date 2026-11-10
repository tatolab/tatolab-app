import { startTheCoreView } from "../shared/core_view_page";
import { HistoryView } from "./history_view";

startTheCoreView((connection) => <HistoryView connection={connection} />);
