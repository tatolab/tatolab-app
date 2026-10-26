import builtTatolabAppBuildFeatures from "./tatolab_app_build_features.json" with { type: "json" };

/** The features this build was built with: `out/main/tatolab_app_build_features.json`, as `scripts/tatolab_app_build_features.mjs write` wrote it. */
export const TATOLAB_APP_BUILD_FEATURES: Readonly<typeof builtTatolabAppBuildFeatures> = builtTatolabAppBuildFeatures;
