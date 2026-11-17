// The modules the Studio supplies to a view by name. `supplied_modules.json` lists them; the SDK's
// build writes each as one `.js` under `dist/studio_sdk/`, or copies a stylesheet there as it is,
// which the Studio serves at `/studio_sdk/`; and the import map made here resolves each name to
// that file. A page holds the map before any module script, so a view imports the SDK the Studio
// serves with no build, and a stylesheet as a CSS module script.

import suppliedModulesList from "../supplied_modules.json" with { type: "json" };

/** One module the Studio supplies: the name a view imports it by, and the file under `/studio_sdk/` that name resolves to. */
export interface SuppliedModule {
  readonly name: string;
  readonly served_file: string;
  /** Whether its built file holds no library's code, which the SDK's build asserts, so none of a library's types reach an author through it. */
  readonly imports_no_library: boolean;
}

/** Every module the Studio supplies, as `supplied_modules.json` lists them. */
export const SUPPLIED_MODULES: readonly SuppliedModule[] = suppliedModulesList;

/** Whether `suppliedModule` is a stylesheet, imported as a CSS module script, rather than a JavaScript module. */
export function isASuppliedStylesheet(suppliedModule: SuppliedModule): boolean {
  return suppliedModule.served_file.endsWith(".css");
}

/** Where the Studio serves the supplied modules, on the window page's own origin. */
export const SUPPLIED_MODULES_PATH = "/studio_sdk/";

/** The import map's JSON: each supplied module's name resolved to its file under `/studio_sdk/`. */
export const SUPPLIED_MODULES_IMPORT_MAP_TEXT = JSON.stringify({
  imports: Object.fromEntries(SUPPLIED_MODULES.map((suppliedModule) => [suppliedModule.name, `${SUPPLIED_MODULES_PATH}${suppliedModule.served_file}`])),
});

/** A page's doctype, after a byte order mark, white space and comments. */
const DOCTYPE_AT_THE_START_OF_A_PAGE = /^\uFEFF?(?:\s|<!--[\s\S]*?-->)*<!doctype[^>]*>/i;

/** `pageHtml` with the supplied modules' import map straight after its doctype, or first when it has none, so the map comes before any module script. */
export function withTheSuppliedModulesImportMap(pageHtml: string): string {
  const importMapScript = `<script type="importmap">${SUPPLIED_MODULES_IMPORT_MAP_TEXT}</script>`;
  const doctypeEnd = DOCTYPE_AT_THE_START_OF_A_PAGE.exec(pageHtml)?.[0].length ?? 0;
  return `${pageHtml.slice(0, doctypeEnd)}${importMapScript}${pageHtml.slice(doctypeEnd)}`;
}
