// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

//! The macOS half of the app: Service Management registers the runtime's launch agent, and
//! first-launch setup creates the machine runtime lock and the CLI's PATH link.

pub mod machine_setup;
pub mod service_management_runtime_launch_agent;
pub mod tatolab_machine_paths;
