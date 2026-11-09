/** Whether the window is on screen: the page reports a hidden, minimized or fully covered window as hidden. */
export function isTatolabWindowVisible(): boolean {
  return document.visibilityState === "visible";
}

/** Calls `listener` each time the window is shown or hidden. */
export function onTatolabWindowVisibilityChanged(listener: (isVisible: boolean) => void): void {
  document.addEventListener("visibilitychange", () => listener(isTatolabWindowVisible()));
}
