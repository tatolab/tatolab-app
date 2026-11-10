import { startTheCoreView } from "../shared/core_view_page";
import { ControlsView } from "./controls_view";

startTheCoreView((connection) => <ControlsView connection={connection} />);
