import { useEffect, useReducer, useState } from "react";
import type { TatoAppViewConnection } from "@tatolab/tato-app-view-sdk";
import { LibraryAssetPreviewPicturesReadOnce } from "./library_asset_preview_pictures";

/** The preview pictures of the assets of the project in `projectFolder`, read through `connection` while a view shows them, drawn again as each lands. */
export function useAssetPreviewPicturesOfTheProject(connection: Pick<TatoAppViewConnection, "readAssetPreviewInTheProject">, projectFolder: string): LibraryAssetPreviewPicturesReadOnce | null {
  const [, drawAgainForAPictureRead] = useReducer((picturesRead: number) => picturesRead + 1, 0);
  const [previewPictures, setPreviewPictures] = useState<LibraryAssetPreviewPicturesReadOnce | null>(null);
  useEffect(() => {
    const previewPicturesOfThisProject = new LibraryAssetPreviewPicturesReadOnce((asset) => connection.readAssetPreviewInTheProject(projectFolder, asset), drawAgainForAPictureRead);
    setPreviewPictures(previewPicturesOfThisProject);
    return () => previewPicturesOfThisProject.stop();
  }, [connection, projectFolder]);
  return previewPictures;
}
