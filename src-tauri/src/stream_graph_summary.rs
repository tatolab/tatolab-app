// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

//! A stream's graph as the window draws it, read from the runtime's `GET /api/graph?stream=`: its
//! nodes by name with their type and state, its links by node and port, and the ports it exposes.
//! Every other key the runtime renders is dropped.

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

/// A stream's graph as the window draws it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct StreamGraphSummary {
    pub stream: String,
    pub nodes: Vec<StreamGraphNode>,
    pub links: Vec<StreamGraphLink>,
    pub exposed: Vec<StreamGraphExposedPort>,
}

/// One node of a stream's graph.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct StreamGraphNode {
    pub name: String,
    /// The import path of the class the node is, e.g. `tatolab.stream:TestPatternSource`.
    #[serde(rename = "type")]
    pub node_type: String,
    /// The processor's state, e.g. `Running`; `None` when the runtime did not say.
    pub state: Option<String>,
}

/// One link of a stream's graph, from an output port to an input port.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct StreamGraphLink {
    /// The node the link carries from; `<stream>/<node>` for a node of another stream.
    pub source_node: String,
    pub source_port: String,
    pub target_node: String,
    pub target_port: String,
    /// `wired`, `pending`, `error`, `awaiting_remote`, or whatever a newer runtime spells.
    pub state: String,
}

/// One output port a stream exposes beyond itself.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct StreamGraphExposedPort {
    pub node: String,
    pub port: String,
    /// `private` or `public`, or whatever a newer runtime spells.
    pub level: String,
}

/// One stream's graph as `GET /api/graph?stream=` renders it.
#[derive(Deserialize)]
struct StreamGraphOnTheWire {
    stream: Option<String>,
    #[serde(default)]
    nodes: Vec<StreamGraphNodeOnTheWire>,
    #[serde(default)]
    links: Vec<StreamGraphLinkOnTheWire>,
    #[serde(default)]
    exposed: Vec<StreamGraphExposedPortOnTheWire>,
}

#[derive(Deserialize)]
struct StreamGraphNodeOnTheWire {
    name: String,
    #[serde(rename = "type", default)]
    node_type: String,
    #[serde(default)]
    components: Map<String, Value>,
}

#[derive(Deserialize)]
struct StreamGraphLinkOnTheWire {
    source: StreamGraphLinkEndOnTheWire,
    target: StreamGraphLinkEndOnTheWire,
    #[serde(default = "a_link_rendered_without_a_state_is_pending")]
    state: String,
}

/// One end of a link: a port of a node in this stream, or, for a source, in the stream named.
#[derive(Deserialize)]
struct StreamGraphLinkEndOnTheWire {
    stream: Option<String>,
    node: String,
    port: String,
}

#[derive(Deserialize)]
struct StreamGraphExposedPortOnTheWire {
    node: String,
    port: String,
    #[serde(default = "an_exposure_rendered_without_a_level_is_private")]
    level: String,
}

/// The runtime's own reading of a link rendered without a state.
fn a_link_rendered_without_a_state_is_pending() -> String {
    "pending".to_string()
}

/// The runtime's own reading of an exposure written before exposure had levels.
fn an_exposure_rendered_without_a_level_is_private() -> String {
    "private".to_string()
}

impl StreamGraphLinkEndOnTheWire {
    /// The end's node as the window names it: `<stream>/<node>` for a node of another stream.
    fn node_name_as_the_window_shows_it(&self) -> String {
        match &self.stream {
            Some(stream) => format!("{stream}/{}", self.node),
            None => self.node.clone(),
        }
    }
}

