// Writes the kit into `dist/kit/`, as the SDK's build does after the supplied modules.
//
// Usage: node scripts/write_view_sdk_kit.ts
import { VIEW_SDK_KIT_FOLDER, writeTheViewSdkKit } from "./view_sdk_kit.ts";

writeTheViewSdkKit(VIEW_SDK_KIT_FOLDER);
