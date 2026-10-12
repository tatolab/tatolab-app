// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

//! The commands the window's frontend invokes. A request that changes the machine runs on its own
//! named thread, as the tray's choices do, and its outcome reaches the window as the next
//! `tatolab-status-changed`. A question the window awaits is answered on Tauri's blocking pool, so
//! neither the main thread nor the async runtime ever blocks on the runtime or the service
//! manager, and a question the window asks often starts no thread.

use std::sync::Arc;
use std::time::Duration;

use tauri::{AppHandle, State};

use crate::platform;
use crate::stream_graph_summary::StreamGraphSummary;
use crate::stream_log_records_page::StreamLogRecordsPage;
use crate::tatolab_app_shared_state::{
    quit_the_tatolab_app, run_off_the_main_thread_with_the_controller, set_up_tatolab_on_request,
    TatolabAppSharedState,
};
use crate::tatolab_status::TatolabStatus;

/// How long `get_tatolab_status` waits for the poller's first round when the window asks first.
const FIRST_STATUS_ROUND_WAIT_LIMIT: Duration = Duration::from_secs(15);

/// `blocking_work`'s answer to the command `command_name`, worked out on Tauri's blocking pool.
async fn answer_on_the_blocking_pool<Answer: Send + 'static>(
    command_name: &str,
    blocking_work: impl FnOnce() -> Result<Answer, String> + Send + 'static,
) -> Result<Answer, String> {
    tauri::async_runtime::spawn_blocking(blocking_work)
        .await
        .unwrap_or_else(|join_failure| {
            Err(format!(
                "{command_name} ended without an answer: {join_failure}"
            ))
        })
}

/// The status as of the poller's last round.
#[tauri::command(rename_all = "snake_case")]
pub async fn get_tatolab_status(
    shared_state: State<'_, TatolabAppSharedState>,
) -> Result<TatolabStatus, String> {
    let status_publisher = Arc::clone(&shared_state.status_publisher);
    answer_on_the_blocking_pool("get_tatolab_status", move || {
        status_publisher
            .last_published_status_waiting_up_to(FIRST_STATUS_ROUND_WAIT_LIMIT)
            .ok_or_else(|| "Tatolab has not observed the runtime yet".to_string())
    })
    .await
}

/// Turn "Run Tatolab" on or off.
#[tauri::command(rename_all = "snake_case")]
pub fn set_run_tatolab(app: AppHandle, enabled: bool) {
    run_off_the_main_thread_with_the_controller(
        &app,
        "tatolab-run-tatolab-set",
        move |controller, status_publisher| {
            controller.set_run_tatolab(enabled);
            status_publisher.request_refresh();
        },
    );
}

/// Open System Settings at Login Items, where a user approves the runtime's login item; refused
/// where the platform has no Login Items.
#[tauri::command(rename_all = "snake_case")]
pub async fn open_login_items_settings(
    shared_state: State<'_, TatolabAppSharedState>,
) -> Result<(), String> {
    let controller = Arc::clone(&shared_state.controller);
    answer_on_the_blocking_pool("open_login_items_settings", move || {
        controller.open_login_items_settings()
    })
    .await
}

/// "Set Up Tatolab…": the one administrator prompt, as the tray's item shows it; refused where the
/// platform has no machine setup.
#[tauri::command(rename_all = "snake_case")]
pub fn set_up_tatolab(app: AppHandle) -> Result<(), String> {
    set_up_tatolab_on_request(&app)
}

/// "Uninstall Tatolab…": on macOS the uninstall, which ends with the app quitting; refused with
/// the reason when the administrator prompt is cancelled or a step fails, and on Linux, where the
/// installer uninstalls, with a pointer to the window's own steps.
#[tauri::command(rename_all = "snake_case")]
pub async fn uninstall_tatolab(
    app: AppHandle,
    shared_state: State<'_, TatolabAppSharedState>,
) -> Result<(), String> {
    let controller = Arc::clone(&shared_state.controller);
    answer_on_the_blocking_pool("uninstall_tatolab", move || {
        platform::uninstall_tatolab(&app, &controller)
    })
    .await
}

/// Quit the app; the runtime keeps running.
#[tauri::command(rename_all = "snake_case")]
pub fn quit_tatolab_app(app: AppHandle) {
    quit_the_tatolab_app(&app);
}

