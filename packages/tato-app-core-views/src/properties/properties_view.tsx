import { useViewReading } from "@tatolab/tato-app-view-sdk/design_system/view_readings";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { SearchField } from "@tatolab/tato-app-view-sdk/design_system/search_field";
import { StudioViewToolbarTools } from "@tatolab/tato-app-view-sdk/design_system/studio_area_frame";
import { NodeGraphPinMark, nodeGraphPinFamilyWords } from "@tatolab/tato-app-view-sdk/design_system/node_graph_canvas";
import { ActionButton } from "@tatolab/tato-app-view-sdk/design_system/action_button";
import { FailureBanner } from "@tatolab/tato-app-view-sdk/design_system/failure_banner";
import { RefusalLine } from "@tatolab/tato-app-view-sdk/design_system/refusal_line";
import { RuntimeFailureWords } from "@tatolab/tato-app-view-sdk/design_system/runtime_failure_words";
import {
  PropertyCheckbox,
  PropertyChoiceField,
  PropertyHeadingNameField,
  PropertyListEntry,
  PropertyListEntryCount,
  PropertyNumberField,
  PropertyPortRow,
  type PropertyPortTarget,
  PropertyRow,
  PropertySection,
  PropertySliderField,
  PropertyTextField,
} from "@tatolab/tato-app-view-sdk/design_system/property_fields";
import { WaitingState } from "@tatolab/tato-app-view-sdk/design_system/waiting_state";
import { newGestureIdempotencyKey, type AreasForAViewTypeReading, type PortPickInTheStreamGraph, type StopWatching, type TatoAppViewConnection } from "@tatolab/tato-app-view-sdk";
import { FieldMenu, MenuItem, MenuNote } from "@tatolab/tato-app-view-sdk/design_system/menus";
import type {
  JsonValue,
  NodeCatalogEntry,
  NodeCatalogPort,
  NodeCatalogReading,
  ProjectAssetsReading,
  StreamGraphDeclaredPort,
  StreamGraphNode,
  StreamGraphReading,
  StreamGraphSummary,
} from "@tatolab/tato-app-view-sdk/studio_readings";
import { CoreViewFrame } from "../shared/core_view_page";
import { useRefusalOfTheLatestAsk } from "../shared/refusal_of_the_latest_ask";
import { portStreamFactsWords, streamFactsAnInputReceives, VALUES_UNCHECKED_MEANING } from "../shared/port_stream_facts_words";
import { nameInWords, nodeTitle, nodeTypeClassName, wordsForTheSeveralSelectedNodes } from "../shared/node_words";
import { configFormFieldValueWords, configFormOf, configFormOfAListEntry, recordsOfAListField, type ConfigFormField } from "./config_form_fields";
import { propertiesListedWords, propertiesMatchingTheSearch } from "./properties_matching_the_search";
import { areasToShowTheViewIn, viewShownInAreasWords } from "./view_node_areas";
import { chosenProjectAssetWords, projectAssetPickerNote, projectAssetsForTheAssetFieldsOf, projectAssetsTheFieldOffers, type ProjectAssetsForTheAssetFields } from "./project_asset_choices";
import { blankTargetPickerKeysOfThePort, NO_BLANK_TARGET_PICKERS, withABlankTargetPickerAdded, withoutTheBlankTargetPicker, type BlankTargetPickersOfTheNode } from "./blank_target_pickers";
import { useGraphEditsInTheOpenProject, type GraphEditsInTheOpenProject, type GraphEditsOfTheNode, type PlaceOfAnEdit } from "./graph_edits_in_the_open_project";
import {
  configFieldsToExposeAsGraphInputs,
  configValueFromTheWordsTyped,
  disconnectTheLink,
  exposeTheConfigFieldAsAGraphInput,
  LIST_ENTRY_MOVED_ON_REFUSAL,
  linkedEndsOfThePort,
  listWithARecordAdded,
  listWithoutTheRecord,
  listWithTheRecordFieldSet,
  nodeIdInShort,
  pinValueFromTheWordsTyped,
  portsToConnect,
  connectingThePortPicked,
  whyThePortTakesNoOtherTarget,
  type LinkedEndOfAPort,
  portsToConnectNote,
  resetTheConfigField,
  setTheConfigField,
  type SetNodeConfigAction,
} from "./properties_graph_edits";

/** The open project's assets, which a config field naming an asset offers to pick from. */
const ProjectAssetsForTheAssetFieldsContext = createContext<ProjectAssetsForTheAssetFields>({ kind: "not_listed_yet" });

const WATCH_NO_PROJECT_ASSETS = (): StopWatching => () => undefined;

/** The id of the field holding the value an unlinked input of the node takes. */
function pinValueFieldId(nodeId: string, portName: string): string {
  return `${nodeId}:${portName}:pin`;
}

/** Where a config field's edits go: the place its refusal shows, and the node's whole config with the field at a new value. */
interface ConfigFieldEditTarget {
  place: PlaceOfAnEdit;
  /** The node's whole config with the field at `newValue`; `null` when the entry it sits in changed under the edit. */
  configActionWithTheFieldAt: (stream: string, newValue: JsonValue) => SetNodeConfigAction | null;
  /** Adds an entry to a list of records; absent for any other field and while the stream can't be edited. */
  addAnEntry?: () => void;
}

