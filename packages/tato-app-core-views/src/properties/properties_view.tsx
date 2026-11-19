import { useViewReading } from "@tatolab/tato-app-view-sdk/design_system/view_readings";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { SearchField } from "@tatolab/tato-app-view-sdk/design_system/search_field";
import { StudioViewToolbarTools } from "@tatolab/tato-app-view-sdk/design_system/studio_area_frame";
import { NodeGraphPinMark } from "@tatolab/tato-app-view-sdk/design_system/node_graph/node_card";
import { pinWords } from "@tatolab/tato-app-view-sdk/pin_model/pin_type_words";
import { takesAControl } from "@tatolab/tato-app-view-sdk/pin_model/controlled_inputs";
import type { GraphAddress, InputAddress } from "@tatolab/tato-app-view-sdk/pin_model/node_inputs";
import type { InputValues } from "@tatolab/tato-app-view-sdk/pin_services/input_values";
import {
  InputControlBinderContext,
  InputControlMount,
  InputValueWords,
  useInputControlsOfTheFrame,
  useInputValuesOfTheStream,
  useOwnFieldOfTheInput,
  useRefusalOfTheInput,
  useWhereTheInputsValueComesFrom,
} from "@tatolab/tato-app-view-sdk/design_system/input_control_mount";
import type { NodePin } from "@tatolab/tato-app-view-sdk/pin_model/node_pins";
import { portFamilyWords } from "@tatolab/tato-app-view-sdk/port_families";
import { ActionButton } from "@tatolab/tato-app-view-sdk/design_system/action_button";
import { FailureBanner } from "@tatolab/tato-app-view-sdk/design_system/failure_banner";
import { RefusalLine } from "@tatolab/tato-app-view-sdk/design_system/refusal_line";
import { RuntimeFailureWords } from "@tatolab/tato-app-view-sdk/design_system/runtime_failure_words";
import {
  PropertyAssetField,
  PropertyCheckbox,
  PropertyChoiceField,
  PropertyHeadingNameField,
  PropertyListEntry,
  PropertyListEntryCount,
  PropertyNumberField,
  PropertyPortRow,
  PropertyRow,
  type PropertyPortBandShade,
  PropertySection,
  PropertySliderField,
  PropertyTextField,
} from "@tatolab/tato-app-view-sdk/design_system/property_fields";
import { WaitingState } from "@tatolab/tato-app-view-sdk/design_system/waiting_state";
import { newGestureIdempotencyKey, type AreasForAViewTypeReading, type StopWatching, type TatoAppViewConnection } from "@tatolab/tato-app-view-sdk";
import { FieldMenu, MenuItem, MenuNote } from "@tatolab/tato-app-view-sdk/design_system/menus";
import {
  inputValueReadOfThePort,
  jsonObjectMembersOf,
  type InputValueComesFrom,
  type JsonValue,
  nodeTypeDescriptionsByType,
  type NodeTypeDescription,
  type ProjectAssetsReading,
  type StreamGraph,
  type StreamGraphNode,
  type StreamGraphPort,
  type StreamGraphReading,
} from "@tatolab/tato-app-view-sdk/studio_readings";
import { useNodeTypesOfTheProject } from "../shared/use_node_types_of_the_project";
import { CoreViewFrame } from "../shared/core_view_page";
import { useRefusalOfTheLatestAsk } from "../shared/refusal_of_the_latest_ask";
import { VALUES_UNCHECKED_MEANING } from "../shared/port_stream_facts_words";
import { nameInWords, nodeTitle, nodeTypeClassName, wordsForTheSeveralSelectedNodes } from "../shared/node_words";
import { configFormFieldValueWords, configFormOf, configFormOfAListEntry, configSchemaOfTheSettings, recordsOfAListField, type ConfigFormField } from "./config_form_fields";
import { propertiesListedWords, propertiesMatchingTheSearch } from "./properties_matching_the_search";
import { areasToShowTheViewIn, viewShownInAreasWords } from "./view_node_areas";
import { chosenProjectAssetOf, chosenProjectAssetWords, projectAssetsForTheAssetFieldsOf } from "./project_asset_choices";
import { previewPictureUrlOf } from "../library/library_asset_preview_pictures";
import { useAssetPreviewPicturesOfTheProject } from "../library/use_asset_preview_pictures_of_the_project";
import { useGraphEditsInTheOpenProject, type GraphEditsInTheOpenProject, type GraphEditsOfTheNode, type PlaceOfAnEdit } from "./graph_edits_in_the_open_project";
import { streamGraphLevelAtTheSubgraphIds } from "../stream_graph/stream_graph_levels";
import { nodeInputs, nodeOutputs } from "../shared/node_pins_of_the_graph";
import { selectionOfTheNodes } from "../shared/nodes_of_the_selection";
import { inputRowStateOf } from "./input_row_state";


