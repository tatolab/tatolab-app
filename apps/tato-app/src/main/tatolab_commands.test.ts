import { afterEach, expect, test } from "vitest";
import { controlOperationFailedResponse, httpResponse, controlOperationResultResponse } from "./fake_local_api_server.js";
import { failedWith, succeeded } from "./result.js";
import { streamGraphSummaryFromTheGraphToolResult } from "./stream_graph_summary.js";
import { projectLogRecordsPageFromTheLogsToolResult } from "./project_log_records_page.js";
import { describeStreamGraph, readProjectLogRecords, readProjectLogRecordsArgumentsFrom, streamArgumentsFrom } from "./tatolab_stream_and_runtime_project_commands.js";
import { enabledArgumentsFrom } from "./tatolab_status_runtime_and_settings_commands.js";
import { tatolabWindowCommandHandlers } from "./tatolab_commands.js";
import { cleanUpTheFakesTheLastTestMade, FROM_THE_PROJECTS_WINDOW, sharedStateOverFakes } from "./tatolab_commands_test_support.js";

afterEach(cleanUpTheFakesTheLastTestMade);

/** The window's TypeScript types read exactly this JSON, key for key and in this order. */
test("the_status_a_log_page_and_a_graph_serialize_exactly_as_the_window_reads_them", async () => {
  const runningRuntime = await sharedStateOverFakes(
    [
      httpResponse("200 OK", "text/plain", "ok"),
      controlOperationResultResponse({
        streams: [
          {
            stream: "pattern-main-41d0c2",
            display_name: "main",
            location: { project_directory: "/private/tmp/x/pattern", project: "0d4c4e2a-6f1b-4a57-9d0e-3b2f8c1a7e55", stream_asset: "7a9e1c3b-2d4f-4e6a-8b1c-5f3e9d2a4c68" },
            state: "running",
            node_count: 4,
            failed_because: null,
            capture_devices_whose_access_was_never_asked_for: [],
            action: null,
            step: null,
            from_later: 1,
          },
        ],
      }),
      httpResponse("200 OK", "application/json", JSON.stringify({ machine: "jonathanf-macbook", streams: [] })),
    ],
    "macos"
  );
  expect(JSON.stringify(await runningRuntime.controller.composeStatus(0))).toBe(
    '{"app_version":"0.45.0",' +
      '"app_build":{"tatolab_app_commit":"22b07a1c0ffee5d1e4a7b3c9e8f6a2d4b5c7e9f1","build_kind":"dev","built_with_uncommitted_changes":true},' +
      '"platform":"macos","runtime_state":"running","runtime_not_running_because":null,' +
      '"machine_name":"jonathanf-macbook","streams":[' +
      '{"stream":"pattern-main-41d0c2","display_name":"main","location":{"project_directory":"/private/tmp/x/pattern","project":"0d4c4e2a-6f1b-4a57-9d0e-3b2f8c1a7e55","stream_asset":"7a9e1c3b-2d4f-4e6a-8b1c-5f3e9d2a4c68"},' +
      '"state":"running","node_count":4,"failed_because":null,"capture_devices_whose_access_was_never_asked_for":[],"action":null,"step":null}],"project_venv_syncs_under_way":[],"project_venv_syncs_just_ended":[],"project_stream_action_failures":[],"streams_not_listed_because":null,' +
      '"command_line_tool_link":{"kind":"linked","path":"/Users/someone/.local/bin/tatolab"},' +
      '"app_update":{"kind":"not_checked"},"app_update_announcement":null,' +
      `"local_api_socket":${JSON.stringify(runningRuntime.localApiSocketPath)},` +
      '"stream_failure_notifications":{"enabled":true,"shown_by_this_desktop":true},' +
      '"developer_mode":false,' +
      '"open_at_login":{"kind":"off"},"command_line_tool_version":{"kind":"read","version":"0.55.2"},"studio_warnings":[]}',
  );
  const runtimeThatIsDown = await sharedStateOverFakes([httpResponse("503 Service Unavailable", "text/plain", "")], "linux");
  runtimeThatIsDown.commandLineToolLink.commandLineToolLink = { kind: "not_linked", path: "/home/someone/.local/bin/tatolab" };
  expect(JSON.stringify(await runtimeThatIsDown.controller.composeStatus(0))).toBe(
    '{"app_version":"0.45.0",' +
      '"app_build":{"tatolab_app_commit":"22b07a1c0ffee5d1e4a7b3c9e8f6a2d4b5c7e9f1","build_kind":"dev","built_with_uncommitted_changes":true},' +
      '"platform":"linux","runtime_state":"starting","runtime_not_running_because":null,"machine_name":null,' +
      '"streams":null,"project_venv_syncs_under_way":[],"project_venv_syncs_just_ended":[],"project_stream_action_failures":[],"streams_not_listed_because":null,"command_line_tool_link":{"kind":"not_linked","path":"/home/someone/.local/bin/tatolab"},' +
      '"app_update":{"kind":"not_checked"},"app_update_announcement":null,' +
      `"local_api_socket":${JSON.stringify(runtimeThatIsDown.localApiSocketPath)},` +
      '"stream_failure_notifications":{"enabled":true,"shown_by_this_desktop":true},' +
      '"developer_mode":false,' +
      '"open_at_login":{"kind":"off"},"command_line_tool_version":{"kind":"read","version":"0.55.2"},' +
      '"studio_warnings":[{"kind":"viewer_frames_copied_on_x11","first_open_dialog_due":true}]}',
  );

  const page = projectLogRecordsPageFromTheLogsToolResult(
    JSON.stringify({
      project_directory: "/private/tmp/x/pattern",
      records: [
        {
          message: "Loading the stream `main`",
          host_ts: 1791757115431254000,
          target: "streamlib_engine::core::runtime::loaded_stream",
          source: "rust",
          attrs: { processor_class_import_path: "nodes.x:X" },
          level: "info",
          action: "R1-2",
          stream: "pattern-main-41d0c2",
        },
        {},
      ],
      next_after: "1:90",
      records_no_longer_held: false,
    }),
  );
  expect(page.ok && JSON.stringify(page.value)).toBe(
    '{"project_directory":"/private/tmp/x/pattern","records":[' +
      '{"host_ts_ns":1791757115431254000,"level":"info","source":"rust",' +
      '"target":"streamlib_engine::core::runtime::loaded_stream",' +
      '"message":"Loading the stream `main`",' +
      '"attrs":{"processor_class_import_path":"nodes.x:X"},"processor_id":null,"sent_by_its_own_process":false,' +
      '"action":"R1-2","stream":"pattern-main-41d0c2",' +
      '"jsonl_line":"{\\"message\\":\\"Loading the stream `main`\\",\\"host_ts\\":1791757115431254000,' +
      '\\"target\\":\\"streamlib_engine::core::runtime::loaded_stream\\",\\"source\\":\\"rust\\",' +
      '\\"attrs\\":{\\"processor_class_import_path\\":\\"nodes.x:X\\"},\\"level\\":\\"info\\",' +
      '\\"action\\":\\"R1-2\\",\\"stream\\":\\"pattern-main-41d0c2\\"}"},' +
      '{"host_ts_ns":null,"level":null,"source":null,"target":null,' +
      '"message":"","attrs":{},"processor_id":null,"sent_by_its_own_process":false,"action":null,"stream":null,"jsonl_line":"{}"}],' +
      '"next_after":"1:90","records_no_longer_held":false}',
  );

  const graphToolResultText = JSON.stringify({
      machine: "jonathanf-macbook",
      links: [
        { state: "wired", target: { port: "video_from_upstream", node: "invertingeffect" }, source: { port: "video", node: "testpatternsource" }, id: "L1" },
      ],
      nodes: [
        {
          ports: { outputs: [{ catalog_entry: { entry: {}, section: "binary" }, name: "video" }], inputs: [] },
          components: { state: "Running" },
          type: "tatolab.stream:TestPatternSource",
          name: "testpatternsource",
          id: "P1",
        },
        { type: "nodes.inverting_effect:InvertingEffect", name: "invertingeffect", components: { metrics: { dropped_bags_by_link: { L1: 12 } } } },
      ],
      stream: "main",
  });
  const graph = streamGraphSummaryFromTheGraphToolResult("main", graphToolResultText);
  expect(graph.ok && JSON.stringify(graph.value)).toBe(
    '{"stream":"main","stream_asset":null,"nodes":[' +
      '{"id":"P1","name":"testpatternsource","type":"tatolab.stream:TestPatternSource","kind":null,"state":"Running","failed_because":null,"process_raising_because":null,"not_ready_because":null,"config":{},"pins":{},"exposed_config_fields":[],' +
      '"input_ports":[],"output_ports":[{"name":"video","family":null,"stream_facts":null,"values_checked":null}],' +
      '"dropped_bags_by_link":{},"refused_bags_by_output_port":{},"studio":{"position":null,"group":null,"comment":null,"colour":null,"collapsed":null,"metadata":{}},"fragment":null,"graph_interface":null},' +
      '{"id":"","name":"invertingeffect","type":"nodes.inverting_effect:InvertingEffect","kind":null,"state":null,"failed_because":null,"process_raising_because":null,"not_ready_because":null,"config":{},"pins":{},"exposed_config_fields":[],' +
      '"input_ports":[],"output_ports":[],' +
      '"dropped_bags_by_link":{"L1":12},"refused_bags_by_output_port":{},"studio":{"position":null,"group":null,"comment":null,"colour":null,"collapsed":null,"metadata":{}},"fragment":null,"graph_interface":null}],' +
      '"links":[{"id":"L1","source_node":"testpatternsource","source_port":"video",' +
      '"target_node":"invertingeffect","target_port":"video_from_upstream","state":"wired"}],"groups":[],"notes":[],' +
      `"graph_document_text":${JSON.stringify(graphToolResultText)}}`,
  );
});

