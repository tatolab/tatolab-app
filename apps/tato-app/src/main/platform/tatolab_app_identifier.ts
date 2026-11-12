import type { TatolabAppBuildFeatures } from "../tatolab_app_build_features.js";

/** The installed app's identifier, which names its own config directory, `<appData>/com.tatolab.tatolab`. */
export const TATOLAB_APP_IDENTIFIER = "com.tatolab.tatolab";

/** A local-proof build's identifier, so its config directory is never the installed app's. */
export const TATOLAB_LOCAL_PROOF_APP_IDENTIFIER = "com.tatolab.tatolab.proof";

/** The identifier that names this build's config directory: a local-proof build's own, else the installed app's. */
export function tatolabAppIdentifierOfTheBuild(buildFeatures: Pick<TatolabAppBuildFeatures, "machineDirectoriesUnderATestRoot">): string {
  return buildFeatures.machineDirectoriesUnderATestRoot ? TATOLAB_LOCAL_PROOF_APP_IDENTIFIER : TATOLAB_APP_IDENTIFIER;
}
