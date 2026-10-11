// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

//! The app's one controller: it owns the "Run Tatolab" switch, the machine setup, and the local
//! API client, and composes the [`TatolabStatus`] the frontend and the tray show. Everything here
//! may block on the service manager, the filesystem, the socket or the administrator prompt, so
//! callers run it off the main thread.

use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use crate::local_api_client::LocalApiClient;
use crate::macos::machine_setup::{
    command_line_tool_linked_at, missing_machine_setup_pieces,
    prepare_local_proof_test_machine_root, run_machine_setup_behind_one_administrator_prompt,
};
use crate::macos::service_management_runtime_launch_agent::ServiceManagementRuntimeLaunchAgent;
use crate::macos::tatolab_machine_paths::{
    bundled_command_line_tool_path, current_process_uid, TatolabMachinePaths,
};
use crate::run_tatolab_preference::RunTatolabPreferenceFile;
use crate::run_tatolab_switch::{RunTatolabReconciliation, RunTatolabSwitch};
use crate::tatolab_status::{
    derive_runtime_status, CommandLineToolStatus, MachineSetupState, MachineSetupStatus,
    MachineStatus, RuntimeHealthObservation, RuntimeState, TatolabStatus,
};

/// How long one local API request may take before the runtime reads as not answering.
const LOCAL_API_REQUEST_TIMEOUT: Duration = Duration::from_secs(3);

/// The switch, the machine's paths, and what the controller remembers between status rounds.
pub struct TatolabAppController {
    run_tatolab_switch: Mutex<RunTatolabSwitch>,
    machine_paths: TatolabMachinePaths,
    bundled_command_line_tool: Option<PathBuf>,
    local_api_client: LocalApiClient,
    machine_name_of_the_running_runtime: Mutex<Option<String>>,
}

impl TatolabAppController {
    /// The controller for this build, remembering the switch in `app_config_directory`, as the
    /// app launches at `app_launched_at`.
    pub fn for_this_build(app_config_directory: &Path, app_launched_at: Instant) -> Self {
        let machine_paths = TatolabMachinePaths::for_this_build(current_process_uid());
        let bundled_command_line_tool = bundled_command_line_tool_path();
        tracing::info!(
            local_api_socket = %machine_paths.local_api_socket.display(),
            machine_runtime_lock = %machine_paths.machine_runtime_lock_file.display(),
            bundled_command_line_tool = ?bundled_command_line_tool,
            local_proof_test_machine_root = ?machine_paths.local_proof_test_machine_root,
            "Tatolab app paths"
        );
        Self {
            run_tatolab_switch: Mutex::new(RunTatolabSwitch::load(
                Box::new(ServiceManagementRuntimeLaunchAgent::for_the_bundled_runtime()),
                RunTatolabPreferenceFile::in_app_config_directory(app_config_directory),
                app_launched_at,
            )),
            local_api_client: LocalApiClient::new(
                &machine_paths.local_api_socket,
                LOCAL_API_REQUEST_TIMEOUT,
            ),
            machine_paths,
            bundled_command_line_tool,
            machine_name_of_the_running_runtime: Mutex::new(None),
        }
    }

