import { startTheCoreView } from "../shared/core_view_page";
import { ViewerView } from "./viewer_view";

startTheCoreView((connection) => <ViewerView connection={connection} />);