/// The summary of the graph `GET /api/graph?stream=<requested_stream>` answered with
/// `graph_json`; a graph naming no stream is the requested one's.
pub fn stream_graph_summary_from_the_graph_json(
    requested_stream: &str,
    graph_json: &[u8],
) -> Result<StreamGraphSummary, String> {
    let graph: StreamGraphOnTheWire = serde_json::from_slice(graph_json).map_err(|failure| {
        format!("the runtime's graph of `{requested_stream}` could not be read: {failure}")
    })?;
    Ok(StreamGraphSummary {
        stream: graph.stream.unwrap_or_else(|| requested_stream.to_string()),
        nodes: graph
            .nodes
            .into_iter()
            .map(|node| StreamGraphNode {
                state: node
                    .components
                    .get("state")
                    .and_then(Value::as_str)
                    .map(str::to_string),
                name: node.name,
                node_type: node.node_type,
            })
            .collect(),
        links: graph
            .links
            .into_iter()
            .map(|link| StreamGraphLink {
                source_node: link.source.node_name_as_the_window_shows_it(),
                source_port: link.source.port,
                target_node: link.target.node_name_as_the_window_shows_it(),
                target_port: link.target.port,
                state: link.state,
            })
            .collect(),
        exposed: graph
            .exposed
            .into_iter()
            .map(|exposed_port| StreamGraphExposedPort {
                node: exposed_port.node,
                port: exposed_port.port,
                level: exposed_port.level,
            })
            .collect(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    /// What a real runtime answered `GET /api/graph?stream=main` with, for a stream of a test
    /// pattern, an inverting effect, a brightness meter and a display window.
    const A_REAL_GRAPH_OF_ONE_STREAM: &str =
        include_str!("../test-fixtures/local-api-graph-of-the-stream-main.json");

    fn node(name: &str, node_type: &str, state: Option<&str>) -> StreamGraphNode {
        StreamGraphNode {
            name: name.to_string(),
            node_type: node_type.to_string(),
            state: state.map(str::to_string),
        }
    }

    fn link(
        (source_node, source_port): (&str, &str),
        (target_node, target_port): (&str, &str),
        state: &str,
    ) -> StreamGraphLink {
        StreamGraphLink {
            source_node: source_node.to_string(),
            source_port: source_port.to_string(),
            target_node: target_node.to_string(),
            target_port: target_port.to_string(),
            state: state.to_string(),
        }
    }

    #[test]
    fn a_real_graph_reads_as_its_nodes_links_and_exposed_ports() {
        let summary =
            stream_graph_summary_from_the_graph_json("main", A_REAL_GRAPH_OF_ONE_STREAM.as_bytes())
                .unwrap();

        assert_eq!(
            summary,
            StreamGraphSummary {
                stream: "main".to_string(),
                nodes: vec![
                    node(
                        "testpatternsource",
                        "tatolab.stream:TestPatternSource",
                        Some("Running")
                    ),
                    node(
                        "invertingeffect",
                        "nodes.inverting_effect:InvertingEffect",
                        Some("Running")
                    ),
                    node(
                        "brightnessmeter",
                        "nodes.brightness_meter:BrightnessMeter",
                        Some("Running")
                    ),
                    node(
                        "displaywindow",
                        "tatolab.stream:DisplayWindow",
                        Some("Running")
                    ),
                ],
                links: vec![
                    link(
                        ("testpatternsource", "video"),
                        ("invertingeffect", "video_from_upstream"),
                        "wired"
                    ),
                    link(
                        ("invertingeffect", "video_to_downstream"),
                        ("displaywindow", "video"),
                        "wired"
                    ),
                    link(
                        ("invertingeffect", "video_to_downstream"),
                        ("brightnessmeter", "video_from_upstream"),
                        "wired"
                    ),
                ],
                exposed: vec![StreamGraphExposedPort {
                    node: "invertingeffect".to_string(),
                    port: "video_to_downstream".to_string(),
                    level: "private".to_string(),
                }],
            }
        );
    }

    #[test]
    fn a_link_from_another_stream_names_its_source_by_that_stream() {
        let graph = json!({
            "stream": "recorder",
            "nodes": [{ "id": "P1", "type": "tatolab.stream:Mp4Writer", "name": "mp4writer", "ports": { "inputs": [], "outputs": [] }, "components": { "state": "Running" } }],
            "links": [{
                "id": "L1",
                "source": { "stream": "camera", "node": "camerasource", "port": "video" },
                "target": { "node": "mp4writer", "port": "video" },
                "capacity": 4,
                "state": "awaiting_remote",
                "awaiting_remote_reason": "the stream `camera` is not loaded",
                "components": { "state": "AwaitingRemote" }
            }],
            "exposed": [],
            "machine": "jonathanf-macbook"
        });

        let summary =
            stream_graph_summary_from_the_graph_json("recorder", graph.to_string().as_bytes())
                .unwrap();

        assert_eq!(
            summary.links,
            vec![link(
                ("camera/camerasource", "video"),
                ("mp4writer", "video"),
                "awaiting_remote"
            )]
        );
    }

    #[test]
    fn a_graph_missing_its_optional_keys_or_carrying_unknown_ones_still_reads() {
        let graph = json!({
            "nodes": [
                { "name": "from-a-newer-runtime", "a_key_from_later": 1 },
                { "name": "a-state-of-another-type", "type": "nodes.x:X", "components": { "state": 7 } }
            ],
            "links": [{ "source": { "node": "a", "port": "out" }, "target": { "node": "b", "port": "in" } }],
            "exposed": [{ "node": "a", "port": "out" }],
            "a_top_level_key_from_later": {}
        });

        let summary =
            stream_graph_summary_from_the_graph_json("main", graph.to_string().as_bytes()).unwrap();

        assert_eq!(
            summary,
            StreamGraphSummary {
                stream: "main".to_string(),
                nodes: vec![
                    node("from-a-newer-runtime", "", None),
                    node("a-state-of-another-type", "nodes.x:X", None),
                ],
                links: vec![link(("a", "out"), ("b", "in"), "pending")],
                exposed: vec![StreamGraphExposedPort {
                    node: "a".to_string(),
                    port: "out".to_string(),
                    level: "private".to_string(),
                }],
            }
        );
    }

    #[test]
    fn a_graph_that_is_not_json_is_refused_naming_the_stream() {
        let failure = stream_graph_summary_from_the_graph_json("main", b"not json").unwrap_err();

        assert!(failure.contains("`main`"), "{failure}");
    }
}
