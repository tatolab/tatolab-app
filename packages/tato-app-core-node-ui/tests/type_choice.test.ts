import type { ControlledPin, InputControlElementClass, InputControlState } from "@tatolab/tato-app-view-sdk/node_ui";
import type { PinType } from "@tatolab/tato-app-view-sdk/pin_types";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import TypeChoice from "../node_ui/type_choice.ts";
import { eventsFiredBy, NO_STUDIO_CALLS } from "./control_test_support.ts";

vi.mock("@tatolab/tato-app-view-sdk/node_ui/input_control.css", () => ({ default: new CSSStyleSheet() }));

customElements.define("tato-studio-type_choice-test", TypeChoice);

function mountedTypeChoice(value: PinType | null, among: PinType[] = [], state: InputControlState = "editable", amongTheBundlesItsStreamDeclares = false): TypeChoice {
  const control = new TypeChoice();
  const pinType: ControlledPin<"pin_type_choice">["declaration"]["pin_type"] = amongTheBundlesItsStreamDeclares ? { type: "pin_type_choice", among, among_the_bundles_its_stream_declares: true } : { type: "pin_type_choice", among };
  const pin: ControlledPin<"pin_type_choice"> = {
    declaration: { input_name: "carries", label: "carries", pin_type: pinType, annotations: {}, may_be_unset: amongTheBundlesItsStreamDeclares },
    surface: "properties",
    studio: NO_STUDIO_CALLS,
  };
  control.pin = pin;
  control.state = state;
  if (value !== null) control.value = value;
  document.body.append(control);
  return control;
}

/** The one field of the control that `selector` finds, once it is drawn. */
async function fieldNamed<Field extends HTMLElement>(control: TypeChoice, selector: string): Promise<Field> {
  return vi.waitFor(() => {
    const field = control.querySelector<Field>(selector);
    if (field === null) throw new Error(`the control draws no ${selector} yet`);
    return field;
  });
}

/** Types `words` into the React text field `field` in place of what it holds, then commits them with Enter, as a person does. */
async function typedAndCommitted(field: HTMLInputElement, words: string): Promise<void> {
  field.focus();
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(field, words);
  field.dispatchEvent(new Event("input", { bubbles: true }));
  await vi.waitFor(() => expect(field.value).toBe(words));
  field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
}

/** Each entry of the menu open now, as its words and the pin type its mark colours it as. */
async function entriesOfTheOpenMenu(): Promise<{ words: string; mark: string | null }[]> {
  return vi.waitFor(() => {
    const entries = [...document.querySelectorAll<HTMLElement>("[role=menuitem]")];
    if (entries.length === 0) throw new Error("no menu is open");
    return entries.map((entry) => ({ words: entry.textContent, mark: entry.querySelector("[data-property-pin-type-mark]")?.getAttribute("data-pin-type") ?? null }));
  });
}

/** The entry of the menu open now whose words are `words`. */
async function entryNamed(words: string): Promise<HTMLElement> {
  return vi.waitFor(() => {
    const entry = [...document.querySelectorAll<HTMLElement>("[role=menuitem]")].find((item) => item.textContent === words);
    if (entry === undefined) throw new Error(`the menu offers no ${words}`);
    return entry;
  });
}

/** Opens the menu of the button named `label`, as a click on it does. */
async function openedMenuNamed(control: TypeChoice, label: string): Promise<void> {
  (await fieldNamed<HTMLButtonElement>(control, `button[aria-label="${label}"]`)).click();
}

/** The words of the tooltip shown now; it shows once the pointer has rested on `entry`. */
async function tooltipShownResting(entry: HTMLElement): Promise<string> {
  fireEventsOfAPointerComingToRest(entry);
  return vi.waitFor(
    () => {
      const tooltip = document.querySelector<HTMLElement>("[data-slot=tooltip-content]");
      if (tooltip === null) throw new Error("no tooltip shows");
      return tooltip.textContent;
    },
    { timeout: 2_000 },
  );
}

