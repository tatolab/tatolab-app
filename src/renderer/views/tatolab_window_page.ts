// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import type { TatolabStatus } from "../../shared/tatolab_backend_contract";

/** A DOM page of the main window, hosted by a React route while it is shown: built once, then updated in place on every status it reads. */
export interface TatolabWindowPage {
  readonly element: HTMLElement;
  showStatus?(status: TatolabStatus): void;
  /** Told when the page is shown or hidden, for a page that polls while it shows. */
  setPageShown?(isShown: boolean): void;
}