/** A config field's control, each change written back as the node's whole config; read only while the stream can't be edited. */
function ConfigFieldControl({
  fieldId,
  field,
  node,
  streamAsset,
  graphEdits,
  editTarget,
}: {
  fieldId: string;
  field: ConfigFormField;
  node: StreamGraphNode;
  streamAsset: string | null;
  graphEdits: GraphEditsOfTheNode;
  editTarget: ConfigFieldEditTarget;
}) {
  const isTheTypesDefault = field.value_source !== "config";
  const { place } = editTarget;
  const idempotencyKeyOfTheDragInProgress = useRef<string | null>(null);
  const { control, value } = field;
  const configFieldSetTo = (stream: string, newValue: JsonValue): SetNodeConfigAction | null => {
    const configEdit = editTarget.configActionWithTheFieldAt(stream, newValue);
    if (configEdit === null) {
      graphEdits.keepTheRefusal(place, LIST_ENTRY_MOVED_ON_REFUSAL);
      return null;
    }
    graphEdits.rememberTheConfigSent(node.config, configEdit.config);
    return configEdit;
  };
  const commitTheConfigFieldValue = (newValue: (typeof field)["value"]) => {
    const configEdit = streamAsset === null ? null : configFieldSetTo(streamAsset, newValue);
    if (configEdit !== null) void graphEdits.commit(place, [configEdit]);
  };
  const commitTheWords = (words: string) => {
    const valueTyped = configValueFromTheWordsTyped(field, words);
    if (valueTyped.kind === "not_a_value") graphEdits.keepTheRefusal(place, valueTyped.because);
    else commitTheConfigFieldValue(valueTyped.value);
  };
  const isEditable = streamAsset !== null;
  switch (control.kind) {
    case "number":
      if (isEditable && control.minimum !== null && control.maximum !== null && control.maximum > control.minimum) {
        return (
          <PropertySliderField
            fieldId={fieldId}
            value={typeof value === "number" ? value : null}
            minimum={control.minimum}
            maximum={control.maximum}
            isWholeNumber={control.is_whole_number}
            isTheTypesDefault={isTheTypesDefault}
            onDragStarted={() => {
              idempotencyKeyOfTheDragInProgress.current = newGestureIdempotencyKey();
            }}
            onLiveEdit={(moved) => {
              const configEdit = configFieldSetTo(streamAsset, moved);
              if (idempotencyKeyOfTheDragInProgress.current !== null && configEdit !== null) graphEdits.sendLive(place, [configEdit], idempotencyKeyOfTheDragInProgress.current);
            }}
            onCommitted={(released) => {
              const idempotencyKeyOfTheRelease = idempotencyKeyOfTheDragInProgress.current ?? newGestureIdempotencyKey();
              idempotencyKeyOfTheDragInProgress.current = null;
              const configEdit = configFieldSetTo(streamAsset, released);
              if (configEdit !== null) void graphEdits.commit(place, [configEdit], idempotencyKeyOfTheRelease);
            }}
            valueTypedBesideTheSlider={{ label: `${nameInWords(field.key)} value`, onWordsTyped: commitTheWords }}
          />
        );
      }
      return (
        <PropertyNumberField
          fieldId={fieldId}
          value={typeof value === "number" ? value : null}
          minimum={control.minimum}
          maximum={control.maximum}
          isTheTypesDefault={isTheTypesDefault}
          onCommitted={isEditable ? commitTheWords : undefined}
        />
      );
    case "toggle":
      return <PropertyCheckbox fieldId={fieldId} isOn={value === true} isTheTypesDefault={isTheTypesDefault} onToggled={isEditable ? commitTheConfigFieldValue : undefined} />;
    case "choice":
      return (
        <PropertyChoiceField
          fieldId={fieldId}
          words={configFormFieldValueWords(value)}
          isTheTypesDefault={isTheTypesDefault}
          choices={
            isEditable
              ? control.choices.map((choice) => ({
                  words: configFormFieldValueWords(choice),
                  onChosen: () => commitTheConfigFieldValue(choice),
                }))
              : undefined
          }
        />
      );
    case "project_asset":
      return <ProjectAssetPicker fieldId={fieldId} field={field} mediaItTakes={control.media_it_takes} isTheTypesDefault={isTheTypesDefault} onChosen={isEditable ? commitTheConfigFieldValue : undefined} />;
    case "list_of_records":
      return (
        <PropertyListEntryCount
          fieldId={fieldId}
          entryCount={recordsOfAListField(value).length}
          isTheTypesDefault={isTheTypesDefault}
          addition={editTarget.addAnEntry === undefined ? undefined : { label: `Add an entry to ${nameInWords(field.key)}`, onAdded: editTarget.addAnEntry }}
        />
      );
    case "text":
    case "json":
      return (
        <PropertyTextField
          fieldId={fieldId}
          words={field.value_source === "unset" ? "" : configFormFieldValueWords(value)}
          isTheTypesDefault={isTheTypesDefault}
          onCommitted={isEditable ? commitTheWords : undefined}
        />
      );
  }
}

