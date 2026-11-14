/** Hands `text` to the browser as a download named `fileName`, so the person saves it where they choose. */
export function downloadTextAsFile(fileName: string, text: string, mediaType: string): void {
  const fileUrl = URL.createObjectURL(new Blob([text], { type: mediaType }));
  const downloadLink = document.createElement("a");
  downloadLink.href = fileUrl;
  downloadLink.download = fileName;
  downloadLink.click();
  URL.revokeObjectURL(fileUrl);
}
