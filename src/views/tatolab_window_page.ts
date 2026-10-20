// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import type { TatolabStatus } from "../backend/tatolab_backend_contract";

/** A page of the main window: built once, then updated in place on every status. */
export interface TatolabWindowPage {
  readonly element: HTMLElement;
  showStatus(status: TatolabStatus): void;
  /** Told when the page is shown or hidden, for a page that polls while it shows. */
  setPageShown?(isShown: boolean): void;
}
