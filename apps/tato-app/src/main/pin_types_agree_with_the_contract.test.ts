// The view SDK names a pin's type and flow by the generated types it takes from the runtime client,
// and main decodes them with the control contract's own schemas from the same client. Each is
// assignable to the other, so a contract whose schema and generated type part fails Studio's type
// check and with it the build.

import type { ControlSchemas } from "@tatolab/runtime-client";
import type { DeclaredPinType, PinFlow, PinType } from "@tatolab/tato-app-view-sdk/pin_types";
import { expectTypeOf, test } from "vitest";
import type { z } from "zod";

type TheContracts<Component extends "PinType" | "DeclaredPinType" | "PinFlow"> = z.infer<(typeof ControlSchemas)["components"][Component]>;

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
