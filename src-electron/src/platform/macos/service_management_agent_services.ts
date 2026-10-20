// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import type { Result } from "../../result.js";

/** An `SMAppService` status as Electron's `app.getLoginItemSettings` spells it. */
export type ServiceManagementAgentServiceStatus = "enabled" | "requires-approval" | "not-registered" | "not-found";

/** Service Management's agent services, as Electron's login item API reaches them; a test's fake stands in for it. */
export interface ServiceManagementAgentServices {
  /** The agent service's status; `null` when Service Management answers none. */
  agentServiceStatus(agentPlistName: string): ServiceManagementAgentServiceStatus | null;
  /** Ask Service Management to register (`true`) or unregister (`false`) the agent service; refused only when the request could not be made, since Electron answers nothing of whether Service Management did it. */
  requestAgentServiceRegistered(agentPlistName: string, agentServiceRegistered: boolean): Result<void, string>;
  /** Open System Settings at Login Items. */
  openSystemSettingsLoginItems(): Promise<Result<void, string>>;
}
