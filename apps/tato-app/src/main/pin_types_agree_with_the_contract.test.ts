// The view SDK states a pin's type and flow in schemas of its own. Each of its types and the
// control contract's is assignable to the other, so a contract that changes one fails Studio's
// type check, and with it the build, until the SDK follows.

import type { ControlSchemas } from "@tatolab/runtime-client";
import type { DeclaredPinType, PinFlow, PinType } from "@tatolab/tato-app-view-sdk/pin_type_readings";
import { expectTypeOf, test } from "vitest";
import type { z } from "zod";

type TheContracts<Component extends "PinType" | "DeclaredPinType" | "PinFlow"> = z.infer<(typeof ControlSchemas)["components"][Component]>;

test("the_sdks_pin_type_declared_pin_type_and_flow_are_the_contracts", () => {
  expectTypeOf<PinType>().toExtend<TheContracts<"PinType">>();
  expectTypeOf<TheContracts<"PinType">>().toExtend<PinType>();
  expectTypeOf<DeclaredPinType>().toExtend<TheContracts<"DeclaredPinType">>();
  expectTypeOf<TheContracts<"DeclaredPinType">>().toExtend<DeclaredPinType>();
  expectTypeOf<PinFlow>().toExtend<TheContracts<"PinFlow">>();
  expectTypeOf<TheContracts<"PinFlow">>().toExtend<PinFlow>();
});
