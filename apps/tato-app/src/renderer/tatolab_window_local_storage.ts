/** The window page's `localStorage`, as the parts of the window that keep a choice between launches use it; `null` where the page may not use it. */
export type TatolabWindowLocalStorage = Pick<Storage, "getItem" | "setItem"> | null;

/** The page's `localStorage`, or `null` where the page may not use it. */
export function tatolabWindowLocalStorage(): TatolabWindowLocalStorage {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
