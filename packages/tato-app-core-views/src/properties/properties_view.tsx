import { useViewReading } from "@tatolab/tato-app-view-sdk/design_system/view_readings";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { SearchField } from "@tatolab/tato-app-view-sdk/design_system/search_field";
import { StudioViewToolbarTools } from "@tatolab/tato-app-view-sdk/design_system/studio_area_frame";
import { NodeGraphPinMark, NodeGraphRebuildsTheNodeMark } from "@tatolab/tato-app-view-sdk/design_system/node_graph/node_card";
import { pinWords } from "@tatolab/tato-app-view-sdk/pin_model/pin_type_words";
import { takesAControl } from "@tatolab/tato-app-view-sdk/pin_model/controlled_inputs";
import type { GraphAddress, InputAddress } from "@tatolab/tato-app-view-sdk/pin_model/node_inputs";
import { settingValuesOfTheGraph, valueReadOfTheSetting } from "@tatolab/tato-app-view-sdk/pin_model/node_settings";
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
  type OwnFieldOfTheInput,
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
import type { AreasForAViewTypeReading, StopWatching, TatoAppViewConnection } from "@tatolab/tato-app-view-sdk";
import { FieldMenu, MenuItem, MenuNote } from "@tatolab/tato-app-view-sdk/design_system/menus";
import {
  inputValueReadOfThePort,
  type InputValueComesFrom,
  type JsonValue,
  nodeTypeDescriptionsByType,
  type NodeTypeDescription,
  type NodeTypeInputDescribed,
  type ProjectAssetsReading,
  type StreamGraph,
  type StreamGraphInputValueRead,
  type StreamGraphNode,
  type StreamGraphPort,
  type StreamGraphReading,
} from "@tatolab/tato-app-view-sdk/studio_readings";
import { useNodeTypesOfTheProject } from "../shared/use_node_types_of_the_project";
import { CoreViewFrame } from "../shared/core_view_page";
import { useRefusalOfTheLatestAsk } from "../shared/refusal_of_the_latest_ask";
import { VALUES_UNCHECKED_MEANING } from "../shared/port_stream_facts_words";
import { nameInWords, nodeTitle, nodeTypeClassName, wordsForTheSeveralSelectedNodes } from "../shared/node_words";
import { configFormFieldValueWords, doesTheSettingTakeNull, fieldsOfAListEntry, listOfRecordsOfTheSetting, recordsOfAListField, type ConfigFormField, type ListOfRecordsOfTheSetting } from "./config_form_fields";
import { propertiesListedWords, propertiesMatchingTheSearch } from "./properties_matching_the_search";
import { areasToShowTheViewIn, viewShownInAreasWords } from "./view_node_areas";
import { chosenProjectAssetOf, chosenProjectAssetWords, projectAssetsForTheAssetFieldsOf } from "./project_asset_choices";
import { previewPictureUrlOf } from "../library/library_asset_preview_pictures";
import { useAssetPreviewPicturesOfTheProject } from "../library/use_asset_preview_pictures_of_the_project";
import { useGraphEditsInTheOpenProject, type GraphEditsInTheOpenProject, type GraphEditsOfTheNode, type PlaceOfAnEdit } from "./graph_edits_in_the_open_project";
import { streamGraphLevelAtTheSubgraphIds } from "../stream_graph/stream_graph_levels";
import { nodeInputs, nodeOutputs } from "../shared/node_pins_of_the_graph";
import { selectionOfTheNodes } from "../shared/nodes_of_the_selection";
import { inputRowStateOf, type InputRowState } from "./input_row_state";
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
} from "./properties_graph_edits";

/** The stream's own level, which a node selection with no `level` is at. */
const NO_LEVEL: readonly string[] = [];

/** The open project an asset field reads its assets from and opens the asset picker through; `null` while no project is open. */
interface OpenProjectOfTheAssetFields {
  connection: TatoAppViewConnection;
  projectFolder: string;
}