/** The stream's own level, which a node selection with no `level` is at. */
const NO_LEVEL: readonly string[] = [];
import {
  configFieldsToExposeAsGraphInputs,
  configValueFromTheWordsTyped,
  exposeTheConfigFieldAsAGraphInput,
  LIST_ENTRY_MOVED_ON_REFUSAL,
  linkDrivingTheInputTakenOut,
  linkedEndsOfThePort,
  listWithARecordAdded,
  listWithoutTheRecord,
  listWithTheRecordFieldSet,
  nodeIdInShort,
  pinValueFromTheWordsTyped,
  promoteToGraphInput,
  resetTheConfigField,
  setTheConfigField,
  type SetNodeConfigAction,
} from "./properties_graph_edits";

/** The open project a config field naming an asset reads its assets from and opens the asset picker through; `null` while no project is open. */
interface OpenProjectOfTheAssetFields {
  connection: TatoAppViewConnection;
  projectFolder: string;
}

const OpenProjectOfTheAssetFieldsContext = createContext<OpenProjectOfTheAssetFields | null>(null);

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
    graphEdits.rememberTheConfigSent(jsonObjectMembersOf(node.config), configEdit.config);
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
      return (
        <ProjectAssetFieldOfTheConfig
          fieldId={fieldId}
          field={field}
          mediaItTakes={control.media_it_takes}
          isTheTypesDefault={isTheTypesDefault}
          onChosen={isEditable ? commitTheConfigFieldValue : undefined}
          onPickNotStarted={(because) => graphEdits.keepTheRefusal(place, because)}
        />
      );
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

/** What a config field naming a project asset is handed: its value, the media it takes, whether it is the type's default, what choosing an asset does, read only without `onChosen`, and where a picker that did not open says why. */
interface ProjectAssetFieldOfTheConfigProps {
  fieldId: string;
  field: ConfigFormField;
  mediaItTakes: string[] | null;
  isTheTypesDefault: boolean;
  onChosen: ((asset: JsonValue) => void) | undefined;
  onPickNotStarted: (because: string) => void;
}

/** A config field naming a project asset: the asset it names, by path with its picture, beside a button that opens Studio's asset picker; the value as written while no project is open. */
function ProjectAssetFieldOfTheConfig(props: ProjectAssetFieldOfTheConfigProps) {
  const openProject = useContext(OpenProjectOfTheAssetFieldsContext);
  if (openProject === null) {
    const { fieldId, field, isTheTypesDefault } = props;
    return <PropertyAssetField fieldId={fieldId} words={chosenProjectAssetWords([], field.value_source === "unset" ? null : field.value)} previewPictureUrl={null} isTheTypesDefault={isTheTypesDefault} />;
  }
  return <ProjectAssetFieldOfTheOpenProject key={openProject.projectFolder} {...props} openProject={openProject} />;
}

