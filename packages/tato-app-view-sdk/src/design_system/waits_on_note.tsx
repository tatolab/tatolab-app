/** The line naming the runtime work or release something waits on, as `tatolab/streamlib#3485`. */
export function WaitsOnNote({ waitsOn }: { waitsOn: string }) {
  return (
    <span className="mt-1 block text-2xs text-fg-3">
      Waits on <span className="font-mono">{waitsOn}</span>
    </span>
  );
}