const OpenProjectOfTheAssetFieldsContext = createContext<OpenProjectOfTheAssetFields | null>(null);

/** The id of the field holding the value an unlinked input of the node takes. */
function pinValueFieldId(nodeId: string, portName: string): string {
  return `${nodeId}:${portName}:pin`;
}

/** The control of one field of an entry of a setting's list of records, each value chosen handed to `onChosen`; read only without it. */
function ListEntryFieldControl({
  fieldId,
  field,
  onChosen,
  onWordsRefused,
}: {
  fieldId: string;
  field: ConfigFormField;
  onChosen: ((newValue: JsonValue) => void) | undefined;
  /** Says why words typed into the field are no value it takes. */
  onWordsRefused: (because: string) => void;
}) {
  const isTheTypesDefault = field.value_source !== "config";
  const { control, value } = field;
  const commitTheWords =
    onChosen === undefined
      ? undefined
      : (words: string) => {
          const valueTyped = configValueFromTheWordsTyped(field, words);
          if (valueTyped.kind === "not_a_value") onWordsRefused(valueTyped.because);
          else onChosen(valueTyped.value);
        };
  switch (control.kind) {
    case "number":
      if (onChosen !== undefined && commitTheWords !== undefined && control.minimum !== null && control.maximum !== null && control.maximum > control.minimum) {
        // A list of records is a setting its node reads as it is set up, so a drag sends nothing until it is let go.
        return (
          <PropertySliderField
            fieldId={fieldId}
            value={typeof value === "number" ? value : null}
            minimum={control.minimum}
            maximum={control.maximum}
            isWholeNumber={control.is_whole_number}
            isTheTypesDefault={isTheTypesDefault}
            onDragStarted={() => undefined}
            onLiveEdit={() => undefined}
            onCommitted={onChosen}
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
          onCommitted={commitTheWords}
        />
      );
    case "toggle":
      return <PropertyCheckbox fieldId={fieldId} isOn={value === true} isTheTypesDefault={isTheTypesDefault} onToggled={onChosen} />;
    case "choice":
      return (
        <PropertyChoiceField
          fieldId={fieldId}
          words={configFormFieldValueWords(value)}
          isTheTypesDefault={isTheTypesDefault}
          choices={onChosen === undefined ? undefined : control.choices.map((choice) => ({ words: configFormFieldValueWords(choice), onChosen: () => onChosen(choice) }))}
        />
      );
    case "project_asset":
      return (
        <ProjectAssetFieldOfTheConfig
          fieldId={fieldId}
          name={field.key}
          value={field.value_source === "unset" ? null : field.value}
          mediaItTakes={control.media_it_takes}
          isTheTypesDefault={isTheTypesDefault}
          takesNull={field.is_nullable}
          onChosen={onChosen}
          onPickNotStarted={onWordsRefused}
        />
      );
    case "list_of_records":
    case "text":
    case "json":
      return <PropertyTextField fieldId={fieldId} words={field.value_source === "unset" ? "" : configFormFieldValueWords(value)} isTheTypesDefault={isTheTypesDefault} onCommitted={commitTheWords} />;
  }
}

/** What an asset field is handed: the name of what it sets, its value, the media it takes, whether it is the type's default and takes no asset, what choosing an asset does, read only without `onChosen`, and where a picker that did not open says why. */
interface ProjectAssetFieldOfTheConfigProps {
  fieldId: string;
  name: string;
  value: JsonValue | null;
  mediaItTakes: string[] | null;
  isTheTypesDefault: boolean;
  takesNull: boolean;
  onChosen: ((asset: JsonValue) => void) | undefined;
  onPickNotStarted: (because: string) => void;
}

/** A field naming a project asset by its UUID: the asset it names, by path with its picture, beside a button that opens Studio's asset picker; the value as written while no project is open. */
function ProjectAssetFieldOfTheConfig(props: ProjectAssetFieldOfTheConfigProps) {
  const openProject = useContext(OpenProjectOfTheAssetFieldsContext);
  if (openProject === null) {
    const { fieldId, value, isTheTypesDefault } = props;
    return <PropertyAssetField fieldId={fieldId} words={chosenProjectAssetWords([], value)} previewPictureUrl={null} isTheTypesDefault={isTheTypesDefault} />;
  }
  return <ProjectAssetFieldOfTheOpenProject key={openProject.projectFolder} {...props} openProject={openProject} />;
}

function ProjectAssetFieldOfTheOpenProject({
  fieldId,
  name,
  value,
  mediaItTakes,
  isTheTypesDefault,
  takesNull,
  onChosen,
  onPickNotStarted,
  openProject: { connection, projectFolder },
}: ProjectAssetFieldOfTheConfigProps & { openProject: OpenProjectOfTheAssetFields }) {
  const watchTheProjectsAssets = useCallback((listener: (reading: ProjectAssetsReading) => void): StopWatching => connection.watchProjectAssets(projectFolder, listener), [connection, projectFolder]);
  const projectAssets = projectAssetsForTheAssetFieldsOf(useViewReading(watchTheProjectsAssets));
  const previewPictures = useAssetPreviewPicturesOfTheProject(connection, projectFolder);
  const [isThePickerOpen, setIsThePickerOpen] = useState(false);
  const assetsListed = projectAssets.kind === "listed" ? projectAssets.assets : [];
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
        choosing={onChosen === undefined ? undefined : { label: `Choose an asset for ${nameInWords(name)}…`, disabledReason: isThePickerOpen ? "The asset picker is open." : null, onChooseAsked: () => chooseAnAsset(onChosen) }}
        clearing={onChosen === undefined || !takesNull || value === null || value === "" ? undefined : { label: `Choose no asset for ${nameInWords(name)}`, onCleared: () => onChosen(null) }}
      />
      {projectAssets.kind === "refused" && <RefusalLine lead="The project's assets weren't listed:" words={projectAssets.because} data-property-asset-listing-refusal="" />}
    </div>
  );
}

