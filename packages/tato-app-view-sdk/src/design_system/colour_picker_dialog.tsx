import { useEffect, useId, useState } from "react";
import { HexColorPicker } from "react-colorful";
import { ActionButton } from "./action_button";
import { FormDialog, FormDialogFooter } from "./form_dialog";
import { TextField } from "./text_field";
import type { ControlDataAttributes } from "./support/control_data_attributes";

/** Whether `typed` is a colour as `#rrggbb` writes it, the one shape the picker reads and answers. */
export function isAHexColour(typed: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(typed);
}

/** Picking a colour of one's own over the window: a saturation and hue area, its hex value to type, and colours used recently to choose again. */
export function ColourPickerDialog({
  isOpen,
  onOpenChange,
  title,
  startingColour,
  recentColours,
  onColourPicked,
  ...controlDataAttributes
}: {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  title: string;
  /** The `#rrggbb` the picker opens on. */
  startingColour: string;
  /** Each a `#rrggbb`, shown as a swatch that picks it. */
  recentColours: readonly string[];
  onColourPicked: (colour: string) => void;
} & ControlDataAttributes) {
  const [pickedColour, setPickedColour] = useState(startingColour);
  const [typedColour, setTypedColour] = useState(startingColour);
  const hexFieldId = useId();
  useEffect(() => {
    if (!isOpen) return;
    setPickedColour(startingColour);
    setTypedColour(startingColour);
  }, [isOpen, startingColour]);
  const pickTheColour = (colour: string) => {
    setPickedColour(colour);
    setTypedColour(colour);
  };
  const useThePickedColour = () => {
    onColourPicked(pickedColour.toLowerCase());
    onOpenChange(false);
  };
  return (
    <FormDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={title}
      description="Type a hex value, or drag to pick a color."
      footer={
        <FormDialogFooter>
          <span className="flex-1" />
          <ActionButton onPressed={() => onOpenChange(false)} data-colour-picker-action="cancel">
            Cancel
          </ActionButton>
          <ActionButton appearance="primary" onPressed={useThePickedColour} data-colour-picker-action="use">
            Use color
          </ActionButton>
        </FormDialogFooter>
      }
      {...controlDataAttributes}
    >
      <div className="colour-picker flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <span className="colour-picker-picked-swatch" style={{ backgroundColor: pickedColour }} aria-hidden />
          <label htmlFor={hexFieldId} className="text-fg-2">
            Hex
          </label>
          <TextField
            id={hexFieldId}
            label="Hex color"
            text={typedColour}
            isMachineWord
            isRefused={!isAHexColour(typedColour)}
            onTextChanged={(typed) => {
              setTypedColour(typed);
              if (isAHexColour(typed)) setPickedColour(typed);
            }}
            data-colour-picker-hex=""
          />
          {recentColours.length > 0 && (
            <span className="ml-auto flex shrink-0 items-center gap-1.5" aria-label="Recent colors" role="group">
              <span className="text-xs text-fg-3">Recent</span>
              {recentColours.map((colour) => (
                <button
                  key={colour}
                  type="button"
                  className="colour-picker-recent-swatch"
                  style={{ backgroundColor: colour }}
                  aria-label={colour.toUpperCase()}
                  title={colour.toUpperCase()}
                  onClick={() => pickTheColour(colour)}
                  data-colour-picker-recent={colour}
                />
              ))}
            </span>
          )}
        </div>
        <HexColorPicker color={pickedColour} onChange={pickTheColour} style={{ width: "100%", height: "clamp(96px, calc(100vh - 17rem), 160px)" }} />
      </div>
    </FormDialog>
  );
}
