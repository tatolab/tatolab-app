import { startTheCoreView } from "../shared/core_view_page";
import { CodeView } from "./code_view";

startTheCoreView((connection) => <CodeView connection={connection} />);
