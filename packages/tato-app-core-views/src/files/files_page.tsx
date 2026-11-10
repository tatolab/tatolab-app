import { startTheCoreView } from "../shared/core_view_page";
import { FilesView } from "./files_view";

startTheCoreView((connection) => <FilesView connection={connection} />);