    fn lock_the_switch(&self) -> std::sync::MutexGuard<'_, RunTatolabSwitch> {
        self.run_tatolab_switch
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
    }

    fn machine_setup_is_complete(&self) -> bool {
        missing_machine_setup_pieces(
            &self.machine_paths,
            self.bundled_command_line_tool.as_deref(),
        )
        .is_empty()
    }

    /// A local-proof build prepares its test root by itself, with no prompt.
    fn prepare_a_local_proof_test_root_if_this_build_uses_one(&self) {
        if self.machine_paths.local_proof_test_machine_root.is_none() {
            return;
        }
        if let Err(failure) = prepare_local_proof_test_machine_root(&self.machine_paths) {
            tracing::error!(%failure, "the local-proof machine root could not be prepared");
        }
    }

    /// What opening the app does: a local-proof build prepares its test root, then the switch
    /// registers the agent when it is on and the machine is set up.
    pub fn reconcile_on_app_opened(&self) -> RunTatolabReconciliation {
        self.prepare_a_local_proof_test_root_if_this_build_uses_one();
        let machine_setup_complete = self.machine_setup_is_complete();
        let reconciliation = self
            .lock_the_switch()
            .reconcile_on_app_opened(machine_setup_complete, Instant::now());
        tracing::info!(?reconciliation, "reconciled Run Tatolab on app open");
        reconciliation
    }

    /// Turn the switch on or off and remember it.
    pub fn set_run_tatolab(&self, run_tatolab: bool) -> RunTatolabReconciliation {
        let machine_setup_complete = self.machine_setup_is_complete();
        let reconciliation = self.lock_the_switch().set_run_tatolab(
            run_tatolab,
            machine_setup_complete,
            Instant::now(),
        );
        tracing::info!(run_tatolab, ?reconciliation, "Run Tatolab switched");
        reconciliation
    }

    /// Whether the switch is on.
    pub fn run_tatolab(&self) -> bool {
        self.lock_the_switch().run_tatolab()
    }

    /// Open System Settings at Login Items.
    pub fn open_login_items_settings(&self) {
        self.lock_the_switch().open_login_items_settings();
    }

    /// Create whatever machine setup is missing — behind the one administrator prompt in a real
    /// build, with no prompt in a local-proof build — then register the agent if the switch is on.
    pub fn run_first_launch_machine_setup(&self) -> Result<(), String> {
        if self.machine_paths.local_proof_test_machine_root.is_some() {
            prepare_local_proof_test_machine_root(&self.machine_paths)?;
        } else {
            let missing = missing_machine_setup_pieces(
                &self.machine_paths,
                self.bundled_command_line_tool.as_deref(),
            );
            run_machine_setup_behind_one_administrator_prompt(&missing)?;
        }
        self.reconcile_on_app_opened();
        Ok(())
    }

    /// Observe everything once and compose the status, as of `now`.
    pub fn compose_status(&self, now: Instant) -> TatolabStatus {
        let missing_setup = missing_machine_setup_pieces(
            &self.machine_paths,
            self.bundled_command_line_tool.as_deref(),
        );
        let (run_tatolab, runtime_agent) = {
            let mut switch = self.lock_the_switch();
            let runtime_agent = switch.runtime_agent_registration_status();
            switch.notice_runtime_agent_registration_status(runtime_agent);
            (switch.run_tatolab(), runtime_agent)
        };

        let runtime_health = match self.local_api_client.check_health() {
            Ok(()) => RuntimeHealthObservation::Healthy,
            Err(failure) => RuntimeHealthObservation::Failing {
                failure_description: failure.failure_description,
            },
        };
        let (streams, machine_name) = if runtime_health == RuntimeHealthObservation::Healthy {
            (
                self.listed_streams(),
                self.machine_name_of_the_running_runtime(),
            )
        } else {
            *self.lock_the_machine_name() = None;
            (Vec::new(), None)
        };

        let (mut runtime, last_registration_failure) = {
            let mut switch = self.lock_the_switch();
            if runtime_health == RuntimeHealthObservation::Healthy {
                switch.note_runtime_healthy(now);
            }
            let runtime = derive_runtime_status(
                run_tatolab,
                runtime_agent,
                &runtime_health,
                switch.time_since_the_runtime_was_expected_up(now),
            );
            (
                runtime,
                switch.last_registration_failure().map(str::to_string),
            )
        };
        if runtime.state == RuntimeState::Stopped && run_tatolab {
            if let Some(registration_failure) = last_registration_failure {
                runtime.detail = Some(format!(
                    "the runtime's launch agent could not be registered: {registration_failure}"
                ));
            }
        }

        TatolabStatus {
            app_version: env!("CARGO_PKG_VERSION").to_string(),
            run_tatolab,
            runtime_agent,
            runtime,
            machine: MachineStatus { name: machine_name },
            streams,
            machine_setup: MachineSetupStatus {
                state: if missing_setup.is_empty() {
                    MachineSetupState::Complete
                } else {
                    MachineSetupState::NeedsAdministrator
                },
                missing: missing_setup
                    .iter()
                    .map(|piece| piece.path().display().to_string())
                    .collect(),
            },
            cli: CommandLineToolStatus {
                linked_at: command_line_tool_linked_at(
                    &self.machine_paths,
                    self.bundled_command_line_tool.as_deref(),
                )
                .map(|link_path| link_path.display().to_string()),
            },
        }
    }

    fn listed_streams(&self) -> Vec<crate::tatolab_status::ListedStream> {
        self.local_api_client
            .list_streams()
            .unwrap_or_else(|failure| {
                tracing::warn!(%failure, "the runtime's streams could not be listed");
                Vec::new()
            })
    }

    fn lock_the_machine_name(&self) -> std::sync::MutexGuard<'_, Option<String>> {
        self.machine_name_of_the_running_runtime
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
    }

    /// The running runtime's machine name, asked once per runtime it sees come up.
    fn machine_name_of_the_running_runtime(&self) -> Option<String> {
        if let Some(machine_name) = self.lock_the_machine_name().clone() {
            return Some(machine_name);
        }
        match self.local_api_client.machine_name() {
            Ok(machine_name) => {
                *self.lock_the_machine_name() = Some(machine_name.clone());
                Some(machine_name)
            }
            Err(failure) => {
                tracing::warn!(%failure, "the runtime's machine name could not be read");
                None
            }
        }
    }
}