/** What a field of the panel's own sets through: the store's value of one input or setting, and its own refusals. */
interface OwnFieldOfTheRow {
  address: InputAddress;
  /** The place its words or a picker that did not open say why under. */
  place: PlaceOfAnEdit;
  graphEdits: GraphEditsOfTheNode;
}

/** The value an input or setting holds of its own in the store, `null` while it reads its default or none. */
function ownValueShown(ownField: OwnFieldOfTheInput | null): JsonValue | null {
  const shown = ownField?.shown;
  return shown !== undefined && (shown.comes_from === "saved" || shown.comes_from === "live") ? shown.value : null;
}

/** The value an input or setting shows in the store, its own or its default; `null` where it shows none. */
function valueShown(ownField: OwnFieldOfTheInput | null): JsonValue | null {
  return ownField?.shown.value ?? null;
}

/** The panel's own asset field for a String holding a project asset's UUID: the asset chosen set as the value, as one commit. */
function AssetFieldOfTheInput({ fieldId, row, mediaItTakes, takesNull }: { fieldId: string; row: OwnFieldOfTheRow; mediaItTakes: string[] | null; takesNull: boolean }) {
  const ownField = useOwnFieldOfTheInput(row.address, "commit");
  return (
    <ProjectAssetFieldOfTheConfig
      fieldId={fieldId}
      name={row.address.input}
      value={valueShown(ownField)}
      mediaItTakes={mediaItTakes}
      isTheTypesDefault={ownValueShown(ownField) === null}
      takesNull={takesNull}
      onChosen={ownField === null ? undefined : (asset) => ownField.releaseTheValue(asset)}
      onPickNotStarted={(because) => row.graphEdits.keepTheRefusal(row.place, because)}
    />
  );
}

/**
 * The panel's own rows for a setting holding a list of records: how many entries it holds, with a way to add one, then each
 * entry's fields, which set the whole list as one commit, read from the value the store shows.
 */
