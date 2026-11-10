import { startTheCoreView } from "../shared/core_view_page";
import { TransactionsView } from "./transactions_view";

startTheCoreView((connection) => <TransactionsView connection={connection} />);