/** A config field naming a project asset: the asset it names, by path, in a menu of the project's assets of the media it takes; read only without `onChosen`. */
function ProjectAssetPicker({
  fieldId,
  field,
  mediaItTakes,
  isTheTypesDefault,
  onChosen,
}: {
  fieldId: string;
  field: ConfigFormField;
  mediaItTakes: string[] | null;
  isTheTypesDefault: boolean;
  onChosen: ((asset: JsonValue) => void) | undefined;
}) {
  const projectAssets = useContext(ProjectAssetsForTheAssetFieldsContext);
  const assetsListed = projectAssets.kind === "listed" ? projectAssets.assets : [];
  const assetsOffered = projectAssetsTheFieldOffers(assetsListed, mediaItTakes);
  const noneChoice = field.is_nullable && onChosen !== undefined ? [{ words: "None", onChosen: () => onChosen(null) }] : [];
  return (
    <PropertyChoiceField
      fieldId={fieldId}
      words={chosenProjectAssetWords(assetsListed, field.value_source === "unset" ? null : field.value)}
      isTheTypesDefault={isTheTypesDefault}
      noteAboveTheChoices={projectAssetPickerNote(projectAssets, mediaItTakes)}
      choices={onChosen === undefined ? undefined : [...noneChoice, ...assetsOffered.map((asset) => ({ words: asset.path, onChosen: () => onChosen(asset.asset) }))]}
    />
  );
}

/** A top-level config field's row, and for a list of records, each entry's own rows under it. */
function ConfigFieldRows({
  field,
  node,
  streamAsset,
  graphEdits,
  searchWords,
}: {
  field: ConfigFormField;
  node: StreamGraphNode;
  streamAsset: string | null;
  graphEdits: GraphEditsOfTheNode;
  searchWords: string;
}) {
  const configEditedFrom = () => graphEdits.configToEditFrom(node.config);
  const commitTheConfig = (place: PlaceOfAnEdit, configAction: SetNodeConfigAction | null) => {
    if (configAction === null) {
      graphEdits.keepTheRefusal(place, LIST_ENTRY_MOVED_ON_REFUSAL);
      return;
    }
    graphEdits.rememberTheConfigSent(node.config, configAction.config);
    void graphEdits.commit(place, [configAction]);
  };
  const fieldPlace = placeOfTheConfigField(field.key);
  const listControl = field.control.kind === "list_of_records" ? field.control : null;
  const listEditedFrom = () => configEditedFrom()[field.key] ?? field.value;
  const configWithTheList = (stream: string, list: JsonValue[] | null) => (list === null ? null : setTheConfigField(stream, node.id, configEditedFrom(), field.key, list));
  return (
    <>
      <ConfigFieldRow
        field={field}
        label={nameInWords(field.key)}
        searchWords={searchWords}
        node={node}
        streamAsset={streamAsset}
        graphEdits={graphEdits}
        editTarget={{
          place: fieldPlace,
          configActionWithTheFieldAt: (stream, newValue) => setTheConfigField(stream, node.id, configEditedFrom(), field.key, newValue),
          addAnEntry: listControl === null || streamAsset === null ? undefined : () => commitTheConfig(fieldPlace, configWithTheList(streamAsset, listWithARecordAdded(listEditedFrom(), listControl.new_item))),
        }}
        onReset={streamAsset === null ? undefined : () => commitTheConfig(fieldPlace, resetTheConfigField(streamAsset, node.id, configEditedFrom(), field.key))}
        data-config-field={field.key}
      />
      {listControl !== null &&
        recordsOfAListField(field.value).map((record, index) => {
          const entryForm = configFormOfAListEntry(listControl.item_schema, record);
          const entryLabel = `${nameInWords(field.key)} ${index}`;
          return (
            <PropertyListEntry
              key={index}
              label={entryLabel}
              removal={streamAsset === null ? undefined : { label: `Remove ${entryLabel}`, onRemoved: () => commitTheConfig(fieldPlace, configWithTheList(streamAsset, listWithoutTheRecord(listEditedFrom(), index, record))) }}
              data-config-list-entry={`${field.key}:${index}`}
            >
              {entryForm.kind === "fields" &&
                entryForm.fields.map((entryField) => {
                  const entryFieldPlace: PlaceOfAnEdit = `config:${field.key}:${index}:${entryField.key}`;
                  const configWithTheEntryFieldAt = (stream: string, newValue: JsonValue | undefined) => configWithTheList(stream, listWithTheRecordFieldSet(listEditedFrom(), index, record, entryField.key, newValue));
                  return (
                    <ConfigFieldRow
                      key={entryField.key}
                      field={entryField}
                      label={nameInWords(entryField.key)}
                      resetLabel={`Reset ${entryLabel} ${nameInWords(entryField.key)} to its type's default`}
                      node={node}
                      streamAsset={streamAsset}
                      graphEdits={graphEdits}
                      editTarget={{ place: entryFieldPlace, configActionWithTheFieldAt: configWithTheEntryFieldAt }}
                      onReset={streamAsset === null ? undefined : () => commitTheConfig(entryFieldPlace, configWithTheEntryFieldAt(streamAsset, undefined))}
                      data-config-field={`${field.key}:${index}:${entryField.key}`}
                    />
                  );
                })}
            </PropertyListEntry>
          );
        })}
    </>
  );
}

/** One config field's row: its name, its control, its reset while its value is the node's own, and the runtime's refusal of its last edit. */
function ConfigFieldRow({
  field,
  label,
  searchWords = "",
  resetLabel = `Reset ${label} to its type's default`,
  node,
  streamAsset,
  graphEdits,
  editTarget,
  onReset,
  "data-config-field": configFieldDataAttribute,
}: {
  field: ConfigFormField;
  label: string;
  searchWords?: string;
  resetLabel?: string;
  node: StreamGraphNode;
  streamAsset: string | null;
  graphEdits: GraphEditsOfTheNode;
  editTarget: ConfigFieldEditTarget;
  onReset: (() => void) | undefined;
  "data-config-field": string;
}) {
  return (
    <PropertyRow
      label={label}
      searchWords={searchWords}
      meaning={meaningOfAConfigKey(field)}
      refusal={graphEdits.refusalsByPlace.get(editTarget.place) ?? null}
      reset={onReset === undefined || field.value_source !== "config" ? undefined : { label: resetLabel, onReset }}
      data-config-field={configFieldDataAttribute}
      data-config-field-value-source={field.value_source}
    >
      {(fieldId) => <ConfigFieldControl fieldId={fieldId} field={field} node={node} streamAsset={streamAsset} graphEdits={graphEdits} editTarget={editTarget} />}
    </PropertyRow>
  );
}

