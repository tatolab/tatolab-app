import { useCallback, useMemo } from "react";
import { NodeGraphPinMark, nodeGraphPinFamilyWords } from "../../design_system/node_graph_canvas";
import { FailureBanner } from "../../design_system/failure_banner";
import { RuntimeFailureWords } from "../../design_system/runtime_failure_words";
import { PropertyCheckbox, PropertyChoiceField, PropertyNumberField, PropertyRow, PropertySection, PropertyTextField } from "../../design_system/property_fields";
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
import { portStreamFactsWords, streamFactsAnInputReceives, VALUES_UNCHECKED_MEANING } from "../port_stream_facts_words";
import { isANameTheCodeGave, nameInWords, nodeTitle, nodeTypeClassName } from "../node_words";
import { configFormFieldValueWords, configFormOf, type ConfigFormField } from "./config_form_fields";

/** A config field's value in the field its control draws. */
function ConfigFieldValue({ fieldId, field }: { fieldId: string; field: ConfigFormField }) {
  const isTheTypesDefault = field.value_source !== "config";
  const { control, value } = field;
  switch (control.kind) {
    case "number":
      return <PropertyNumberField fieldId={fieldId} value={typeof value === "number" ? value : null} minimum={control.minimum} maximum={control.maximum} isTheTypesDefault={isTheTypesDefault} />;
    case "toggle":
      return <PropertyCheckbox fieldId={fieldId} isOn={value === true} isTheTypesDefault={isTheTypesDefault} />;
    case "choice":
      return <PropertyChoiceField fieldId={fieldId} words={configFormFieldValueWords(value)} isTheTypesDefault={isTheTypesDefault} />;
    case "text":
    case "json":
      return <PropertyTextField fieldId={fieldId} words={field.value_source === "unset" ? "" : configFormFieldValueWords(value)} isTheTypesDefault={isTheTypesDefault} />;
  }
}

/** What a config key's name shows while the pointer rests on it: its key as the code writes it, and what the schema says it means. */
function meaningOfAConfigKey(field: ConfigFormField): string {
  return field.description === null ? field.key : `${field.key} · ${field.description}`;
}

function PortRows({
  direction,
  ports,
  catalogPorts,
  factsOfThePort,
}: {
  direction: "In" | "Out";
  ports: StreamGraphDeclaredPort[];
  catalogPorts: NodeCatalogPort[];
  factsOfThePort: (port: StreamGraphDeclaredPort) => Pick<StreamGraphDeclaredPort, "stream_facts" | "values_checked">;
}) {
  return ports.map((port) => {
    const description = catalogPorts.find((catalogPort) => catalogPort.name === port.name)?.description;
    const facts = factsOfThePort(port);
    const factsWords = portStreamFactsWords(facts);
    return (
      <div key={`${direction}:${port.name}`} className="flex min-w-0 flex-col py-0.5" data-properties-port={port.name}>
        <div className="flex h-6 min-w-0 items-center gap-2 text-xs" title={description === undefined || description === "" ? undefined : description}>
          <span className="w-6 shrink-0 text-right text-2xs text-fg-3">{direction}</span>
          <NodeGraphPinMark family={port.family} />
          <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-fg">{port.name}</span>
          {port.family !== null && <span className="shrink-0 text-fg-3">{nodeGraphPinFamilyWords(port.family)}</span>}
        </div>
        {factsWords.length > 0 && (
          <div
            className="truncate pl-[3.25rem] text-2xs text-fg-3"
            title={facts.values_checked === false ? VALUES_UNCHECKED_MEANING : factsWords.join(" · ")}
            data-properties-port-stream-facts={factsWords.join(" · ")}
          >
            {factsWords.join(" · ")}
          </div>
        )}
      </div>
    );
  });
}