function ProjectAssetFieldOfTheOpenProject({
  fieldId,
  field,
  mediaItTakes,
  isTheTypesDefault,
  onChosen,
  onPickNotStarted,
  openProject: { connection, projectFolder },
}: ProjectAssetFieldOfTheConfigProps & { openProject: OpenProjectOfTheAssetFields }) {
  const watchTheProjectsAssets = useCallback((listener: (reading: ProjectAssetsReading) => void): StopWatching => connection.watchProjectAssets(projectFolder, listener), [connection, projectFolder]);
  const projectAssets = projectAssetsForTheAssetFieldsOf(useViewReading(watchTheProjectsAssets));
  const previewPictures = useAssetPreviewPicturesOfTheProject(connection, projectFolder);
  const [isThePickerOpen, setIsThePickerOpen] = useState(false);
  const assetsListed = projectAssets.kind === "listed" ? projectAssets.assets : [];
  const value = field.value_source === "unset" ? null : field.value;
  const chosenAsset = chosenProjectAssetOf(assetsListed, value);
  const chooseAnAsset = (whenChosen: (asset: JsonValue) => void) => {
    setIsThePickerOpen(true);
    void connection.pickAProjectAsset({ media: mediaItTakes, chosen_now: chosenAsset?.asset ?? null }).then((ending) => {
      setIsThePickerOpen(false);
      if (ending.kind === "chosen") whenChosen(ending.asset);
      else if (ending.kind === "not_started") onPickNotStarted(ending.because);
    });
  };
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <PropertyAssetField
        fieldId={fieldId}
        words={chosenProjectAssetWords(assetsListed, value)}
        previewPictureUrl={chosenAsset === null ? null : previewPictureUrlOf(previewPictures?.pictureOf(chosenAsset) ?? null)}
        isTheTypesDefault={isTheTypesDefault}
        choosing={onChosen === undefined ? undefined : { label: `Choose an asset for ${nameInWords(field.key)}…`, disabledReason: isThePickerOpen ? "The asset picker is open." : null, onChooseAsked: () => chooseAnAsset(onChosen) }}
        clearing={onChosen === undefined || !field.is_nullable || value === null || value === "" ? undefined : { label: `Choose no asset for ${nameInWords(field.key)}`, onCleared: () => onChosen(null) }}
      />
      {projectAssets.kind === "refused" && <RefusalLine lead="The project's assets weren't listed:" words={projectAssets.because} data-property-asset-listing-refusal="" />}
    </div>
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
  const configEditedFrom = () => graphEdits.configToEditFrom(jsonObjectMembersOf(node.config));
  const commitTheConfig = (place: PlaceOfAnEdit, configAction: SetNodeConfigAction | null) => {
    if (configAction === null) {
      graphEdits.keepTheRefusal(place, LIST_ENTRY_MOVED_ON_REFUSAL);
      return;
    }
    graphEdits.rememberTheConfigSent(jsonObjectMembersOf(node.config), configAction.config);
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

/** What a port's name shows while the pointer rests on it: the stream facts it reads, and that a Records port's values are not checked. */
function meaningOfAPort(pin: Pick<NodePin, "stream_facts_words">, port: Pick<StreamGraphPort, "values_checked">): string | undefined {
  const meaning = [pin.stream_facts_words.length > 0 ? pin.stream_facts_words.join(" · ") : null, port.values_checked === false ? VALUES_UNCHECKED_MEANING : null]
    .filter((words): words is string => words !== null)
    .join("\n");
  return meaning === "" ? undefined : meaning;
}

/** A pin's type and flow in words; a pin with no exact type says so, with its family. */
function typeWordsOfThePin(pin: Pick<NodePin, "pin" | "family">): string {
  return pin.pin === null && pin.family !== null ? `${pinWords(null)} · ${portFamilyWords(pin.family)}` : pinWords(pin.pin);
}

/** Where the value an unwired input shows comes from, in a word. */
const COMES_FROM_WORDS: Record<Exclude<InputValueComesFrom, "wire">, string> = { live: "Live", saved: "Saved", default: "Default" };

/** The place an input's own edits, a disconnect or a promotion, show their refusal under. */
function placeOfTheInput(input: string): PlaceOfAnEdit {
  return `input:${input}`;
}

/** What every input row of the selected node reads and sends through. */
interface InputRowsOfTheNode {
  connection: TatoAppViewConnection;
  stream: string;
  level: readonly string[];
  graph: StreamGraph;
  node: StreamGraphNode;
  /** The stream's asset, which every edit names; `null` where the graph can't be edited. */
  streamAsset: string | null;
  /** The frame's store, which a promotion reads the value an input shows from. */
  inputValues: InputValues;
  graphEdits: GraphEditsOfTheNode;
  searchWords: string;
}

/**
 * One input of the node, as its card draws it, wider, in the state `inputRowStateOf` decides: a wired input names each node
 * and pin that drive it, with a way there and a disconnect; an unwired one draws the control its card draws, or the panel's
 * own field where the table has none, says where the store's value comes from, and offers Reset to default and Promote to a
 * Graph Input.
 */
function InputRowOfTheNode({ pin, port, bandShade, rows }: { pin: NodePin; port: StreamGraphPort; bandShade: PropertyPortBandShade; rows: InputRowsOfTheNode }) {
  const { connection, stream, level, graph, node, streamAsset, inputValues, graphEdits, searchWords } = rows;
  const place = placeOfTheInput(pin.name);
  const state = inputRowStateOf({ input: pin, value_comes_from: inputValueReadOfThePort(port)?.comes_from ?? null, driven_by: linkedEndsOfThePort(graph, node, "input", pin.name), is_editable: streamAsset !== null });
  const valueSource = useWhereTheInputsValueComesFrom(state.kind === "holds_a_value" ? state.address : null, "commit");
  const comesFrom = valueSource?.comes_from ?? null;
  const canBePromoted = (state.kind === "holds_a_value" || state.kind === "not_connected") && state.can_be_promoted;
  return (
    <PropertyPortRow
      direction="input"
      portName={pin.name}
      searchWords={searchWords}
      typeWords={typeWordsOfThePin(pin)}
      pinMark={<NodeGraphPinMark pin={pin.pin} />}
      meaning={meaningOfAPort(pin, port)}
      description={pin.description ?? undefined}
      bandShade={bandShade}
      refusal={graphEdits.refusalsByPlace.get(place) ?? null}
      comesFromWords={comesFrom === null || comesFrom === "wire" ? undefined : COMES_FROM_WORDS[comesFrom]}
      reset={valueSource === null || comesFrom !== "saved" ? undefined : { label: `Reset ${pin.name} to default`, onReset: valueSource.clearTheValue }}
      promotion={
        !canBePromoted || streamAsset === null
          ? undefined
          : {
              label: `Promote ${pin.name} to a Graph Input`,
              onPromoted: () => {
                const nodeNamesTaken = new Set(graph.nodes.map((graphNode) => graphNode.name));
                const valueShown = state.kind === "holds_a_value" ? inputValues.shownValue(state.address).value : (inputValueReadOfThePort(port)?.value ?? null);
                void graphEdits.commit(place, promoteToGraphInput(streamAsset, { node, input: port, valueShown, isOnTheStreamsOwnLevel: level.length === 0, nodeNamesTaken }));
              },
            }
      }
      linkedEnds={
        state.kind !== "wired"
          ? []
          : state.driven_by.map((linkedEnd) => {
              const driverTitle = nodeTitle(linkedEnd.node.name, linkedEnd.node.type);
              const selectionOfTheDriver = selectionOfTheNodes(stream, [linkedEnd.node.name], level);
              return {
                nodeTitle: driverTitle,
                port: linkedEnd.port,
                linkKey: `${linkedEnd.node.id}:${linkedEnd.port}`,
                jump: selectionOfTheDriver === null ? undefined : { label: `Go to ${driverTitle}`, onJumped: () => void connection.select(selectionOfTheDriver) },
                disconnection:
                  !state.can_be_disconnected || streamAsset === null
                    ? undefined
                    : { label: `Disconnect ${driverTitle} › ${linkedEnd.port}`, onDisconnected: () => void graphEdits.commit(place, linkDrivingTheInputTakenOut(streamAsset, linkedEnd, node, pin.name)) },
              };
            })
      }
      unlinkedValue={
        state.kind === "holds_a_value" ? (
          <ValueOfTheUnwiredInput fieldId={pinValueFieldId(node.id, pin.name)} nodePin={pin} address={state.address} />
        ) : state.kind === "wired_from_outside_the_level" ? (
          <span className="text-fg-3" data-properties-input-wired-from-outside-the-level>
            Wired
          </span>
        ) : undefined
      }
    />
  );
}

/**
 * An unwired input's value: the control its card draws, through the frame's binder, where its type is exact, its value in
 * words while that control loads, and the panel's own field where the table has no control for it. Under it, the store's
 * refusal of the last value sent to it.
 */
function ValueOfTheUnwiredInput({ fieldId, nodePin, address }: { fieldId: string; nodePin: Pick<NodePin, "pin" | "annotations">; address: InputAddress }) {
  const controlled = takesAControl({ name: address.input, pin: nodePin.pin, annotations: nodePin.annotations, value_address: address });
  const ownField = <OwnFieldOfTheInput fieldId={fieldId} address={address} />;
  return (
    <div className="flex w-full min-w-0 flex-col gap-1">
      {controlled === null ? (
        ownField
      ) : (
        <InputControlMount input={controlled} surface="properties" readOnly={false} fallback={<InputValueWords address={address} pinType={nodePin.pin?.pin_type ?? null} data-properties-input-value-words={address.input} />} noControl={ownField} className="w-full" />
      )}
      <RefusalOfTheInputsValue address={address} />
    </div>
  );
}

/** The panel's own field for an input the table has no control for: its value as JSON, each commit set as the input's value, the words left empty taking it off. */
function OwnFieldOfTheInput({ fieldId, address }: { fieldId: string; address: InputAddress }) {
  const ownField = useOwnFieldOfTheInput(address, "commit");
  const shown = ownField?.shown ?? null;
  const holdsItsOwnValue = shown?.comes_from === "saved" || shown?.comes_from === "live";
  return (
    <PropertyTextField
      fieldId={fieldId}
      words={shown !== null && holdsItsOwnValue ? configFormFieldValueWords(shown.value) : ""}
      isTheTypesDefault={!holdsItsOwnValue}
      label={`Value of ${address.input}`}
      onCommitted={ownField === null ? undefined : (words) => (words.trim() === "" ? ownField.clearTheValue() : ownField.releaseTheValue(pinValueFromTheWordsTyped(words)))}
    />
  );
}

/** The store's refusal of the last value sent to `address`, under its value; nothing while the last one was taken. */
function RefusalOfTheInputsValue({ address }: { address: InputAddress }) {
  const refusal = useRefusalOfTheInput(address);
  if (refusal === null) return null;
  return <RefusalLine lead="The value wasn't set:" words={refusal} layout="under_field" data-properties-input-value-refusal={address.input} />;
}

/** One output of the node: its type, its description, and each input it feeds. */
function OutputRowOfTheNode({ pin, port, bandShade, graph, node, searchWords }: { pin: NodePin; port: StreamGraphPort; bandShade: PropertyPortBandShade; graph: StreamGraph; node: StreamGraphNode; searchWords: string }) {
  return (
    <PropertyPortRow
      direction="output"
      portName={pin.name}
      searchWords={searchWords}
      typeWords={typeWordsOfThePin(pin)}
      pinMark={<NodeGraphPinMark pin={pin.pin} />}
      meaning={meaningOfAPort(pin, port)}
      description={pin.description ?? undefined}
      bandShade={bandShade}
      linkedEnds={linkedEndsOfThePort(graph, node, "output", pin.name).map((reader) => ({ nodeTitle: nodeTitle(reader.node.name, reader.node.type), port: reader.port, linkKey: `${reader.node.id}:${reader.port}` }))}
    />
  );
}

/** The shade of the band at `bandIndex` down the panel. */
function bandShadeAt(bandIndex: number): PropertyPortBandShade {
  return bandIndex % 2 === 0 ? "first" : "second";
}

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
  level,
  nodeName,
  graphEditsInTheProject,
  projectFolder,
  inputValues,
  searchWords,
}: {
  connection: TatoAppViewConnection;
  stream: string;
  level: readonly string[];
  nodeName: string;
  graphEditsInTheProject: GraphEditsInTheOpenProject;
  /** The open project's folder, where the frame's store sends each input's value; `null` while none is open. */
  projectFolder: string | null;
  inputValues: InputValues;
  searchWords: string;
}) {
  const watchTheStreamsGraph = useCallback((listener: (reading: StreamGraphReading) => void): StopWatching => connection.watchStreamGraph(stream, listener), [connection, stream]);
  const graphReading = useViewReading(watchTheStreamsGraph);
  const nodeTypesReading = useNodeTypesOfTheProject(connection, projectFolder);
  const describedByType = useMemo(() => nodeTypeDescriptionsByType(nodeTypesReading?.kind === "listed" ? nodeTypesReading.node_types.described : []), [nodeTypesReading]);
  const listedStreams = useViewReading(connection.watchListedStreams);
  const nodeShownWhileItWasSelectedByName = useRef<{ nodeName: string; nodeId: string } | null>(null);
  const streamGraph = graphReading?.kind === "read" ? graphReading.graph : null;
  const graph = useMemo(() => (streamGraph === null ? null : (streamGraphLevelAtTheSubgraphIds(streamGraph, level)?.graph ?? null)), [streamGraph, level]);
  const nodeSelectedByName = graph?.nodes.find((graphNode) => graphNode.name === nodeName);
  const nodeRenamedSinceItWasSelected =
    nodeSelectedByName === undefined && nodeShownWhileItWasSelectedByName.current?.nodeName === nodeName
      ? graph?.nodes.find((graphNode) => graphNode.id === nodeShownWhileItWasSelectedByName.current?.nodeId)
      : undefined;
  const node = nodeSelectedByName ?? nodeRenamedSinceItWasSelected;
  if (nodeSelectedByName !== undefined) nodeShownWhileItWasSelectedByName.current = { nodeName, nodeId: nodeSelectedByName.id };
  const graphEdits = graphEditsInTheProject.ofTheNode(node?.id ?? "", level);
  const described: NodeTypeDescription | undefined = node === undefined ? undefined : describedByType.get(node.type);
  const configForm = useMemo(() => (node === undefined ? null : configFormOf(configSchemaOfTheSettings(described, node), jsonObjectMembersOf(node.config))), [node, described]);
  useInputValuesOfTheStream(connection, inputValues, stream, projectFolder);
  const streamAssetOfTheGraph = streamGraph?.asset ?? null;
  const valuesAt = useMemo(
    (): GraphAddress | null => (projectFolder === null || streamAssetOfTheGraph === null ? null : { project_folder: projectFolder, stream_asset: streamAssetOfTheGraph, level }),
    [projectFolder, streamAssetOfTheGraph, level],
  );
  const nameTheNodeGoesByNow = node?.name;
  useEffect(() => {
    if (nameTheNodeGoesByNow === undefined || nameTheNodeGoesByNow === nodeName) return;
    const selectionOfTheNodeRenamed = selectionOfTheNodes(stream, [nameTheNodeGoesByNow], level);
    if (selectionOfTheNodeRenamed !== null) void connection.select(selectionOfTheNodeRenamed);
  }, [connection, stream, level, nodeName, nameTheNodeGoesByNow]);

  if (graphReading === null) return null;
  if (graphReading.kind === "not_read") return <WaitingState title={`${nodeName} can't be read`} explanation={graphReading.because} data-properties-state="graph_not_read" />;
  if (graph === null || node === undefined || configForm === null)
    return <WaitingState title={`${nodeName} is gone`} explanation="Its stream's graph no longer has it." data-properties-state="node_gone" />;
  const streamAsset = graph.asset ?? null;
  const listedStream = listedStreams?.kind === "listed" ? listedStreams.streams.find((candidate) => candidate.stream === stream) : undefined;
  const streamName = listedStream?.display_name ?? stream;
  const typeClassName = nodeTypeClassName(node.type);
  const refusalOfTheName = graphEdits.refusalsByPlace.get("name");
  const configFields = configForm.kind === "fields" ? configForm.fields : [];
  const matching = propertiesMatchingTheSearch(
    configFields.map((field) => field.key),
    node.ports.inputs.map((port) => port.name),
    node.ports.outputs.map((port) => port.name),
    searchWords,
  );
  const configFieldsListed = configFields.filter((field) => matching.config_keys_listed.has(field.key));
  const inputPins = nodeInputs(graph, node, described, valuesAt);
  const outputPins = nodeOutputs(node, described);
  const inputPortsListed = node.ports.inputs.flatMap((port, portIndex) => {
    const pin = inputPins[portIndex];
    return pin !== undefined && matching.input_ports_listed.has(port.name) ? [{ port, pin }] : [];
  });
  const outputPortsListed = node.ports.outputs.flatMap((port, portIndex) => {
    const pin = outputPins[portIndex];
    return pin !== undefined && matching.output_ports_listed.has(port.name) ? [{ port, pin }] : [];
  });
  const inputRows: InputRowsOfTheNode = { connection, stream, level, graph, node, streamAsset, inputValues, graphEdits, searchWords };
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
            title={described === undefined || described.documentation === "" ? node.type : `${node.type} · ${described.documentation}`}
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
        {node.components.state === "Error" && (
          <div data-properties-node-failed={node.name}>
            <FailureBanner place="panel">{node.components.failed_because === null ? "This node failed. The runtime gave no reason." : "This node failed."}</FailureBanner>
            {node.components.failed_because !== null && (
              <div className="border-b px-3 py-2.5">
                <RuntimeFailureWords words={node.components.failed_because} data-properties-failed-because={node.name} />
              </div>
            )}
          </div>
        )}
        {node.components.state !== "Error" && node.components.process_raising_because !== null && (
          <div data-properties-node-process-raising={node.name}>
            <FailureBanner place="panel">This node is running, but its process() keeps raising.</FailureBanner>
            <div className="border-b px-3 py-2.5">
              <RuntimeFailureWords words={node.components.process_raising_because} data-properties-process-raising-because={node.name} />
            </div>
          </div>
        )}
        {node.components.not_ready_because !== null && (
          <div data-properties-node-not-ready={node.name}>
            <RefusalLine lead="This node isn't ready:" words={node.components.not_ready_because} tone="warning" layout="bar" data-properties-not-ready-because={node.name} />
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
                  <p className="px-1 text-xs text-fg-3">{nodeTypesReading?.kind === "not_listed" ? nodeTypesReading.because : "No config."}</p>
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
            {node.ports.inputs.length === 0 ? (
              <p className="px-1 text-xs text-fg-3">None</p>
            ) : (
              inputPortsListed.map(({ port, pin }, portIndex) => <InputRowOfTheNode key={port.name} pin={pin} port={port} bandShade={bandShadeAt(portIndex)} rows={inputRows} />)
            )}
          </PropertySection>
        )}
        {(!matching.is_searching || matching.output_ports_listed.size > 0) && (
          <PropertySection title="Outputs" data-properties-section="outputs">
            {node.ports.outputs.length === 0 ? (
              <p className="px-1 text-xs text-fg-3">None</p>
            ) : (
              outputPortsListed.map(({ port, pin }, portIndex) => (
                <OutputRowOfTheNode key={port.name} pin={pin} port={port} bandShade={bandShadeAt(inputPortsListed.length + portIndex)} graph={graph} node={node} searchWords={searchWords} />
              ))
            )}
            {outputPortsListed
              .filter(({ port }) => port.family === "image")
              .map(({ port }) => (
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
function SummaryOfTheSeveralSelectedNodes({ connection, stream, level, nodeNames }: { connection: TatoAppViewConnection; stream: string; level: readonly string[]; nodeNames: readonly string[] }) {
  const watchTheStreamsGraph = useCallback((listener: (reading: StreamGraphReading) => void): StopWatching => connection.watchStreamGraph(stream, listener), [connection, stream]);
  const graphReading = useViewReading(watchTheStreamsGraph);
  const nodesOfTheLevel = graphReading?.kind === "read" ? (streamGraphLevelAtTheSubgraphIds(graphReading.graph, level)?.graph.nodes ?? []) : [];
  const { title, explanation } = wordsForTheSeveralSelectedNodes(nodeNames, nodesOfTheLevel);
  return <WaitingState title={title} explanation={explanation} data-properties-state="several_nodes" />;
}

function PropertiesBody({ connection }: { connection: TatoAppViewConnection }) {
  const selection = useViewReading(connection.watchSelection);
  const activeStreamTab = useViewReading(connection.watchActiveStreamTab);
  const openProject = useViewReading(connection.watchOpenProject);
  const projectFolder = openProject?.kind === "read" ? openProject.open_project.project.folder : null;
  const graphEditsInTheProject = useGraphEditsInTheOpenProject(connection, projectFolder);
  const openProjectOfTheAssetFields = useMemo(() => (projectFolder === null ? null : { connection, projectFolder }), [connection, projectFolder]);
  const [searchWords, setSearchWords] = useState("");
  const { inputValues, inputControls } = useInputControlsOfTheFrame(connection);
  if (selection?.kind === "nodes" && activeStreamTab?.stream === selection.stream) {
    return <SummaryOfTheSeveralSelectedNodes connection={connection} stream={selection.stream} level={selection.level ?? NO_LEVEL} nodeNames={selection.nodes} />;
  }
  if (selection?.kind !== "node" || activeStreamTab?.stream !== selection.stream) {
    return <WaitingState title="Nothing to show" explanation="Select a node in the stream graph to edit its config and see what it's connected to." data-properties-state="no_node" />;
  }
  return (
    <>
      <StudioViewToolbarTools label="Properties search">
        <SearchField label="Search properties" placeholder="Search properties" text={searchWords} onTextChanged={setSearchWords} width="fills_the_row" data-properties-search="" />
      </StudioViewToolbarTools>
      <OpenProjectOfTheAssetFieldsContext.Provider value={openProjectOfTheAssetFields}>
        <InputControlBinderContext value={inputControls}>
          <PropertiesOfTheSelectedNode
            key={`${selection.stream}/${(selection.level ?? []).join("/")}`}
            connection={connection}
            stream={selection.stream}
            level={selection.level ?? NO_LEVEL}
            nodeName={selection.node}
            graphEditsInTheProject={graphEditsInTheProject}
            projectFolder={projectFolder}
            inputValues={inputValues}
            searchWords={searchWords}
          />
        </InputControlBinderContext>
      </OpenProjectOfTheAssetFieldsContext.Provider>
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