/** What a config key's name shows while the pointer rests on it: its key as the code writes it, and what the schema says it means. */
function meaningOfAConfigKey(field: ConfigFormField): string {
  return field.description === null ? field.key : `${field.key} · ${field.description}`;
}

/** What a port's name shows while the pointer rests on it: what its type says it carries, and the stream facts it reads. */
function meaningOfAPort(port: StreamGraphDeclaredPort, catalogPorts: NodeCatalogPort[], facts: Pick<StreamGraphDeclaredPort, "stream_facts" | "values_checked">): string | undefined {
  const description = catalogPorts.find((catalogPort) => catalogPort.name === port.name)?.description;
  const factsWords = portStreamFactsWords(facts);
  const meaning = [
    description === undefined || description === "" ? null : description,
    factsWords.length > 0 ? factsWords.join(" · ") : null,
    facts.values_checked === false ? VALUES_UNCHECKED_MEANING : null,
  ]
    .filter((words): words is string => words !== null)
    .join("\n");
  return meaning === "" ? undefined : meaning;
}

function PortRowsOfOneDirection({
  direction,
  firstBandIndex,
  graph,
  node,
  streamName,
  streamAsset,
  catalogPorts,
  graphEdits,
  blankTargetPickers,
  onBlankTargetPickersChanged,
  targetPickingInTheStreamGraph,
  pickInTheStreamGraph,
  portNamesListed,
  searchWords,
}: {
  direction: "input" | "output";
  /** Where this direction's bands fall in the panel's alternation, so Outputs carries on from Inputs. */
  firstBandIndex: number;
  graph: StreamGraphSummary;
  node: StreamGraphNode;
  streamName: string;
  streamAsset: string | null;
  catalogPorts: NodeCatalogPort[];
  graphEdits: GraphEditsOfTheNode;
  blankTargetPickers: BlankTargetPickersOfTheNode;
  onBlankTargetPickersChanged: (changeTheBlankTargetPickers: (blankTargetPickers: BlankTargetPickersOfTheNode) => BlankTargetPickersOfTheNode) => void;
  /** The picker whose port is being picked in the Stream graph, as `<place>/<target key>`; `null` while none is. */
  targetPickingInTheStreamGraph: string | null;
  pickInTheStreamGraph: PickInTheStreamGraphForATarget;
  /** The ports a search over the properties keeps, by name. */
  portNamesListed: ReadonlySet<string>;
  searchWords: string;
}) {
  const ports = direction === "input" ? node.input_ports : node.output_ports;
  if (ports.length === 0) return <p className="px-1 text-xs text-fg-3">None</p>;
  return ports
    .filter((port) => portNamesListed.has(port.name))
    .map((port, portIndex) => {
    const place: PlaceOfAnEdit = `${direction}:${port.name}`;
    const linkedEnds = linkedEndsOfThePort(graph, node, direction, port.name);
    const facts = direction === "input" ? streamFactsAnInputReceives(graph, node.name, port) : port;
    const familyWords = port.family === null ? "Unknown" : nodeGraphPinFamilyWords(port.family);
    const pinValue = node.pins[port.name];
    const blankPickerKeys = blankTargetPickerKeysOfThePort(blankTargetPickers, node.id, port.name);
    const note = portsToConnectNote(direction, streamName, familyWords);
    const choicesOfAPicker = (stream: string, replacing: LinkedEndOfAPort | null, whenConnected: () => void) => () =>
      portsToConnect(stream, graph, node, direction, port, replacing).map((portToConnect) => ({
        nodeTitle: portToConnect.nodeTitle,
        port: portToConnect.port,
        cannotBecause: portToConnect.cannotBecause,
        choiceKey: portToConnect.choiceKey,
        onChosen: () =>
          void graphEdits.commit(place, portToConnect.connecting).then((isApplied) => {
            if (isApplied) whenConnected();
          }),
      }));
    const pickingOfATarget = (stream: string, targetKey: string, replacing: LinkedEndOfAPort | null, whenConnected: () => void): PropertyPortTarget["pickInTheStreamGraph"] => {
      const targetId = `${node.id}/${place}/${targetKey}`;
      return {
        isPicking: targetPickingInTheStreamGraph === targetId,
        onToggled: (isPicking) =>
          pickInTheStreamGraph(targetId, isPicking, { node: node.id, port: port.name, direction }, place, (picked, graphWhenPicked) => {
            const nodeWhenPicked = graphWhenPicked.nodes.find((graphNode) => graphNode.id === node.id) ?? node;
            const joining = connectingThePortPicked(stream, graphWhenPicked, nodeWhenPicked, direction, port, replacing, picked);
            if (joining.kind === "cannot_join") {
              graphEdits.keepTheRefusal(place, joining.because);
              return;
            }
            void graphEdits.commit(place, joining.connecting).then((isApplied) => {
              if (isApplied) whenConnected();
            });
          }),
      };
    };
    const linkedTargets: PropertyPortTarget[] =
      streamAsset === null
        ? []
        : linkedEnds.map((linkedEnd) => {
            const targetKey = `${linkedEnd.node.id}:${linkedEnd.port}`;
            return {
              linkedWith: { nodeTitle: nodeTitle(linkedEnd.node.name, linkedEnd.node.type), port: linkedEnd.port },
              targetKey,
              note,
              choicesWhenOpened: choicesOfAPicker(streamAsset, linkedEnd, () => undefined),
              onRemoved: () => void graphEdits.commit(place, [disconnectTheLink(streamAsset, node, direction, port.name, linkedEnd)]),
              pickInTheStreamGraph: pickingOfATarget(streamAsset, targetKey, linkedEnd, () => undefined),
            };
          });
    const blankTargets: PropertyPortTarget[] =
      streamAsset === null
        ? []
        : blankPickerKeys.map((blankPickerKey) => {
            const removeThisBlankPicker = () => onBlankTargetPickersChanged((pickers) => withoutTheBlankTargetPicker(pickers, node.id, port.name, blankPickerKey));
            return {
              linkedWith: null,
              targetKey: blankPickerKey,
              note,
              isOpenAtFirst: blankTargetPickers.justAddedKey === blankPickerKey,
              choicesWhenOpened: choicesOfAPicker(streamAsset, null, removeThisBlankPicker),
              onRemoved: removeThisBlankPicker,
              pickInTheStreamGraph: pickingOfATarget(streamAsset, blankPickerKey, null, removeThisBlankPicker),
            };
          });
    return (
      <PropertyPortRow
        key={place}
        direction={direction}
        portName={port.name}
        searchWords={searchWords}
        familyWords={familyWords}
        pinMark={<NodeGraphPinMark family={port.family} />}
        meaning={meaningOfAPort(port, catalogPorts, facts)}
        bandShade={(firstBandIndex + portIndex) % 2 === 0 ? "first" : "second"}
        refusal={graphEdits.refusalsByPlace.get(place) ?? null}
        targets={[...linkedTargets, ...blankTargets]}
        addition={
          streamAsset === null
            ? undefined
            : {
                disabledReason: whyThePortTakesNoOtherTarget(direction, linkedEnds.length, blankPickerKeys.length),
                onAdded: () => onBlankTargetPickersChanged((pickers) => withABlankTargetPickerAdded(pickers, node.id, port.name, crypto.randomUUID())),
              }
        }
        unlinkedValue={
          direction === "input" && streamAsset !== null ? (
            <PropertyTextField
              fieldId={pinValueFieldId(node.id, port.name)}
              words={pinValue === undefined ? "" : configFormFieldValueWords(pinValue)}
              isTheTypesDefault={pinValue === undefined}
              label={`Value of ${port.name}`}
              onCommitted={(words) =>
                void graphEdits.commit(place, [
                  {
                    operation: "set_pin_value",
                    stream: streamAsset,
                    node: node.id,
                    input: port.name,
                    value: words.trim() === "" ? null : pinValueFromTheWordsTyped(words),
                  },
                ])
              }
            />
          ) : undefined
        }
      />
    );
  });
}

