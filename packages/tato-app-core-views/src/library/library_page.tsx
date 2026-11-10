import { startTheCoreView } from "../shared/core_view_page";
import { LibraryView } from "./library_view";

startTheCoreView((connection) => <LibraryView connection={connection} />);