function ListOfRecordsOfTheInput({ fieldId, row, list }: { fieldId: string; row: OwnFieldOfTheRow; list: ListOfRecordsOfTheSetting }) {
  const ownField = useOwnFieldOfTheInput(row.address, "commit");
  const { graphEdits } = row;
  const settingName = row.address.input;
  const records = recordsOfAListField(valueShown(ownField));
  const setTheList = (place: PlaceOfAnEdit, listWanted: (listEditedFrom: JsonValue) => JsonValue[] | null) => {
    if (ownField === null) return;
    const listSet = listWanted(valueShown(ownField));
    if (listSet === null) graphEdits.keepTheRefusal(place, LIST_ENTRY_MOVED_ON_REFUSAL);
    else ownField.releaseTheValue(listSet);
  };
  return (
    <div className="flex w-full min-w-0 flex-col gap-1" data-properties-list-of-records={settingName}>
      <PropertyListEntryCount
        fieldId={fieldId}
        entryCount={records.length}
        isTheTypesDefault={ownValueShown(ownField) === null}
        addition={ownField === null ? undefined : { label: `Add an entry to ${nameInWords(settingName)}`, onAdded: () => setTheList(row.place, (listEditedFrom) => listWithARecordAdded(listEditedFrom, list.new_item)) }}
      />
      {records.map((record, index) => {
        const entryLabel = `${nameInWords(settingName)} ${index}`;
        return (
          <PropertyListEntry
            key={index}
            label={entryLabel}
            removal={ownField === null ? undefined : { label: `Remove ${entryLabel}`, onRemoved: () => setTheList(row.place, (listEditedFrom) => listWithoutTheRecord(listEditedFrom, index, record)) }}
            data-config-list-entry={`${settingName}:${index}`}
          >
            {fieldsOfAListEntry(list.item_schema, record).map((entryField) => {
              const entryFieldPlace: PlaceOfAnEdit = `input:${settingName}:${index}:${entryField.key}`;
              const setTheEntryField = (newValue: JsonValue | undefined) => setTheList(entryFieldPlace, (listEditedFrom) => listWithTheRecordFieldSet(listEditedFrom, index, record, entryField.key, newValue));
              return (
                <PropertyRow
                  key={entryField.key}
                  label={nameInWords(entryField.key)}
                  meaning={entryField.description === null ? entryField.key : `${entryField.key} · ${entryField.description}`}
                  refusal={graphEdits.refusalsByPlace.get(entryFieldPlace) ?? null}
                  reset={ownField === null || entryField.value_source !== "config" ? undefined : { label: `Reset ${entryLabel} ${nameInWords(entryField.key)} to its type's default`, onReset: () => setTheEntryField(undefined) }}
                  data-config-field={`${settingName}:${index}:${entryField.key}`}
                  data-config-field-value-source={entryField.value_source}
                >
                  {(entryFieldId) => (
                    <ListEntryFieldControl
                      fieldId={entryFieldId}
                      field={entryField}
                      onChosen={ownField === null ? undefined : setTheEntryField}
                      onWordsRefused={(because) => graphEdits.keepTheRefusal(entryFieldPlace, because)}
                    />
                  )}
                </PropertyRow>
              );
            })}
          </PropertyListEntry>
        );
      })}
    </div>
  );
}

/** What a port's name shows while the pointer rests on it: the stream facts it reads, and that a Records port's values are not checked. */
function meaningOfAPort(pin: Pick<NodePin, "stream_facts_words">, port: Pick<StreamGraphPort, "values_checked"> | null): string | undefined {
  const meaning = [pin.stream_facts_words.length > 0 ? pin.stream_facts_words.join(" · ") : null, port?.values_checked === false ? VALUES_UNCHECKED_MEANING : null]
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
  /** The settings of the node it can take as inputs and does not yet, each offered on its row to be exposed as a Graph Input. */
  settingsToExpose: ReadonlySet<string>;
  searchWords: string;
}