/** The selected node's name and type, its config read against its type's schema, and its ports, as a details panel. */
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
  const { graph } = graphReading;
  const typeClassName = nodeTypeClassName(node.type);
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto" data-properties-of-node={node.name}>
      <header className="flex min-w-0 items-center gap-2 border-b px-3 py-2.5">
        <NodeGraphPinMark family={node.output_ports[0]?.family ?? node.input_ports[0]?.family ?? null} />
        <h2 className="min-w-0 truncate text-[13px] font-semibold text-fg">{nodeTitle(node.name, node.type)}</h2>
      </header>
      {node.state === "Error" && (
        <div data-properties-node-failed={node.name}>
          <FailureBanner place="panel">{node.failed_because === null ? "This node failed. The runtime gave no reason." : "This node failed."}</FailureBanner>
          {node.failed_because !== null && (
            <div className="border-b px-3 py-2.5">
              <RuntimeFailureWords words={node.failed_because} data-properties-failed-because={node.name} />
            </div>
          )}
        </div>
      )}
      <PropertySection title="Node">
        <PropertyRow label="Name" meaning={isANameTheCodeGave(node.name, node.type) ? "The name its stream's code gave it." : "The runtime named it after its type, as its stream's code gave it no name."}>
          {(fieldId) => <PropertyTextField fieldId={fieldId} words={node.name} />}
        </PropertyRow>
        <PropertyRow label="Type" meaning={catalogEntry?.description === undefined || catalogEntry.description === "" ? node.type : `${node.type} · ${catalogEntry.description}`}>
          {(fieldId) => <PropertyTextField fieldId={fieldId} words={typeClassName} />}
        </PropertyRow>
      </PropertySection>
      <PropertySection title="Config">
        {configForm.kind === "takes_no_config" ? (
          <p className="px-1 text-xs text-fg-3">{nameInWords(typeClassName)} takes no config.</p>
        ) : configForm.fields.length === 0 ? (
          <p className="px-1 text-xs text-fg-3">{catalogReading?.kind === "not_listed" ? catalogReading.because : "No config."}</p>
        ) : (
          configForm.fields.map((field) => (
            <PropertyRow key={field.key} label={nameInWords(field.key)} meaning={meaningOfAConfigKey(field)} data-config-field={field.key} data-config-field-value-source={field.value_source}>
              {(fieldId) => <ConfigFieldValue fieldId={fieldId} field={field} />}
            </PropertyRow>
          ))
        )}
      </PropertySection>
      <PropertySection title="Ports">
        {node.input_ports.length + node.output_ports.length === 0 ? (
          <p className="px-1 text-xs text-fg-3">None</p>
        ) : (
          <>
            <PortRows
              direction="In"
              ports={node.input_ports}
              catalogPorts={catalogEntry?.inputs ?? []}
              factsOfThePort={(port) => streamFactsAnInputReceives(graph, node.name, port)}
            />
            <PortRows direction="Out" ports={node.output_ports} catalogPorts={catalogEntry?.outputs ?? []} factsOfThePort={(port) => port} />
          </>
        )}
      </PropertySection>
    </div>
  );
}

function PropertiesBody({ connection }: { connection: StudioViewHostConnection<null> }) {
  const selection = useStudioViewReading(connection.watchSelection);
  if (selection?.kind !== "node") return <WaitingState title="Nothing to show" explanation="Select a node in the stream graph to see its config and ports." data-properties-state="no_node" />;
  return <PropertiesOfTheSelectedNode key={`${selection.stream}/${selection.node}`} connection={connection} stream={selection.stream} nodeName={selection.node} />;
}

/** Properties: the selected node's name and type, its config read against its type's schema, and its ports. */
export const PROPERTIES_VIEW_TYPE: StudioViewType<null> = {
  view_type_id: "properties",
  title: "Properties",
  icon: "properties",
  brought_by: { kind: "built_in" },
  default_settings: null,
  settingsFromSavedLayout: () => null,
  renderStudioView: (connection) => ({ header_tools: null, body: <PropertiesBody connection={connection} /> }),
};
