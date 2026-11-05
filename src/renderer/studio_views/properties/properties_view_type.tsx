import { cn } from "cn";
import { useCallback, useMemo } from "react";
import { KeyValueRows, type KeyValueRow } from "../../design_system/key_value_rows";
import { NodeGraphPinMark } from "../../design_system/node_graph_canvas";
import { PanelSection } from "../../design_system/panel_section";
import { WaitingState } from "../../design_system/waiting_state";
import { useStudioViewReading } from "../../view_host/in_window_view_host";
import type {
  NodeCatalogEntry,
  NodeCatalogPort,
  NodeCatalogReading,
  StopWatching,
  StreamGraphDeclaredPort,
  StreamGraphReading,
  StudioViewHostConnection,
  StudioViewType,
} from "../../view_host/studio_view_contract";
import { configFormFieldValueWords, configFormOf, type ConfigFormField } from "./config_form_fields";

/** A config field's value, drawn as a field that can be read and not changed. */
function ConfigFieldValue({ field }: { field: ConfigFormField }) {
  const words = field.value_source === "unset" ? (field.is_nullable ? "none" : "unset") : configFormFieldValueWords(field.value);
  return (
    <span
      className={cn("inline-flex h-6 max-w-full items-center truncate rounded bg-studio-control px-2 text-[11.5px]", field.value_source === "config" ? "text-fg" : "text-fg-3")}
      data-config-field={field.key}
      data-config-field-value-source={field.value_source}
    >
      {words}
    </span>
  );
}

function PortRows({ ports, catalogPorts }: { ports: StreamGraphDeclaredPort[]; catalogPorts: NodeCatalogPort[] }) {
  if (ports.length === 0) return <p className="text-xs text-fg-3">None</p>;
  return (
    <ul className="flex flex-col gap-1">
      {ports.map((port) => {
        const description = catalogPorts.find((catalogPort) => catalogPort.name === port.name)?.description;
        return (
          <li key={port.name} className="flex min-w-0 items-center gap-2 font-mono text-xs text-fg" title={description === undefined || description === "" ? undefined : description}>
            <NodeGraphPinMark />
            <span className="truncate">{port.name}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** The selected node's type, config and ports, read from its stream's graph and node catalog. */
function PropertiesOfTheSelectedNode({ connection, stream, nodeName }: { connection: StudioViewHostConnection<null>; stream: string; nodeName: string }) {
  const watchTheStreamsGraph = useCallback((listener: (reading: StreamGraphReading) => void): StopWatching => connection.watchStreamGraph(stream, listener), [connection, stream]);
  const watchTheStreamsCatalog = useCallback((listener: (reading: NodeCatalogReading) => void): StopWatching => connection.watchNodeCatalog(stream, listener), [connection, stream]);
  const graphReading = useStudioViewReading(watchTheStreamsGraph);
  const catalogReading = useStudioViewReading(watchTheStreamsCatalog);
  const node = graphReading?.kind === "read" ? graphReading.graph.nodes.find((graphNode) => graphNode.name === nodeName) : undefined;
  const catalogEntry: NodeCatalogEntry | undefined = catalogReading?.kind === "listed" && node !== undefined ? catalogReading.catalog.node_types.find((entry) => entry.type === node.type) : undefined;
  const configForm = useMemo(() => (node === undefined ? null : configFormOf(catalogEntry?.config_schema ?? null, node.config)), [node, catalogEntry]);

  if (graphReading === null) return null;
  if (graphReading.kind === "not_read") return <WaitingState title={`${nodeName} can't be read`} explanation={graphReading.because} data-properties-state="graph_not_read" />;
  if (node === undefined || configForm === null) return <WaitingState title={`${nodeName} is gone`} explanation="Its stream's graph no longer has it." data-properties-state="node_gone" />;
  const configRows = configForm.kind === "fields" ? configForm.fields.map((field): KeyValueRow => [field.key, <ConfigFieldValue key={field.key} field={field} />, field.description]) : [];
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto" data-properties-of-node={node.name}>
      <header className="flex min-w-0 flex-col gap-0.5 border-b px-4 py-3">
        <h2 className="truncate text-sm font-medium text-fg">{node.name}</h2>
        <span className="truncate font-mono text-xs text-fg-3" title={catalogEntry?.description}>
          {node.type}
        </span>
      </header>
      <PanelSection title="Config" isDivided>
        {configForm.kind === "takes_no_config" ? (
          <p className="text-xs text-fg-3">{node.type} takes no config.</p>
        ) : configRows.length === 0 ? (
          <p className="text-xs text-fg-3">{catalogReading?.kind === "not_listed" ? catalogReading.because : "No config."}</p>
        ) : (
          <KeyValueRows look="fields" rows={configRows} data-properties-config={node.name} />
        )}
      </PanelSection>
      <PanelSection title="Inputs" isDivided>
        <PortRows ports={node.input_ports} catalogPorts={catalogEntry?.inputs ?? []} />
      </PanelSection>
      <PanelSection title="Outputs" isDivided>
        <PortRows ports={node.output_ports} catalogPorts={catalogEntry?.outputs ?? []} />
      </PanelSection>
    </div>
  );
}

function PropertiesBody({ connection }: { connection: StudioViewHostConnection<null> }) {
  const selection = useStudioViewReading(connection.watchSelection);
  if (selection?.kind !== "node") return <WaitingState title="Nothing to show" explanation="Select a node in the stream graph to see its config and ports." data-properties-state="no_node" />;
  return <PropertiesOfTheSelectedNode key={`${selection.stream}/${selection.node}`} connection={connection} stream={selection.stream} nodeName={selection.node} />;
}

/** Properties: the selected node's type, its config read against its type's schema, and its ports. */
export const PROPERTIES_VIEW_TYPE: StudioViewType<null> = {
  view_type_id: "properties",
  title: "Properties",
  icon: "properties",
  brought_by: { kind: "built_in" },
  default_settings: null,
  settingsFromSavedLayout: () => null,
  renderStudioView: (connection) => ({ header_tools: null, body: <PropertiesBody connection={connection} /> }),
};