/** Start picking the port of the picker `targetId` in the Stream graph, or end that pick; `whenPicked` takes the other end the person picked. */
type PickInTheStreamGraphForATarget = (
  targetId: string,
  isPicking: boolean,
  pick: Omit<PortPickInTheStreamGraph, "stream">,
  place: PlaceOfAnEdit,
  whenPicked: (picked: { node: string; port: string }, graphWhenPicked: StreamGraphSummary) => void,
) => void;

/** The place an edit of a config field, or exposing it as a Graph Input, shows its refusal under. */
function placeOfTheConfigField(fieldKey: string): PlaceOfAnEdit {
  return `config:${fieldKey}`;
}

/** Expose as a Graph Input ▾: each number or on-off config field the node does not yet take as an input, chosen to drive it from a new Graph Input of the stream; nothing when every one already is. */
function ExposeAConfigFieldAsAGraphInputMenu({ node, fields, streamAsset, graphEdits }: { node: StreamGraphNode; fields: ConfigFormField[]; streamAsset: string; graphEdits: GraphEditsOfTheNode }) {
  const fieldsToExpose = configFieldsToExposeAsGraphInputs(node, fields);
  if (fieldsToExpose.length === 0) return null;
  return (
    <div className="flex justify-end">
      <FieldMenu label="Expose a config field as a Graph Input" words="Expose as a Graph Input" size="compact" menuWidth="wide" menuAlignment="end" data-properties-expose-as-a-graph-input={node.id}>
        <MenuNote>Each becomes an input of the node, fed by a new Graph Input that Perform's Controls list.</MenuNote>
        {fieldsToExpose.map((field) => (
          <MenuItem
            key={field.key}
            onChosen={() => void graphEdits.commit(placeOfTheConfigField(field.key), exposeTheConfigFieldAsAGraphInput(streamAsset, node, field))}
            data-properties-expose-config-field={field.key}
          >
            {nameInWords(field.key)}
          </MenuItem>
        ))}
      </FieldMenu>
    </div>
  );
}

