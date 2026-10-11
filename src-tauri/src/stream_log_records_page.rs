// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

//! One page of a stream's log records as the window shows them, read from the runtime's `logs`
//! tool result. Each record keeps the JSONL fields the window shows and drops the rest.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// One page of a stream's log records, oldest first.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct StreamLogRecordsPage {
    pub stream: String,
    /// Which load of the stream the records are from: a page naming another instance than the
    /// last is a re-load, numbering its records from 1 again.
    pub stream_instance: String,
    pub records: Vec<StreamLogRecord>,
    /// The `after` that reads on from this page.
    pub next_after: u64,
    /// Records after the asked-for `after` that the runtime no longer holds in memory.
    pub records_no_longer_held: u64,
}

/// One log record as the window shows it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct StreamLogRecord {
    /// The record's place in its stream's log, from 1 for each load.
    pub sequence: u64,
    /// When the runtime received the record, in nanoseconds since the UNIX epoch.
    pub host_ts_ns: Option<u64>,
    pub level: Option<String>,
    /// `rust` or `python`, or whatever a newer runtime spells.
    pub source: Option<String>,
    pub target: Option<String>,
    pub message: String,
    /// The record's structured fields, each value as text.
    pub attrs: BTreeMap<String, String>,
}

/// The `logs` tool's result.
#[derive(Deserialize)]
struct LogsToolResultOnTheWire {
    stream: String,
    stream_instance: String,
    #[serde(default)]
    records: Vec<LogsToolResultRecordOnTheWire>,
    next_after: u64,
    #[serde(default)]
    records_no_longer_held: u64,
}

/// One record of the `logs` tool's result: its sequence number beside its JSONL line.
#[derive(Deserialize)]
struct LogsToolResultRecordOnTheWire {
    sequence: u64,
    #[serde(default)]
    record: Value,
}

/// The page a `logs` tool result's text holds.
pub fn stream_log_records_page_from_the_logs_tool_result(
    tool_result_text: &str,
) -> Result<StreamLogRecordsPage, String> {
    let logs_tool_result: LogsToolResultOnTheWire = serde_json::from_str(tool_result_text)
        .map_err(|failure| format!("the runtime's logs result could not be read: {failure}"))?;
    Ok(StreamLogRecordsPage {
        stream: logs_tool_result.stream,
        stream_instance: logs_tool_result.stream_instance,
        records: logs_tool_result
            .records
            .iter()
            .map(|numbered_record| {
                stream_log_record_from_its_jsonl_line(
                    numbered_record.sequence,
                    &numbered_record.record,
                )
            })
            .collect(),
        next_after: logs_tool_result.next_after,
        records_no_longer_held: logs_tool_result.records_no_longer_held,
    })
}

