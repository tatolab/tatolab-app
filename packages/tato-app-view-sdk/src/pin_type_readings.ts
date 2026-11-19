// A pin's type and flow as a view reads them: the generated types of the runtime's control contract,
// which `./pin_types` takes from the runtime client. Studio's own build hands them to a view, so a
// view reads them as typed and decodes none.

export type { BuiltInPinTypeName, BundleMember, DeclaredPinType, NodeInputMode, PinAnnotations, PinFlow, PinType } from "./pin_types.js";
