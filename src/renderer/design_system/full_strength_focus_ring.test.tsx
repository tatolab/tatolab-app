// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react";
import { Ban, Plus } from "lucide-react";
import { afterEach, describe, expect, it } from "vitest";
import { ActionButton } from "./action_button";
import { CopyIconButton } from "./copy_icon_button";
import { IconButton } from "./icon_button";
import { InlineLink } from "./inline_link";
import { FieldMenu, MenuItem, MoreActionsMenu } from "./menus";
import { SearchField } from "./search_field";
import { SegmentedChoiceControl } from "./segmented_choice_control";
import { ToggleIconButton } from "./toggle_icon_button";

afterEach(cleanup);

describe("every design-system control", () => {
  it("draws its focus ring at the ring token's full strength, never stock shadcn's half-strength one", () => {
    const { container } = render(
      <>
        <ActionButton icon={Plus} onPressed={() => {}}>
          Add stream
        </ActionButton>
        <ActionButton appearance="destructive" onPressed={() => {}}>
          Remove
        </ActionButton>
        <IconButton icon={Ban} label="Clear" onPressed={() => {}} />
        <ToggleIconButton icon={Ban} label="Wrap lines" isOn onToggled={() => {}} />
        <CopyIconButton label="Copy as JSON" readTextToCopy={() => ""} />
        <SegmentedChoiceControl label="Levels shown" choices={[{ choice: "all", label: "All" }]} chosen="all" onChosen={() => {}} />
        <InlineLink destination={{ onPressed: () => {} }}>Open</InlineLink>
        <SearchField label="Search main logs" placeholder="Search logs" text="MEAN" onTextChanged={() => {}} />
        <MoreActionsMenu label="More for main">
          <MenuItem onChosen={() => {}}>Copy project folder path</MenuItem>
        </MoreActionsMenu>
        <FieldMenu label="Output to preview" words="camera">
          <MenuItem onChosen={() => {}}>camera</MenuItem>
        </FieldMenu>
      </>,
    );
    const focusableControls = [...container.querySelectorAll<HTMLElement>("button, a")];

    expect(focusableControls.length).toBeGreaterThanOrEqual(10);
    for (const control of focusableControls) {
      const focusRingColours = control.className.split(/\s+/).filter((className) => /(^|:)focus-visible:ring-(?!\d|\[)/.test(className));
      // Every theme's focus ring is the ring token at its own strength: no other colour, no opacity, light or dark.
      expect(focusRingColours, control.outerHTML).toContain("focus-visible:ring-ring");
      expect(focusRingColours, control.outerHTML).toContain("dark:focus-visible:ring-ring");
      expect(focusRingColours.filter((className) => !className.endsWith("focus-visible:ring-ring")), control.outerHTML).toEqual([]);
    }
  });
});