/// The record numbered `sequence`, from its JSONL line: a field that is absent or of another type
/// reads `None`, an absent message reads empty, and an attribute that is not a string reads as its
/// JSON text.
fn stream_log_record_from_its_jsonl_line(sequence: u64, jsonl_line: &Value) -> StreamLogRecord {
    let text_field = |field_name: &str| {
        jsonl_line
            .get(field_name)
            .and_then(Value::as_str)
            .map(str::to_string)
    };
    let attrs = jsonl_line
        .get("attrs")
        .and_then(Value::as_object)
        .map(|attrs| {
            attrs
                .iter()
                .map(|(attribute_name, attribute_value)| {
                    let attribute_text = match attribute_value {
                        Value::String(text) => text.clone(),
                        _ => attribute_value.to_string(),
                    };
                    (attribute_name.clone(), attribute_text)
                })
                .collect()
        })
        .unwrap_or_default();
    StreamLogRecord {
        sequence,
        host_ts_ns: jsonl_line.get("host_ts").and_then(Value::as_u64),
        level: text_field("level"),
        source: text_field("source"),
        target: text_field("target"),
        message: text_field("message").unwrap_or_default(),
        attrs,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    /// The page a real runtime answered `logs {stream: "main", after: 0, count: 3}` with.
    const A_REAL_FIRST_PAGE: &str =
        include_str!("../test-fixtures/local-api-logs-tool-result-of-the-stream-main-after-0.json");

    /// The page a real runtime answered `logs {stream: "main", after: 79, count: 17}` with: Python
    /// helpers' records, attributes that are numbers, and a line captured from a helper's stderr.
    const A_REAL_PAGE_OF_PYTHON_RECORDS: &str = include_str!(
        "../test-fixtures/local-api-logs-tool-result-of-the-stream-main-after-79.json"
    );

    fn attrs(attributes: &[(&str, &str)]) -> BTreeMap<String, String> {
        attributes
            .iter()
            .map(|(attribute_name, attribute_text)| {
                (attribute_name.to_string(), attribute_text.to_string())
            })
            .collect()
    }

    #[test]
    fn a_real_first_page_keeps_each_records_shown_fields() {
        let page = stream_log_records_page_from_the_logs_tool_result(A_REAL_FIRST_PAGE).unwrap();

        assert_eq!(page.stream, "main");
        assert_eq!(page.stream_instance, "1");
        assert_eq!(page.next_after, 3);
        assert_eq!(page.records_no_longer_held, 0);
        assert_eq!(
            page.records,
            vec![
                StreamLogRecord {
                    sequence: 1,
                    host_ts_ns: Some(1791759307069355000),
                    level: Some("info".to_string()),
                    source: Some("rust".to_string()),
                    target: Some("streamlib_engine::core::runtime::loaded_stream".to_string()),
                    message:
                        "Loading the stream `main` from /private/tmp/tatolab-proof-projects/pattern"
                            .to_string(),
                    attrs: BTreeMap::new(),
                },
                StreamLogRecord {
                    sequence: 2,
                    host_ts_ns: Some(1791759307221236000),
                    level: Some("info".to_string()),
                    source: Some("rust".to_string()),
                    target: Some(
                        "streamlib_engine::core::processors::node_types_one_stream_resolves"
                            .to_string()
                    ),
                    message: "node type described in the stream's processor interpreter registered"
                        .to_string(),
                    attrs: attrs(&[(
                        "processor_class_import_path",
                        "nodes.inverting_effect:InvertingEffect"
                    )]),
                },
                StreamLogRecord {
                    sequence: 3,
                    host_ts_ns: Some(1791759307221244000),
                    level: Some("info".to_string()),
                    source: Some("rust".to_string()),
                    target: Some(
                        "streamlib_engine::core::processors::node_types_one_stream_resolves"
                            .to_string()
                    ),
                    message: "node type described in the stream's processor interpreter registered"
                        .to_string(),
                    attrs: attrs(&[(
                        "processor_class_import_path",
                        "nodes.brightness_meter:BrightnessMeter"
                    )]),
                },
            ]
        );
    }

    #[test]
    fn a_real_page_of_python_records_reads_numbers_as_text_and_keeps_a_captured_stderr_line() {
        let page = stream_log_records_page_from_the_logs_tool_result(A_REAL_PAGE_OF_PYTHON_RECORDS)
            .unwrap();

        assert_eq!(page.next_after, 96);
        assert_eq!(
            page.records
                .iter()
                .map(|record| record.sequence)
                .collect::<Vec<_>>(),
            (80..=96).collect::<Vec<_>>()
        );
        assert_eq!(
            page.records[0],
            StreamLogRecord {
                sequence: 80,
                host_ts_ns: Some(1791759307360310000),
                level: Some("info".to_string()),
                source: Some("python".to_string()),
                target: Some("streamlib::polyglot::python".to_string()),
                message: "helper process started".to_string(),
                attrs: attrs(&[
                    ("entrypoint", "nodes.inverting_effect:InvertingEffect"),
                    ("pid", "54846")
                ]),
            }
        );
        let captured_stderr_line = &page.records[16];
        assert_eq!(captured_stderr_line.source.as_deref(), Some("python"));
        assert_eq!(captured_stderr_line.level.as_deref(), Some("warn"));
        assert_eq!(
            captured_stderr_line.message,
            "[mvk-info] MoltenVK version 1.4.2, supporting Vulkan version 1.4.357."
        );
        assert!(captured_stderr_line.attrs.is_empty());
    }

    #[test]
    fn a_record_missing_its_optional_fields_or_carrying_unknown_ones_still_reads() {
        let tool_result = json!({
            "stream": "main",
            "stream_instance": "4",
            "records": [
                { "sequence": 7, "record": { "a_field_from_later": [1, 2], "level": 3 } },
                { "sequence": 8, "record": "not an object" },
                { "sequence": 9 }
            ],
            "next_after": 9,
            "a_top_level_field_from_later": true
        });

        let page =
            stream_log_records_page_from_the_logs_tool_result(&tool_result.to_string()).unwrap();

        let record_without_its_fields = |sequence| StreamLogRecord {
            sequence,
            host_ts_ns: None,
            level: None,
            source: None,
            target: None,
            message: String::new(),
            attrs: BTreeMap::new(),
        };
        assert_eq!(
            page,
            StreamLogRecordsPage {
                stream: "main".to_string(),
                stream_instance: "4".to_string(),
                records: vec![
                    record_without_its_fields(7),
                    record_without_its_fields(8),
                    record_without_its_fields(9),
                ],
                next_after: 9,
                records_no_longer_held: 0,
            }
        );
    }

    #[test]
    fn every_attribute_that_is_not_a_string_reads_as_its_json_text() {
        let record = stream_log_record_from_its_jsonl_line(
            1,
            &json!({ "attrs": { "count": 2, "ready": true, "nothing": null, "shape": { "w": 1280 }, "note": "as is" } }),
        );

        assert_eq!(
            record.attrs,
            attrs(&[
                ("count", "2"),
                ("note", "as is"),
                ("nothing", "null"),
                ("ready", "true"),
                ("shape", r#"{"w":1280}"#),
            ])
        );
    }

    #[test]
    fn a_result_naming_no_stream_instance_is_refused() {
        let failure = stream_log_records_page_from_the_logs_tool_result(
            &json!({ "stream": "main", "records": [], "next_after": 0 }).to_string(),
        )
        .unwrap_err();

        assert!(failure.contains("stream_instance"), "{failure}");
    }
}
