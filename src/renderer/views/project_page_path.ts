/** The tabs of a project's page, in the order its header shows them. */
export const PROJECT_PAGE_TABS = ["streams", "logs"] as const;

/** One tab of a project's page. */
export type ProjectPageTab = (typeof PROJECT_PAGE_TABS)[number];

/** The path of the page of the project in `projectDirectory` in the window's router, on `tab`; Streams is the page's own path. */
export function projectPagePath(projectDirectory: string, tab: ProjectPageTab = "streams"): string {
  const projectPath = `/projects/${encodeURIComponent(projectDirectory)}`;
  return tab === "streams" ? projectPath : `${projectPath}/${tab}`;
}

/** The tab a project page's path names after the project: Streams when it names none, `null` when it names no tab. */
export function projectPageTabNamed(tabInThePath: string | undefined): ProjectPageTab | null {
  if (tabInThePath === undefined) return "streams";
  return PROJECT_PAGE_TABS.find((tab) => tab === tabInThePath && tab !== "streams") ?? null;
}
