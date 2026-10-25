/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** `1` builds the Watch placeholder for exposed outputs in; anything else leaves it out. */
  readonly VITE_TATOLAB_FEATURE_WATCH_EXPOSED_OUTPUT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
