import { projectsHomeChoicesFromKept, type ProjectsHomeChoices } from "../presentation/projects_presentation";
import type { TatolabWindowLocalStorage } from "../tatolab_window_local_storage";

/** The key the Projects window's chosen order and layout are kept under. */
export const PROJECTS_HOME_CHOICES_STORAGE_KEY = "projects-home-choices";

/** The Projects window's chosen order and layout, read from and kept in the page's storage. */
export class ProjectsHomeChoicesKeptInStorage {
  constructor(private readonly storage: TatolabWindowLocalStorage) {}

  /** The choices kept, each the first choice where none is kept or what is kept does not parse. */
  readKeptChoices(): ProjectsHomeChoices {
    try {
      const keptText = this.storage?.getItem(PROJECTS_HOME_CHOICES_STORAGE_KEY) ?? null;
      return projectsHomeChoicesFromKept(keptText === null ? undefined : JSON.parse(keptText));
    } catch {
      return projectsHomeChoicesFromKept(undefined);
    }
  }

  /** Keep `choices`; a page that may not store keeps them only while it is open. */
  keepChoices(choices: ProjectsHomeChoices): void {
    try {
      this.storage?.setItem(PROJECTS_HOME_CHOICES_STORAGE_KEY, JSON.stringify(choices));
    } catch {
      return;
    }
  }
}
