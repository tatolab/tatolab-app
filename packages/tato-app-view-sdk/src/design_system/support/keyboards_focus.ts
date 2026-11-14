/** Whether no element the page shows holds the keyboard's focus, as after the focused one left the page. */
export function isTheKeyboardsFocusOnNothing(): boolean {
  const focusedElement = document.activeElement;
  return focusedElement === null || focusedElement === document.body || !focusedElement.isConnected;
}