/** The mark beside an input's name: the socket its card draws, or for a setting, which takes no wire, the mark of one a change of which rebuilds its node. */
function InputMarkOfTheRow({ pin }: { pin: NodePin }) {
  return pin.setting === null ? <NodeGraphPinMark pin={pin.pin} /> : <NodeGraphRebuildsTheNodeMark pin={pin} />;
}

/** Where the runtime reads an input's value from: as its port states, or for a setting the graph lists among no port, as the node's graph document holds it. */
function whereTheInputReadsFrom(node: StreamGraphNode, port: StreamGraphPort | null, describedInput: NodeTypeInputDescribed | undefined): StreamGraphInputValueRead | null {
  if (port !== null) return inputValueReadOfThePort(port);
  return describedInput === undefined ? null : valueReadOfTheSetting(node, describedInput);
}

/** What a row offers to feed its input from a new Graph Input: a promotion of an input, or the exposing of a setting its node can take as an input; nothing where neither can be. */
function graphInputOfferedOnTheRow(pin: NodePin, port: StreamGraphPort | null, state: InputRowState, rows: InputRowsOfTheNode): { label: string; onPromoted: () => void } | undefined {
  const { level, graph, node, streamAsset, inputValues, graphEdits, settingsToExpose } = rows;
  if (streamAsset === null) return undefined;
  const place = placeOfTheInput(pin.name);
  if (pin.setting !== null) {
    if (!settingsToExpose.has(pin.name)) return undefined;
    return { label: `Expose ${pin.name} as a Graph Input`, onPromoted: () => void graphEdits.commit(place, exposeTheConfigFieldAsAGraphInput(streamAsset, node, pin)) };
  }
  const canBePromoted = (state.kind === "holds_a_value" || state.kind === "not_connected") && state.can_be_promoted;
  if (!canBePromoted || port === null) return undefined;
  return {
    label: `Promote ${pin.name} to a Graph Input`,
    onPromoted: () => {
      const nodeNamesTaken = new Set(graph.nodes.map((graphNode) => graphNode.name));
      const valueShownNow = state.kind === "holds_a_value" ? inputValues.shownValue(state.address).value : (inputValueReadOfThePort(port)?.value ?? null);
      void graphEdits.commit(place, promoteToGraphInput(streamAsset, { node, input: port, valueShown: valueShownNow, isOnTheStreamsOwnLevel: level.length === 0, nodeNamesTaken }));
    },
  };
}

/**
 * One input of the node, its settings among them, as its card draws it, wider, in the state `inputRowStateOf` decides: a
 * wired input names each node and pin that drive it, with a way there and a disconnect; an unwired one draws the control its
 * card draws, or the panel's own field where the table has none, says where the store's value comes from, and offers Reset
 * to default and Promote to a Graph Input, or for a setting its node can take as an input, Expose as a Graph Input. `port`
 * is `null` for a setting the graph lists among no port of the node.
 */