test("a refusal from the runtime reaches the window in the runtime's own words", async () => {
  const graphRefusal = "graph failed: Resource not found: no stream named `nope` is loaded in this runtime. Loaded: main";
  const logsRefusal = "logs failed: Resource not found: this runtime holds no stream of the project in /tmp/nope";
  const sharedState = await sharedStateOverFakes(
    [
      controlOperationFailedResponse(graphRefusal),
      controlOperationFailedResponse(logsRefusal),
    ],
    "macos"
  );

  expect(await describeStreamGraph(sharedState, "nope")).toEqual(failedWith(graphRefusal));
  expect(await readProjectLogRecords(sharedState, "/tmp/nope", { stream: null, action: null }, null, null)).toEqual(failedWith(logsRefusal));
});

test("a command's arguments are read as the window sends them, and anything else is refused", () => {
  expect(enabledArgumentsFrom("set_stream_failure_notifications", { enabled: false })).toEqual(succeeded({ enabled: false }));
  expect(enabledArgumentsFrom("set_stream_failure_notifications", { enabled: "yes" }).ok).toBe(false);
  expect(enabledArgumentsFrom("set_stream_failure_notifications", null).ok).toBe(false);
  expect(readProjectLogRecordsArgumentsFrom({ project_directory: "/tmp/p", stream: "pattern-main-d76f70", action: null, after: "1:7830", until: "1:9120" })).toEqual(
    succeeded({ projectDirectory: "/tmp/p", narrowing: { stream: "pattern-main-d76f70", action: null }, after: "1:7830", until: "1:9120" }),
  );
  expect(readProjectLogRecordsArgumentsFrom({ project_directory: "/tmp/p", stream: null, action: null, after: 79, until: null }).ok).toBe(false);
  expect(readProjectLogRecordsArgumentsFrom({ project_directory: "/tmp/p", stream: null, action: null, after: null }).ok).toBe(false);
  expect(readProjectLogRecordsArgumentsFrom({ stream: null, action: null, after: null }).ok).toBe(false);
  expect(streamArgumentsFrom("describe_stream_graph", { stream: "main" })).toEqual(succeeded({ stream: "main" }));
  expect(streamArgumentsFrom("describe_stream_graph", {}).ok).toBe(false);
});

