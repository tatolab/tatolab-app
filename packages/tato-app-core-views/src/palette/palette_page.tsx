import { startTheCoreView } from "../shared/core_view_page";
import { PaletteView } from "./palette_view";

startTheCoreView((connection) => <PaletteView connection={connection} />);
