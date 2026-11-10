import { startTheCoreView } from "../shared/core_view_page";
import { OutlinerView } from "./outliner_view";

startTheCoreView((connection) => <OutlinerView connection={connection} />);
