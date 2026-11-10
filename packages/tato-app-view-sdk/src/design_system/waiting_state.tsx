import { Hourglass, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import type { ControlDataAttributes } from "./support/control_data_attributes";
import { EmptyState } from "./empty_state";
import { WaitsOnNote } from "./waits_on_note";

/** What a place shows while what it would show is not here yet: what it is, why, and the work it waits on by name; or, red, why it failed. */
export function WaitingState({
  title,
  explanation,
  waitsOn,
  isFailure = false,
  children,
  ...controlDataAttributes
}: {
  title: string;
  explanation?: ReactNode;
  /** The issue or release it waits on, as `tatolab/streamlib#3152`. */
  waitsOn?: string;
  isFailure?: boolean;
  children?: ReactNode;
} & ControlDataAttributes) {
  return (
    <EmptyState
      icon={isFailure ? TriangleAlert : Hourglass}
      isFailure={isFailure}
      title={title}
      explanation={
        explanation === undefined && waitsOn === undefined ? undefined : (
          <>
            {explanation}
            {waitsOn !== undefined && <WaitsOnNote waitsOn={waitsOn} />}
          </>
        )
      }
      {...controlDataAttributes}
    >
      {children}
    </EmptyState>
  );
}
