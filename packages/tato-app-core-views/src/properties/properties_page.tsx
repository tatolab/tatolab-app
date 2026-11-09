import { startTheCoreView } from "../shared/core_view_page";
import { PropertiesView } from "./properties_view";

startTheCoreView((connection) => <PropertiesView connection={connection} />);
