/** One choice of the desktop open dialog's file filter: its name and the extensions it shows, `*` for every file. */
export interface ProjectAssetFileFilter {
  name: string;
  extensions: readonly string[];
}

/** The extensions streamlib's `streamlib-asset-media-facts` readers choose a reader by, for each `media_facts` member; a medium no file's extension tells it is absent. */
const FILE_EXTENSIONS_THE_RUNTIME_READS_AS: ReadonlyMap<string, { mediumWords: string; extensions: readonly string[] }> = new Map([
  ["image", { mediumWords: "image", extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp", "tif", "tiff", "hdr", "exr"] }],
  ["video", { mediumWords: "video", extensions: ["mp4", "m4v", "mov", "mkv", "webm"] }],
  ["audio", { mediumWords: "audio", extensions: ["wav", "mp3", "flac", "aac", "ogg", "oga", "opus", "aiff", "aif", "caf", "m4a", "mka", "mp4", "m4v", "mov", "mkv", "webm"] }],
  ["lut", { mediumWords: "LUT", extensions: ["cube"] }],
]);

const EVERY_FILE: ProjectAssetFileFilter = { name: "All files", extensions: ["*"] };

/** The import dialog's filters for a field taking `media`: one for those media's files, as "Image files", first and so chosen, then every file; every file alone for `null`, or when a medium has no extension the runtime reads it from. */
export function projectAssetFileFiltersFor(media: readonly string[] | null): readonly ProjectAssetFileFilter[] {
  if (media === null || media.length === 0) return [EVERY_FILE];
  const filtersOfEachMedium: { mediumWords: string; extensions: readonly string[] }[] = [];
  for (const medium of media) {
    const filterOfTheMedium = FILE_EXTENSIONS_THE_RUNTIME_READS_AS.get(medium);
    if (filterOfTheMedium === undefined) return [EVERY_FILE];
    filtersOfEachMedium.push(filterOfTheMedium);
  }
  const extensions = [...new Set(filtersOfEachMedium.flatMap((filterOfTheMedium) => filterOfTheMedium.extensions))];
  const mediaWords = filtersOfEachMedium.map((filterOfTheMedium) => filterOfTheMedium.mediumWords).join(" and ");
  return [{ name: `${mediaWords.charAt(0).toUpperCase()}${mediaWords.slice(1)} files`, extensions }, EVERY_FILE];
}
