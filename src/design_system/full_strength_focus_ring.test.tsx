// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react";
import { Ban, Plus } from "lucide-react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { ActionButton } from "./action_button";
import { CopyIconButton } from "./copy_icon_button";
import { IconButton } from "./icon_button";
import { InlineLink } from "./inline_link";
import { ListRowButton } from "./list_row_button";
import { FieldMenu, MenuItem, MoreActionsMenu } from "./menus";
import { PageTabs } from "./page_tabs";
import { SearchOpeningButton } from "./search_opening_button";
import { SegmentedChoiceControl } from "./segmented_choice_control";
import { ToggleIconButton } from "./toggle_icon_button";

afterEach(cleanup);

describe("every design-system control", () => {
  it("draws its focus ring at the ring token's full strength, never stock shadcn's half-strength one", () => {
    const { container } = render(
      <MemoryRouter>
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
        <ListRowButton onPressed={() => {}}>Show in graph</ListRowButton>
        <InlineLink destination={{ onPressed: () => {} }}>Open</InlineLink>
        <InlineLink destination={{ to: "/" }}>Streams</InlineLink>
        <SearchOpeningButton label="Search" shortcutHint="⌘ K" ariaKeyShortcuts="Meta+K" onPressed={() => {}} />
        <PageTabs label="main views" tabs={[{ tab: "logs", label: "Logs", path: "/logs" }]} shownTab="logs" />
        <MoreActionsMenu label="More for main">
          <MenuItem onChosen={() => {}}>Copy project folder path</MenuItem>
        </MoreActionsMenu>
        <FieldMenu label="Output to preview" words="camera">
          <MenuItem onChosen={() => {}}>camera</MenuItem>
        </FieldMenu>
      </MemoryRouter>,
    );
    const focusableControls = [...container.querySelectorAll<HTMLElement>("button, a")];

    expect(focusableControls.length).toBeGreaterThanOrEqual(13);
    for (const control of focusableControls) {
      expect(control.className, control.outerHTML).toContain("focus-visible:ring-ring");
      expect(control.className, control.outerHTML).not.toMatch(/focus-visible:ring-ring\/50\b/);
    }
  });
});