/** A view node's row naming how many areas show its view, with Show in an area to show it in another; nothing for a node that is not a view's. */
function ViewNodeShownInAreasRow({ connection, viewTypeId }: { connection: TatoAppViewConnection; viewTypeId: string }) {
  const areasReading = useViewReading(useCallback((listener: (reading: AreasForAViewTypeReading) => void): StopWatching => connection.watchAreasForTheViewType(viewTypeId, listener), [connection, viewTypeId]));
  const [showingRefusal, showTheRefusalOf] = useRefusalOfTheLatestAsk();
  if (areasReading === null || areasReading.kind === "not_a_view_type") return null;
  if (areasReading.kind === "no_areas") {
    return (
      <PropertyRow label="Shown in" data-properties-view-shown-in={viewTypeId}>
        {() => <p className="text-xs text-fg-3">{areasReading.because}</p>}
      </PropertyRow>
    );
  }
  const areasOffered = areasToShowTheViewIn(areasReading.areas);
  return (
    <PropertyRow label="Shown in" refusal={showingRefusal === null ? null : `${showingRefusal.lead} ${showingRefusal.because}`} data-properties-view-shown-in={viewTypeId}>
      {() => (
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span role="status" aria-label={`Shown in: ${viewShownInAreasWords(areasReading.areas)}`} className="text-xs whitespace-nowrap text-fg-2" data-properties-view-shown-in-words>
            {viewShownInAreasWords(areasReading.areas)}
          </span>
          <FieldMenu label={`Show ${areasReading.view_title} in an area`} words="Show in an area" size="compact" menuWidth="wide" menuAlignment="end" data-properties-show-in-an-area={viewTypeId}>
            <MenuNote>Areas of the layout shown</MenuNote>
            {areasOffered.length === 0 ? (
              <MenuNote>Every other area shows {areasReading.view_title}.</MenuNote>
            ) : (
              areasOffered.map((area) => (
                <MenuItem key={area.area_id} onChosen={() => showTheRefusalOf(`${areasReading.view_title} wasn't shown:`, connection.showViewTypeInArea(viewTypeId, area.area_id))} data-properties-show-in-area={area.area_id}>
                  {area.words}
                </MenuItem>
              ))
            )}
          </FieldMenu>
        </div>
      )}
    </PropertyRow>
  );
}

