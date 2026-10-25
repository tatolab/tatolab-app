// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import type { Result } from "../../result.js";

/** An `SMAppService` status, spelled as the Service Management addon answers it. */
export type ServiceManagementAgentServiceStatus = "enabled" | "requires-approval" | "not-registered" | "not-found";

/** Service Management's `SMAppService` agent services, as the app's Service Management addon reaches them off the main thread; a test's fake stands in for it. */
export interface ServiceManagementAgentServices {
  /** The agent service's status; `null` when Service Management could not be asked. */
  agentServiceStatus(agentPlistName: string): Promise<ServiceManagementAgentServiceStatus | null>;
  /** Register the agent service; refused in Service Management's own words. */
  registerAgentService(agentPlistName: string): Promise<Result<void, string>>;
  /** Unregister the agent service; refused in Service Management's own words. */
  unregisterAgentService(agentPlistName: string): Promise<Result<void, string>>;
  /** Open System Settings at Login Items. */
  openSystemSettingsLoginItems(): Promise<Result<void, string>>;
}
