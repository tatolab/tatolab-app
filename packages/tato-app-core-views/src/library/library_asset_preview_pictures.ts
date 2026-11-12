// The preview pictures the Library's asset cards and details show, each read once per asset and
// content digest through the view's connection, a few at a time, so a rename or move keeps the
// picture and a replace reads it again.

import type { AssetPreviewReading, ProjectAsset } from "@tatolab/tato-app-view-sdk/studio_readings";

/** How many preview pictures are read from Studio at once. */
const PREVIEW_PICTURE_READS_AT_ONCE = 4;

/** An asset's preview picture as the Library holds it: being read, read, or why not. */
export type LibraryAssetPreviewPicture = { kind: "reading" } | AssetPreviewReading;

/** Reads `asset`'s preview picture from Studio. */
export type ReadAnAssetPreviewPicture = (asset: string) => Promise<AssetPreviewReading>;

/** The `data:` URL to draw for a held picture, `null` while it is being read, was refused, or the asset has none. */
export function previewPictureUrlOf(previewPicture: LibraryAssetPreviewPicture | null): string | null {
  return previewPicture?.kind === "read" ? previewPicture.picture.picture_url : null;
}

/** The runtime's words for why a held picture was not read, `null` while it is being read, was read, or the asset has none. */
export function previewPictureNotReadBecauseOf(previewPicture: LibraryAssetPreviewPicture | null): string | null {
  return previewPicture?.kind === "not_read" ? previewPicture.because : null;
}

/** The key a picture is kept under: its asset and the digest of the bytes it was made from. */
function previewPictureKeyOf(asset: ProjectAsset): string {
  return `${asset.asset}:${asset.content_sha256}`;
}

/** The preview pictures read for one project's assets, each read once per content digest, at most a few at a time, calling `onPictureRead` as each one lands. */
export class LibraryAssetPreviewPicturesReadOnce {
  private readonly picturesByKey = new Map<string, LibraryAssetPreviewPicture>();
  private readonly assetsWaitingToBeRead: ProjectAsset[] = [];
  private readsUnderWay = 0;
  private isStopped = false;

  constructor(
    private readonly readThePicture: ReadAnAssetPreviewPicture,
    private readonly onPictureRead: () => void,
  ) {}

  /** `asset`'s picture as held: `null` for an asset the runtime makes none for; asked of Studio the first time it is wanted for these bytes. */
  pictureOf(asset: ProjectAsset): LibraryAssetPreviewPicture | null {
    if (asset.preview === null) return null;
    const key = previewPictureKeyOf(asset);
    const held = this.picturesByKey.get(key);
    if (held !== undefined) return held;
    this.picturesByKey.set(key, { kind: "reading" });
    this.assetsWaitingToBeRead.push(asset);
    queueMicrotask(() => this.readTheNextPictures());
    return { kind: "reading" };
  }

  /** Read nothing more and report no picture that lands after. */
  stop(): void {
    this.isStopped = true;
    this.assetsWaitingToBeRead.length = 0;
  }

  private readTheNextPictures(): void {
    while (!this.isStopped && this.readsUnderWay < PREVIEW_PICTURE_READS_AT_ONCE) {
      const asset = this.assetsWaitingToBeRead.shift();
      if (asset === undefined) return;
      this.readsUnderWay += 1;
      const keepTheReading = (reading: AssetPreviewReading) => {
        this.readsUnderWay -= 1;
        if (this.isStopped) return;
        this.picturesByKey.set(previewPictureKeyOf(asset), reading);
        this.onPictureRead();
        this.readTheNextPictures();
      };
      void this.readThePicture(asset.asset).then(keepTheReading, (rejection: unknown) => keepTheReading({ kind: "not_read", because: `Tato Studio did not answer: ${String(rejection)}` }));
    }
  }
}
