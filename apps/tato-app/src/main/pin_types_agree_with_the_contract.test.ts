// The view SDK names a pin's type and flow by the generated types it takes from the runtime client,
// and the control contract names its own component types in the same client. Each is assignable to
// the other, so a contract whose component and generated type part fails Studio's type check and
// with it the build.

import type { ControlContractComponents } from "@tatolab/runtime-client";
import type { DeclaredPinType, PinFlow, PinType } from "@tatolab/tato-app-view-sdk/pin_types";
import { expectTypeOf, test } from "vitest";

type TheContracts<Component extends "PinType" | "DeclaredPinType" | "PinFlow"> = ControlContractComponents[Component];

test("the_sdks_pin_type_is_the_contracts_pin_type", () => {
  expectTypeOf<PinType>().toExtend<TheContracts<"PinType">>();
  expectTypeOf<TheContracts<"PinType">>().toExtend<PinType>();
});

test("the_sdks_declared_pin_type_is_the_contracts_declared_pin_type", () => {
  expectTypeOf<DeclaredPinType>().toExtend<TheContracts<"DeclaredPinType">>();
  expectTypeOf<TheContracts<"DeclaredPinType">>().toExtend<DeclaredPinType>();
});

test("the_sdks_pin_flow_is_the_contracts_pin_flow", () => {
  expectTypeOf<PinFlow>().toExtend<TheContracts<"PinFlow">>();
  expectTypeOf<TheContracts<"PinFlow">>().toExtend<PinFlow>();
});