/** The events a mouse sends coming to rest on `element`. */
function fireEventsOfAPointerComingToRest(element: HTMLElement): void {
  element.dispatchEvent(new PointerEvent("pointerenter", { pointerType: "mouse" }));
  element.dispatchEvent(new MouseEvent("mouseenter"));
  element.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
  element.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerType: "mouse" }));
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("the type choice", () => {
  it("is the class the Studio defines for a Pin type choice input", () => {
    expectTypeOf(TypeChoice).toExtend<InputControlElementClass<"pin_type_choice">>();
  });

  it("lists each type its setting allows, named as the built-in type list names it and marked with its socket's colour", async () => {
    const control = mountedTypeChoice({ type: "texture" }, [{ type: "texture" }, { type: "encoded_video" }, { type: "audio" }]);
    const menu = await fieldNamed<HTMLButtonElement>(control, "button[aria-label=carries]");
    expect(menu.textContent).toBe("Texture");
    expect(menu.querySelector("[data-property-pin-type-mark]")?.getAttribute("data-pin-type")).toBe("texture");
    menu.click();
    expect(await entriesOfTheOpenMenu()).toEqual([
      { words: "Texture", mark: "texture" },
      { words: "Encoded video", mark: "encoded_video" },
      { words: "Audio", mark: "audio" },
    ]);
  });

  it("lists every built-in type written by its name alone when its setting allows any", async () => {
    const control = mountedTypeChoice({ type: "float" });
    await openedMenuNamed(control, "carries");
    expect((await entriesOfTheOpenMenu()).map((entry) => entry.words)).toEqual([
      "Boolean",
      "Integer",
      "Float",
      "String",
      "Color",
      "Rectangle",
      "Transform",
      "Texture",
      "Audio",
      "Encoded video",
      "Encoded audio",
      "Tensor",
      "Asset",
      "Trigger",
      "Node reference",
    ]);
  });

  it("fires one change carrying the type chosen with no narrowing, and none for the type held, whose narrowing it keeps", async () => {
    const control = mountedTypeChoice({ type: "encoded_video", codecs: ["h264"] }, [{ type: "encoded_video" }, { type: "texture" }]);
    const fired = eventsFiredBy(control);
    await openedMenuNamed(control, "carries");
    (await entryNamed("Encoded video")).click();
    expect(fired).toEqual([]);
    await openedMenuNamed(control, "carries");
    (await entryNamed("Texture")).click();
    expect(fired).toEqual([{ name: "change", value: { type: "texture" } }]);
  });

  it("keeps an encoded type's codecs in one line of text beside its menu, and fires the type with the codecs typed", async () => {
    const control = mountedTypeChoice({ type: "encoded_video", codecs: ["h264", "av1"] });
    const fired = eventsFiredBy(control);
    const codecs = await fieldNamed<HTMLInputElement>(control, 'input[aria-label="Codecs of carries"]');
    expect(codecs.value).toBe("h264, av1");
    await typedAndCommitted(codecs, " vp9 ,, h265 ");
    expect(fired).toEqual([{ name: "change", value: { type: "encoded_video", codecs: ["vp9", "h265"] } }]);
  });

  it("writes an encoded type with no narrowing when its codecs are cleared", async () => {
    const control = mountedTypeChoice({ type: "encoded_audio", codecs: ["opus"] });
    const fired = eventsFiredBy(control);
    const codecs = await fieldNamed<HTMLInputElement>(control, 'input[aria-label="Codecs of carries"]');
    await typedAndCommitted(codecs, "");
    expect(fired).toEqual([{ name: "change", value: { type: "encoded_audio" } }]);
  });

  it("keeps a Texture's pixel format in a menu of the format names beside its menu", async () => {
    const control = mountedTypeChoice({ type: "texture", pixel_formats: ["nv12"] });
    const fired = eventsFiredBy(control);
    const pixelFormat = await fieldNamed<HTMLButtonElement>(control, 'button[aria-label="Pixel format of carries"]');
    expect(pixelFormat.textContent).toBe("nv12");
    pixelFormat.click();
    expect((await entriesOfTheOpenMenu()).map((entry) => entry.words)).toEqual(["any format", "rgba8_unorm", "rgba8_unorm_srgb", "bgra8_unorm", "bgra8_unorm_srgb", "rgba16_float", "rgba32_float", "nv12"]);
    (await entryNamed("rgba16_float")).click();
    expect(fired).toEqual([{ name: "change", value: { type: "texture", pixel_formats: ["rgba16_float"] } }]);
    await openedMenuNamed(control, "Pixel format of carries");
    (await entryNamed("any format")).click();
    expect(fired.at(-1)).toEqual({ name: "change", value: { type: "texture" } });
  });

  it("draws no field beside the menu for a type that cannot be narrowed", async () => {
    const control = mountedTypeChoice({ type: "boolean" });
    await fieldNamed(control, "button[aria-label=carries]");
    expect(control.querySelectorAll("button, input")).toHaveLength(1);
  });

  it("shows the type and its narrowing read only, offering no choice, while it cannot be edited", async () => {
    const control = mountedTypeChoice({ type: "encoded_video", codecs: ["h264"] }, [], "driven_by_wire");
    const menu = await fieldNamed<HTMLInputElement>(control, "input[aria-label=carries]");
    expect(menu.value).toBe("Encoded video");
    expect(menu.readOnly).toBe(true);
    expect(control.querySelector("[data-property-pin-type-mark]")?.getAttribute("data-pin-type")).toBe("encoded_video");
    expect((await fieldNamed<HTMLInputElement>(control, 'input[aria-label="Codecs of carries"]')).readOnly).toBe(true);
    expect(control.querySelector("button")).toBeNull();
  });

  describe("among the bundles its stream declares", () => {
    const READING_MEMBERS = [
      { name: "level", member_type: { type: "float" } },
      { name: "pitch", member_type: { type: "integer" } },
    ] as const satisfies Extract<PinType, { type: "bundle" }>["members"];
    const READING: PinType = { type: "bundle", name: "Reading", members: [...READING_MEMBERS] };
    const TONE: PinType = { type: "bundle", name: "Tone", members: [{ name: "hertz", member_type: { type: "float" } }] };
    const READING_SAVED_UNNAMED: PinType = { type: "bundle", members: [...READING_MEMBERS] };

    it("names each bundle on offer by the class that declares it, marked as a bundle, with its members on the entry's tooltip", async () => {
      const control = mountedTypeChoice(null, [READING, TONE], "editable", true);
      await openedMenuNamed(control, "carries");
      expect(await entriesOfTheOpenMenu()).toEqual([
        { words: "Reading", mark: "bundle" },
        { words: "Tone", mark: "bundle" },
      ]);
      expect(await tooltipShownResting(await entryNamed("Reading"))).toBe("level: Float, pitch: Integer");
    });

    it("shows a bundle saved before bundles were named as the listed bundle of its members, and fires the named bundle picked", async () => {
      const control = mountedTypeChoice(READING_SAVED_UNNAMED, [READING, TONE], "editable", true);
      const fired = eventsFiredBy(control);
      expect((await fieldNamed<HTMLButtonElement>(control, "button[aria-label=carries]")).textContent).toBe("Reading");
      await openedMenuNamed(control, "carries");
      (await entryNamed("Reading")).click();
      expect(fired).toEqual([]);
      await openedMenuNamed(control, "carries");
      (await entryNamed("Tone")).click();
      expect(fired).toEqual([{ name: "change", value: TONE }]);
    });

    it("says the stream declares no bundle, offering no type, while it declares none", async () => {
      const control = mountedTypeChoice(null, [], "editable", true);
      await openedMenuNamed(control, "carries");
      await vi.waitFor(() => expect(document.querySelector("[role=menu]")?.textContent).toBe("No node type in this stream declares a bundle."));
      expect(document.querySelectorAll("[role=menuitem]")).toHaveLength(0);
    });
  });
});