/// `stream`'s log records numbered after `after`; refused in the runtime's own words.
#[tauri::command(rename_all = "snake_case")]
pub async fn read_stream_log_records(
    shared_state: State<'_, TatolabAppSharedState>,
    stream: String,
    after: u64,
) -> Result<StreamLogRecordsPage, String> {
    let controller = Arc::clone(&shared_state.controller);
    answer_on_the_blocking_pool("read_stream_log_records", move || {
        controller
            .read_stream_log_records(&stream, after)
            .map_err(String::from)
    })
    .await
}

/// The graph of the loaded stream `stream`; refused in the runtime's own words.
#[tauri::command(rename_all = "snake_case")]
pub async fn describe_stream_graph(
    shared_state: State<'_, TatolabAppSharedState>,
    stream: String,
) -> Result<StreamGraphSummary, String> {
    let controller = Arc::clone(&shared_state.controller);
    answer_on_the_blocking_pool("describe_stream_graph", move || {
        controller
            .describe_stream_graph(&stream)
            .map_err(String::from)
    })
    .await
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use super::*;
    use crate::stream_graph_summary::{StreamGraphExposedPort, StreamGraphLink, StreamGraphNode};
    use crate::stream_log_records_page::StreamLogRecord;
    use crate::tatolab_status::{
        ListedStream, MachineSetupState, RuntimeAgentRegistrationStatus, RuntimeState,
        TatolabPlatform,
    };

    fn status_with(
        runtime_agent: RuntimeAgentRegistrationStatus,
        runtime_state: RuntimeState,
        machine_setup_state: MachineSetupState,
    ) -> TatolabStatus {
        TatolabStatus {
            app_version: "0.45.0".to_string(),
            platform: TatolabPlatform::Macos,
            run_tatolab: true,
            runtime_agent,
            runtime_state,
            machine_name: Some("jonathanf-macbook".to_string()),
            streams: Some(vec![ListedStream {
                name: "main".to_string(),
                state: "kept".to_string(),
                project_directory: "/private/tmp/x/pattern".to_string(),
                node_count: Some(4),
                failed_because: None,
            }]),
            machine_setup_state,
            command_line_tool_linked_at: Some("/usr/local/bin/tatolab".to_string()),
        }
    }

    #[test]
    fn an_awaited_command_answers_with_its_works_answer_or_why_it_has_none() {
        assert_eq!(
            tauri::async_runtime::block_on(answer_on_the_blocking_pool(
                "read_stream_log_records",
                || Ok(7)
            )),
            Ok(7)
        );
        let refusal = tauri::async_runtime::block_on(answer_on_the_blocking_pool::<u32>(
            "describe_stream_graph",
            || panic!("the blocking work panicked"),
        ))
        .unwrap_err();
        assert!(
            refusal.starts_with("describe_stream_graph ended without an answer"),
            "{refusal}"
        );
    }

    /// The window's TypeScript types read exactly this JSON, key for key and in this order.
    #[test]
    fn the_status_a_log_page_and_a_graph_serialize_exactly_as_the_window_reads_them() {
        let status = status_with(
            RuntimeAgentRegistrationStatus::Enabled,
            RuntimeState::Running,
            MachineSetupState::Complete,
        );
        assert_eq!(
            serde_json::to_string(&status).unwrap(),
            concat!(
                r#"{"app_version":"0.45.0","platform":"macos","run_tatolab":true,"#,
                r#""runtime_agent":"enabled","runtime_state":"running","#,
                r#""machine_name":"jonathanf-macbook","streams":["#,
                r#"{"name":"main","state":"kept","project_directory":"/private/tmp/x/pattern","#,
                r#""node_count":4,"failed_because":null}],"machine_setup_state":"complete","#,
                r#""command_line_tool_linked_at":"/usr/local/bin/tatolab"}"#
            )
        );
        let status_of_a_runtime_that_is_down = TatolabStatus {
            machine_name: None,
            streams: None,
            command_line_tool_linked_at: None,
            ..status.clone()
        };
        assert_eq!(
            serde_json::to_string(&status_of_a_runtime_that_is_down).unwrap(),
            concat!(
                r#"{"app_version":"0.45.0","platform":"macos","run_tatolab":true,"#,
                r#""runtime_agent":"enabled","runtime_state":"running","machine_name":null,"#,
                r#""streams":null,"machine_setup_state":"complete","#,
                r#""command_line_tool_linked_at":null}"#
            )
        );
        for (platform, platform_on_the_wire) in [
            (TatolabPlatform::Macos, "macos"),
            (TatolabPlatform::Linux, "linux"),
        ] {
            assert_eq!(
                serde_json::to_value(platform).unwrap(),
                platform_on_the_wire
            );
        }
        for (runtime_agent, runtime_agent_on_the_wire) in [
            (RuntimeAgentRegistrationStatus::Enabled, "enabled"),
            (
                RuntimeAgentRegistrationStatus::RequiresApproval,
                "requires_approval",
            ),
            (
                RuntimeAgentRegistrationStatus::NotRegistered,
                "not_registered",
            ),
            (RuntimeAgentRegistrationStatus::NotFound, "not_found"),
        ] {
            assert_eq!(
                serde_json::to_value(runtime_agent).unwrap(),
                runtime_agent_on_the_wire
            );
        }
        for (runtime_state, runtime_state_on_the_wire) in [
            (RuntimeState::Running, "running"),
            (RuntimeState::Starting, "starting"),
            (RuntimeState::Stopped, "stopped"),
            (RuntimeState::Unreachable, "unreachable"),
        ] {
            assert_eq!(
                serde_json::to_value(runtime_state).unwrap(),
                runtime_state_on_the_wire
            );
        }
        for (machine_setup_state, machine_setup_state_on_the_wire) in [
            (MachineSetupState::Complete, "complete"),
            (MachineSetupState::NeedsAdministrator, "needs_administrator"),
            (
                MachineSetupState::WaitingForAdministrator,
                "waiting_for_administrator",
            ),
        ] {
            assert_eq!(
                serde_json::to_value(machine_setup_state).unwrap(),
                machine_setup_state_on_the_wire
            );
        }

        let page = StreamLogRecordsPage {
            stream: "main".to_string(),
            stream_instance: "4".to_string(),
            records: vec![
                StreamLogRecord {
                    sequence: 7,
                    host_ts_ns: Some(1791757115431254000),
                    level: Some("info".to_string()),
                    source: Some("rust".to_string()),
                    target: Some("streamlib_engine::core::runtime::loaded_stream".to_string()),
                    message: "Loading the stream `main`".to_string(),
                    attrs: BTreeMap::from([(
                        "processor_class_import_path".to_string(),
                        "nodes.x:X".to_string(),
                    )]),
                },
                StreamLogRecord {
                    sequence: 8,
                    host_ts_ns: None,
                    level: None,
                    source: None,
                    target: None,
                    message: String::new(),
                    attrs: BTreeMap::new(),
                },
            ],
            next_after: 8,
            records_no_longer_held: 0,
        };
        assert_eq!(
            serde_json::to_string(&page).unwrap(),
            concat!(
                r#"{"stream":"main","stream_instance":"4","records":["#,
                r#"{"sequence":7,"host_ts_ns":1791757115431254000,"level":"info","source":"rust","#,
                r#""target":"streamlib_engine::core::runtime::loaded_stream","#,
                r#""message":"Loading the stream `main`","#,
                r#""attrs":{"processor_class_import_path":"nodes.x:X"}},"#,
                r#"{"sequence":8,"host_ts_ns":null,"level":null,"source":null,"target":null,"#,
                r#""message":"","attrs":{}}],"next_after":8,"records_no_longer_held":0}"#
            )
        );

        let graph = StreamGraphSummary {
            stream: "main".to_string(),
            nodes: vec![
                StreamGraphNode {
                    name: "testpatternsource".to_string(),
                    node_type: "tatolab.stream:TestPatternSource".to_string(),
                    state: Some("Running".to_string()),
                },
                StreamGraphNode {
                    name: "invertingeffect".to_string(),
                    node_type: "nodes.inverting_effect:InvertingEffect".to_string(),
                    state: None,
                },
            ],
            links: vec![StreamGraphLink {
                source_node: "testpatternsource".to_string(),
                source_port: "video".to_string(),
                target_node: "invertingeffect".to_string(),
                target_port: "video_from_upstream".to_string(),
                state: "wired".to_string(),
            }],
            exposed: vec![StreamGraphExposedPort {
                node: "invertingeffect".to_string(),
                port: "video_to_downstream".to_string(),
                level: "private".to_string(),
            }],
        };
        assert_eq!(
            serde_json::to_string(&graph).unwrap(),
            concat!(
                r#"{"stream":"main","nodes":["#,
                r#"{"name":"testpatternsource","type":"tatolab.stream:TestPatternSource","state":"Running"},"#,
                r#"{"name":"invertingeffect","type":"nodes.inverting_effect:InvertingEffect","state":null}],"#,
                r#""links":[{"source_node":"testpatternsource","source_port":"video","#,
                r#""target_node":"invertingeffect","target_port":"video_from_upstream","state":"wired"}],"#,
                r#""exposed":[{"node":"invertingeffect","port":"video_to_downstream","level":"private"}]}"#
            )
        );
    }
}
