/** Copies `text`, falling back to a hidden text area where the async clipboard is not offered. */
export async function writeTextToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // A webview may refuse the async clipboard outside a secure context; the selection copy below still works.
    }
  }
  const hiddenTextArea = document.createElement("textarea");
  hiddenTextArea.setAttribute("aria-hidden", "true");
  hiddenTextArea.className = "visually-hidden";
  hiddenTextArea.value = text;
  document.body.append(hiddenTextArea);
  hiddenTextArea.select();
  document.execCommand("copy");
  hiddenTextArea.remove();
}