/** The selected node's name, its config as controls that edit it, and its inputs and outputs with what each joins. */
function PropertiesOfTheSelectedNode({
  connection,
  stream,
  nodeName,
  graphEditsInTheProject,
  searchWords,
}: {
  connection: TatoAppViewConnection;
  stream: string;
  nodeName: string;
  graphEditsInTheProject: GraphEditsInTheOpenProject;
  searchWords: string;
}) {
  const watchTheStreamsGraph = useCallback((listener: (reading: StreamGraphReading) => void): StopWatching => connection.watchStreamGraph(stream, listener), [connection, stream]);
  const watchTheStreamsCatalog = useCallback((listener: (reading: NodeCatalogReading) => void): StopWatching => connection.watchNodeCatalog(stream, listener), [connection, stream]);
  const graphReading = useViewReading(watchTheStreamsGraph);
  const catalogReading = useViewReading(watchTheStreamsCatalog);
  const listedStreams = useViewReading(connection.watchListedStreams);
  const nodeShownWhileItWasSelectedByName = useRef<{ nodeName: string; nodeId: string } | null>(null);
  const [blankTargetPickers, setBlankTargetPickers] = useState<BlankTargetPickersOfTheNode>(NO_BLANK_TARGET_PICKERS);
  const [targetPickingInTheStreamGraph, setTargetPickingInTheStreamGraph] = useState<string | null>(null);
  const isPickingInTheStreamGraph = useRef(false);
  useEffect(() => {
    isPickingInTheStreamGraph.current = targetPickingInTheStreamGraph !== null;
    if (targetPickingInTheStreamGraph === null) return;
    const endThePickOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) void connection.endThePortPick();
    };
    document.addEventListener("keydown", endThePickOnEscape);
    return () => document.removeEventListener("keydown", endThePickOnEscape);
  }, [targetPickingInTheStreamGraph, connection]);
  const graph = graphReading?.kind === "read" ? graphReading.graph : null;
  const nodeSelectedByName = graph?.nodes.find((graphNode) => graphNode.name === nodeName);
  const nodeRenamedSinceItWasSelected =
    nodeSelectedByName === undefined && nodeShownWhileItWasSelectedByName.current?.nodeName === nodeName
      ? graph?.nodes.find((graphNode) => graphNode.id === nodeShownWhileItWasSelectedByName.current?.nodeId)
      : undefined;
  const node = nodeSelectedByName ?? nodeRenamedSinceItWasSelected;
  if (nodeSelectedByName !== undefined) nodeShownWhileItWasSelectedByName.current = { nodeName, nodeId: nodeSelectedByName.id };
  const graphEdits = graphEditsInTheProject.ofTheNode(node?.id ?? "");
  const latestGraph = useRef(graph);
  useEffect(() => {
    latestGraph.current = graph;
  }, [graph]);
  const nodeIdShown = node?.id;
  useEffect(
    () => () => {
      if (isPickingInTheStreamGraph.current) void connection.endThePortPick();
    },
    [nodeIdShown, connection],
  );
  const pickInTheStreamGraph: PickInTheStreamGraphForATarget = (targetId, isPicking, pick, place, whenPicked) => {
    if (!isPicking) {
      void connection.endThePortPick();
      return;
    }
    setTargetPickingInTheStreamGraph(targetId);
    void connection.pickAPortInTheStreamGraph({ ...pick, stream }).then((ending) => {
      setTargetPickingInTheStreamGraph((picking) => (picking === targetId ? null : picking));
      const graphWhenPicked = latestGraph.current;
      if (ending.kind === "picked" && graphWhenPicked !== null) whenPicked(ending, graphWhenPicked);
      else if (ending.kind === "not_started") graphEdits.keepTheRefusal(place, ending.because);
    });
  };
  const catalogEntry: NodeCatalogEntry | undefined = catalogReading?.kind === "listed" && node !== undefined ? catalogReading.catalog.node_types.find((entry) => entry.type === node.type) : undefined;
  const configForm = useMemo(() => (node === undefined ? null : configFormOf(catalogEntry?.config_schema ?? null, node.config)), [node, catalogEntry]);
  const nameTheNodeGoesByNow = node?.name;
  useEffect(() => {
    if (nameTheNodeGoesByNow !== undefined && nameTheNodeGoesByNow !== nodeName)
      void connection.select({
        kind: "node",
        stream,
        node: nameTheNodeGoesByNow,
      });
  }, [connection, stream, nodeName, nameTheNodeGoesByNow]);

  if (graphReading === null) return null;
  if (graphReading.kind === "not_read") return <WaitingState title={`${nodeName} can't be read`} explanation={graphReading.because} data-properties-state="graph_not_read" />;
  if (graph === null || node === undefined || configForm === null)
    return <WaitingState title={`${nodeName} is gone`} explanation="Its stream's graph no longer has it." data-properties-state="node_gone" />;
  const streamAsset = graph.stream_asset;
  const listedStream = listedStreams?.kind === "listed" ? listedStreams.streams.find((candidate) => candidate.stream === stream) : undefined;
  const streamName = listedStream?.display_name ?? stream;
  const typeClassName = nodeTypeClassName(node.type);
  const imageOutputs = node.output_ports.filter((port) => port.family === "image");
  const refusalOfTheName = graphEdits.refusalsByPlace.get("name");
  const configFields = configForm.kind === "fields" ? configForm.fields : [];
  const matching = propertiesMatchingTheSearch(
    configFields.map((field) => field.key),
    node.input_ports.map((port) => port.name),
    node.output_ports.map((port) => port.name),
    searchWords,
  );
  const configFieldsListed = configFields.filter((field) => matching.config_keys_listed.has(field.key));
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-properties-of-node={node.name}>
      <header className="flex min-w-0 flex-col gap-0.5 border-b px-3 py-2">
        <PropertyHeadingNameField
          label="Node name"
          name={nodeTitle(node.name, node.type)}
          onCommitted={
            streamAsset === null
              ? undefined
              : (name) => {
                  void graphEdits.commit("name", [{ operation: "rename_node", stream: streamAsset, node: node.id, name }]);
                }
          }
        />
        <div className="flex min-w-0 items-center gap-2 px-1">
          <span
            className="min-w-0 truncate text-xs text-fg-3"
            title={catalogEntry?.description === undefined || catalogEntry.description === "" ? node.type : `${node.type} · ${catalogEntry.description}`}
          >
            {typeClassName}
          </span>
          <span className="ml-auto shrink-0 font-mono text-2xs text-fg-3" title={node.id} data-properties-node-id={node.id}>
            {nodeIdInShort(node.id)}
          </span>
        </div>
      </header>
      {refusalOfTheName !== undefined && (
        <div data-property-refusal>
          <RefusalLine words={refusalOfTheName} layout="bar" />
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
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
        {node.state !== "Error" && node.process_raising_because !== null && (
          <div data-properties-node-process-raising={node.name}>
            <FailureBanner place="panel">This node is running, but its process() keeps raising.</FailureBanner>
            <div className="border-b px-3 py-2.5">
              <RuntimeFailureWords words={node.process_raising_because} data-properties-process-raising-because={node.name} />
            </div>
          </div>
        )}
        {streamAsset === null && <p className="border-b px-3 py-1.5 text-xs text-fg-3">This runtime names no stream asset for {streamName}, so its nodes can't be edited from here.</p>}
        {matching.is_searching && (
          <p role="status" className="border-b px-3 py-1.5 text-xs text-fg-3" data-properties-listed-count="">
            {propertiesListedWords(matching)}
          </p>
        )}
        {(!matching.is_searching || configFieldsListed.length > 0) && (
          <PropertySection title="Config">
            {matching.is_searching ? (
              configFieldsListed.map((field) => <ConfigFieldRows key={field.key} field={field} node={node} streamAsset={streamAsset} graphEdits={graphEdits} searchWords={searchWords} />)
            ) : (
              <>
                <ViewNodeShownInAreasRow connection={connection} viewTypeId={node.type} />
                {configForm.kind === "takes_no_config" ? (
                  <p className="px-1 text-xs text-fg-3">{nameInWords(typeClassName)} takes no config.</p>
                ) : configForm.fields.length === 0 ? (
                  <p className="px-1 text-xs text-fg-3">{catalogReading?.kind === "not_listed" ? catalogReading.because : "No config."}</p>
                ) : (
                  configForm.fields.map((field) => <ConfigFieldRows key={field.key} field={field} node={node} streamAsset={streamAsset} graphEdits={graphEdits} searchWords="" />)
                )}
                {streamAsset !== null && configForm.kind === "fields" && <ExposeAConfigFieldAsAGraphInputMenu node={node} fields={configForm.fields} streamAsset={streamAsset} graphEdits={graphEdits} />}
              </>
            )}
          </PropertySection>
        )}
        {(!matching.is_searching || matching.input_ports_listed.size > 0) && (
          <PropertySection title="Inputs" data-properties-section="inputs">
            <PortRowsOfOneDirection
              direction="input"
              firstBandIndex={0}
              graph={graph}
              node={node}
              streamName={streamName}
              streamAsset={streamAsset}
              catalogPorts={catalogEntry?.inputs ?? []}
              graphEdits={graphEdits}
              blankTargetPickers={blankTargetPickers}
              onBlankTargetPickersChanged={setBlankTargetPickers}
              targetPickingInTheStreamGraph={targetPickingInTheStreamGraph}
              pickInTheStreamGraph={pickInTheStreamGraph}
              portNamesListed={matching.input_ports_listed}
              searchWords={searchWords}
            />
          </PropertySection>
        )}
        {(!matching.is_searching || matching.output_ports_listed.size > 0) && (
          <PropertySection title="Outputs" data-properties-section="outputs">
            <PortRowsOfOneDirection
              direction="output"
              firstBandIndex={node.input_ports.filter((port) => matching.input_ports_listed.has(port.name)).length}
              graph={graph}
              node={node}
              streamName={streamName}
              streamAsset={streamAsset}
              catalogPorts={catalogEntry?.outputs ?? []}
              graphEdits={graphEdits}
              blankTargetPickers={blankTargetPickers}
              onBlankTargetPickersChanged={setBlankTargetPickers}
              targetPickingInTheStreamGraph={targetPickingInTheStreamGraph}
              pickInTheStreamGraph={pickInTheStreamGraph}
              portNamesListed={matching.output_ports_listed}
              searchWords={searchWords}
            />
            {imageOutputs
              .filter((port) => matching.output_ports_listed.has(port.name))
              .map((port) => (
                <div key={port.name} className="flex justify-end">
                  <ActionButton
                    appearance="secondary"
                    size="small"
                    onPressed={() =>
                      void connection.openView("viewer", {
                        kind: "port",
                        target: { stream, node_id: node.id, port: port.name },
                      })
                    }
                  >
                    Visualize {port.name}
                  </ActionButton>
                </div>
              ))}
          </PropertySection>
        )}
      </div>
    </div>
  );
}

/** How many nodes are selected together and their titles, in place of fields that would belong to no one node. */
function SummaryOfTheSeveralSelectedNodes({ connection, stream, nodeNames }: { connection: TatoAppViewConnection; stream: string; nodeNames: readonly string[] }) {
  const watchTheStreamsGraph = useCallback((listener: (reading: StreamGraphReading) => void): StopWatching => connection.watchStreamGraph(stream, listener), [connection, stream]);
  const graphReading = useViewReading(watchTheStreamsGraph);
  const { title, explanation } = wordsForTheSeveralSelectedNodes(nodeNames, graphReading?.kind === "read" ? graphReading.graph.nodes : []);
  return <WaitingState title={title} explanation={explanation} data-properties-state="several_nodes" />;
}

function PropertiesBody({ connection }: { connection: TatoAppViewConnection }) {
  const selection = useViewReading(connection.watchSelection);
  const activeStreamTab = useViewReading(connection.watchActiveStreamTab);
  const openProject = useViewReading(connection.watchOpenProject);
  const projectFolder = openProject?.kind === "read" ? openProject.open_project.project.folder : null;
  const graphEditsInTheProject = useGraphEditsInTheOpenProject(connection, projectFolder);
  const watchTheProjectsAssets = useCallback(
    (listener: (reading: ProjectAssetsReading) => void): StopWatching => (projectFolder === null ? WATCH_NO_PROJECT_ASSETS() : connection.watchProjectAssets(projectFolder, listener)),
    [connection, projectFolder],
  );
  const projectAssets = projectAssetsForTheAssetFieldsOf(useViewReading(watchTheProjectsAssets));
  const [searchWords, setSearchWords] = useState("");
  if (selection?.kind === "nodes" && activeStreamTab?.stream === selection.stream) {
    return <SummaryOfTheSeveralSelectedNodes connection={connection} stream={selection.stream} nodeNames={selection.nodes} />;
  }
  if (selection?.kind !== "node" || activeStreamTab?.stream !== selection.stream) {
    return <WaitingState title="Nothing to show" explanation="Select a node in the stream graph to edit its config and see what it's connected to." data-properties-state="no_node" />;
  }
  return (
    <>
      <StudioViewToolbarTools label="Properties search">
        <SearchField label="Search properties" placeholder="Search properties" text={searchWords} onTextChanged={setSearchWords} width="fills_the_row" data-properties-search="" />
      </StudioViewToolbarTools>
      <ProjectAssetsForTheAssetFieldsContext.Provider value={projectAssets}>
        <PropertiesOfTheSelectedNode
          key={selection.stream}
          connection={connection}
          stream={selection.stream}
          nodeName={selection.node}
          graphEditsInTheProject={graphEditsInTheProject}
          searchWords={searchWords}
        />
      </ProjectAssetsForTheAssetFieldsContext.Provider>
    </>
  );
}

/** The Properties view's whole frame: the selection's properties, under its header row. */
export function PropertiesView({ connection }: { connection: TatoAppViewConnection }) {
  return (
    <CoreViewFrame connection={connection} toolbarLabel="Properties tools">
      <PropertiesBody connection={connection} />
    </CoreViewFrame>
  );
}