test("each command answers the window in the contract's shape, a refusal in its own words and nothing as null", async () => {
  const graphRefusal = "graph failed: Resource not found: no stream named `nope` is loaded in this runtime. Loaded: main";
  const sharedState = await sharedStateOverFakes(
    [controlOperationFailedResponse(graphRefusal)],
    "linux"
  );
  let quitRequests = 0;
  const commandHandlers = tatolabWindowCommandHandlers(sharedState, () => {
    quitRequests += 1;
  });
  expect(await commandHandlers.describe_stream_graph({ stream: "nope" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: graphRefusal });
  expect(await commandHandlers.link_command_line_tool(undefined, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: true, value: null });
  expect(await commandHandlers.quit_tatolab_app(undefined, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: true, value: null });
  expect(quitRequests).toBe(1);
  expect(await commandHandlers.set_stream_failure_notifications({ enabled: "yes" }, FROM_THE_PROJECTS_WINDOW)).toEqual({
    ok: false,
    refusal: "set_stream_failure_notifications needs `enabled`, true or false",
  });
  expect(await commandHandlers.read_project_log_records({ stream: "camera" }, FROM_THE_PROJECTS_WINDOW)).toEqual({
    ok: false,
    refusal:
      "read_project_log_records needs `project_directory`, a project's folder, and `stream`, `action`, `after` and `until`, each text or null: a stream's id, a stream action's id, the cursor of the page before, and the cursor the read stops at",
  });
  expect(await commandHandlers.describe_stream_graph(null, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "describe_stream_graph needs `stream`, a stream's id" });
});