function InputRowOfTheNode({ pin, port, describedInput, bandShade, rows }: { pin: NodePin; port: StreamGraphPort | null; describedInput: NodeTypeInputDescribed | undefined; bandShade: PropertyPortBandShade; rows: InputRowsOfTheNode }) {
  const { connection, stream, level, graph, node, streamAsset, graphEdits, searchWords } = rows;
  const place = placeOfTheInput(pin.name);
  const state = inputRowStateOf({ input: pin, value_comes_from: whereTheInputReadsFrom(node, port, describedInput)?.comes_from ?? null, driven_by: linkedEndsOfThePort(graph, node, "input", pin.name), is_editable: streamAsset !== null });
  const valueSource = useWhereTheInputsValueComesFrom(state.kind === "holds_a_value" ? state.address : null, "commit");
  const comesFrom = valueSource?.comes_from ?? null;
  return (
    <PropertyPortRow
      direction="input"
      portName={pin.name}
      searchWords={searchWords}
      typeWords={typeWordsOfThePin(pin)}
      pinMark={<InputMarkOfTheRow pin={pin} />}
      meaning={meaningOfAPort(pin, port)}
      description={pin.description ?? undefined}
      bandShade={bandShade}
      refusal={graphEdits.refusalsByPlace.get(place) ?? null}
      comesFromWords={comesFrom === null || comesFrom === "wire" ? undefined : COMES_FROM_WORDS[comesFrom]}
      reset={valueSource === null || comesFrom !== "saved" ? undefined : { label: `Reset ${pin.name} to default`, onReset: valueSource.clearTheValue }}
      promotion={graphInputOfferedOnTheRow(pin, port, state, rows)}
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
          <ValueOfTheUnwiredInput fieldId={pinValueFieldId(node.id, pin.name)} nodePin={pin} describedInput={describedInput} row={{ address: state.address, place, graphEdits }} />
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
 * The panel's own field for an input no control draws: the asset field for one holding a project asset's UUID, the entry
 * rows of a setting holding a list of records, and else its value as JSON.
 */
function OwnFieldOfTheRowsInput({ fieldId, nodePin, describedInput, row }: { fieldId: string; nodePin: Pick<NodePin, "annotations">; describedInput: NodeTypeInputDescribed | undefined; row: OwnFieldOfTheRow }) {
  const projectAsset = nodePin.annotations.project_asset;
  if (projectAsset !== undefined && projectAsset !== null) {
    const mediaItTakes = projectAsset.media === undefined || projectAsset.media === null || projectAsset.media.length === 0 ? null : [...projectAsset.media];
    return <AssetFieldOfTheInput fieldId={fieldId} row={row} mediaItTakes={mediaItTakes} takesNull={doesTheSettingTakeNull(describedInput?.value_json_schema)} />;
  }
  const list = listOfRecordsOfTheSetting(describedInput?.value_json_schema);
  if (list !== null) return <ListOfRecordsOfTheInput fieldId={fieldId} row={row} list={list} />;
  return <JsonFieldOfTheInput fieldId={fieldId} address={row.address} />;
}

/**
 * An unwired input's value: the control its card draws, through the frame's binder, where its type is exact, its value in
 * words while that control loads, and the panel's own field where the table has no control for it. Under it, the store's
 * refusal of the last value sent to it.
 */
function ValueOfTheUnwiredInput({ fieldId, nodePin, describedInput, row }: { fieldId: string; nodePin: Pick<NodePin, "pin" | "annotations" | "setting">; describedInput: NodeTypeInputDescribed | undefined; row: OwnFieldOfTheRow }) {
  const { address } = row;
  const controlled = takesAControl({ name: address.input, pin: nodePin.pin, annotations: nodePin.annotations, value_address: address, setting: nodePin.setting, wire: null });
  const ownField = <OwnFieldOfTheRowsInput fieldId={fieldId} nodePin={nodePin} describedInput={describedInput} row={row} />;
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
function JsonFieldOfTheInput({ fieldId, address }: { fieldId: string; address: InputAddress }) {
  const ownField = useOwnFieldOfTheInput(address, "commit");
  const ownValue = ownValueShown(ownField);
  return (
    <PropertyTextField
      fieldId={fieldId}
      words={ownValue === null ? "" : configFormFieldValueWords(ownValue)}
      isTheTypesDefault={ownValue === null}
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

/** A view node's section, with its row naming how many areas show its view, with Show in an area to show it in another; nothing for a node that is not a view's. */
function ViewNodeShownInAreasRow({ connection, viewTypeId }: { connection: TatoAppViewConnection; viewTypeId: string }) {
  const areasReading = useViewReading(useCallback((listener: (reading: AreasForAViewTypeReading) => void): StopWatching => connection.watchAreasForTheViewType(viewTypeId, listener), [connection, viewTypeId]));
  const [showingRefusal, showTheRefusalOf] = useRefusalOfTheLatestAsk();
  if (areasReading === null || areasReading.kind === "not_a_view_type") return null;
  if (areasReading.kind === "no_areas") {
    return (
      <PropertySection title="View">
        <PropertyRow label="Shown in" data-properties-view-shown-in={viewTypeId}>
          {() => <p className="text-xs text-fg-3">{areasReading.because}</p>}
        </PropertyRow>
      </PropertySection>
    );
  }
  const areasOffered = areasToShowTheViewIn(areasReading.areas);
  return (
    <PropertySection title="View">
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
    </PropertySection>
  );
}

/** The selected node's name, and its inputs, its settings first, and outputs, with what each joins and the value each unwired input holds. */
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
  const settingValues = useMemo(() => (streamGraph === null ? [] : settingValuesOfTheGraph(streamGraph, describedByType)), [streamGraph, describedByType]);
  useInputValuesOfTheStream(connection, inputValues, stream, projectFolder, settingValues);
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
  if (graph === null || node === undefined)
    return <WaitingState title={`${nodeName} is gone`} explanation="Its stream's graph no longer has it." data-properties-state="node_gone" />;
  const streamAsset = graph.asset ?? null;
  const listedStream = listedStreams?.kind === "listed" ? listedStreams.streams.find((candidate) => candidate.stream === stream) : undefined;
  const streamName = listedStream?.display_name ?? stream;
  const typeClassName = nodeTypeClassName(node.type);
  const refusalOfTheName = graphEdits.refusalsByPlace.get("name");
  const inputPins = nodeInputs(graph, node, described, valuesAt, null);
  const outputPins = nodeOutputs(node, described);
  const matching = propertiesMatchingTheSearch(
    inputPins.map((pin) => pin.name),
    outputPins.map((pin) => pin.name),
    searchWords,
  );
  const inputsListed = inputPins.flatMap((pin) =>
    matching.inputs_listed.has(pin.name) ? [{ pin, port: node.ports.inputs.find((port) => port.name === pin.name) ?? null, describedInput: described?.inputs.find((input) => input.name === pin.name) }] : [],
  );
  const outputPortsListed = outputPins.flatMap((pin) => {
    const port = node.ports.outputs.find((candidate) => candidate.name === pin.name);
    return port !== undefined && matching.outputs_listed.has(pin.name) ? [{ port, pin }] : [];
  });
  const settingsToExpose = configFieldsToExposeAsGraphInputs(node, described);
  const inputRows: InputRowsOfTheNode = { connection, stream, level, graph, node, streamAsset, inputValues, graphEdits, settingsToExpose, searchWords };
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
        {!matching.is_searching && <ViewNodeShownInAreasRow connection={connection} viewTypeId={node.type} />}
        {(!matching.is_searching || matching.inputs_listed.size > 0) && (
          <PropertySection title="Inputs" data-properties-section="inputs">
            {nodeTypesReading?.kind === "not_listed" && <p className="px-1 text-xs text-fg-3" data-properties-settings-not-listed="">{nodeTypesReading.because}</p>}
            {inputPins.length === 0 ? (
              <p className="px-1 text-xs text-fg-3">None</p>
            ) : (
              inputsListed.map(({ pin, port, describedInput }, inputIndex) => <InputRowOfTheNode key={pin.name} pin={pin} port={port} describedInput={describedInput} bandShade={bandShadeAt(inputIndex)} rows={inputRows} />)
            )}
          </PropertySection>
        )}
        {(!matching.is_searching || matching.outputs_listed.size > 0) && (
          <PropertySection title="Outputs" data-properties-section="outputs">
            {outputPins.length === 0 ? (
              <p className="px-1 text-xs text-fg-3">None</p>
            ) : (
              outputPortsListed.map(({ port, pin }, portIndex) => (
                <OutputRowOfTheNode key={port.name} pin={pin} port={port} bandShade={bandShadeAt(inputsListed.length + portIndex)} graph={graph} node={node} searchWords={searchWords} />
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
    return <WaitingState title="Nothing to show" explanation="Select a node in the stream graph to set its inputs and see what it's connected to." data-properties-state="no_node" />;
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
