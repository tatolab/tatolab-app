// The view SDK decodes a pin's type and flow with schemas of its own, whose outputs are inferred
// from the schemas. What each decodes, the generated type the SDK names it by, and the control
// contract's own component type are each assignable to the others, so a contract that adds a kind
// or a flow, or a decoder that decodes less, fails Studio's type check and with it the build.

import type { ControlContractComponents } from "@tatolab/runtime-client";
import type { DeclaredPinType, PinFlow, PinType } from "@tatolab/tato-app-view-sdk/pin_types";
import type { declaredPinTypeSchema, pinFlowSchema, pinTypeSchema } from "@tatolab/tato-app-view-sdk/pin_type_readings";
import { expectTypeOf, test } from "vitest";
import type { z } from "zod";

type TheContracts<Component extends "PinType" | "DeclaredPinType" | "PinFlow"> = ControlContractComponents[Component];

test("the_sdks_pin_type_decoder_decodes_the_contracts_pin_type", () => {
  expectTypeOf<z.output<typeof pinTypeSchema>>().toExtend<PinType>();
  expectTypeOf<PinType>().toExtend<z.output<typeof pinTypeSchema>>();
  expectTypeOf<z.output<typeof pinTypeSchema>>().toExtend<TheContracts<"PinType">>();
  expectTypeOf<TheContracts<"PinType">>().toExtend<z.output<typeof pinTypeSchema>>();
});

test("the_sdks_declared_pin_type_decoder_decodes_the_contracts_declared_pin_type", () => {
  expectTypeOf<z.output<typeof declaredPinTypeSchema>>().toExtend<DeclaredPinType>();
  expectTypeOf<DeclaredPinType>().toExtend<z.output<typeof declaredPinTypeSchema>>();
  expectTypeOf<z.output<typeof declaredPinTypeSchema>>().toExtend<TheContracts<"DeclaredPinType">>();
  expectTypeOf<TheContracts<"DeclaredPinType">>().toExtend<z.output<typeof declaredPinTypeSchema>>();
});

test("the_sdks_pin_flow_decoder_decodes_the_contracts_pin_flow", () => {
  expectTypeOf<z.output<typeof pinFlowSchema>>().toExtend<PinFlow>();
  expectTypeOf<PinFlow>().toExtend<z.output<typeof pinFlowSchema>>();
  expectTypeOf<z.output<typeof pinFlowSchema>>().toExtend<TheContracts<"PinFlow">>();
  expectTypeOf<TheContracts<"PinFlow">>().toExtend<z.output<typeof pinFlowSchema>>();
});
