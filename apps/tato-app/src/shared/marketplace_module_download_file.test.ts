import { describe, expect, it } from "vitest";
import { isAMarketplaceDownloadOf, marketplaceDownloadFileNameOf } from "./marketplace_module_download_file.js";

describe("the file a Marketplace entry is downloaded as", () => {
  it("is named by the entry's name and version", () => {
    expect(marketplaceDownloadFileNameOf("tatolab-camera", "0.68.85")).toBe("tatolab-camera-0.68.85.zip");
  });

  it("ties an import's source to the entry it was downloaded for, at any version, on either platform's separator", () => {
    expect(isAMarketplaceDownloadOf("tatolab-camera", "/Users/jo/Library/Application Support/Tato Studio/module-downloads/tatolab-camera-0.68.85.zip")).toBe(true);
    expect(isAMarketplaceDownloadOf("tatolab-camera", "/home/jo/.config/Tato Studio/module-downloads/tatolab-camera-0.69.0+linux.zip")).toBe(true);
    expect(isAMarketplaceDownloadOf("tatolab-camera", "C:\\Users\\jo\\module-downloads\\tatolab-camera-1.0.zip")).toBe(true);
  });

  it("ties no source outside the downloads folder, of another entry, or of an entry whose name only starts the same", () => {
    expect(isAMarketplaceDownloadOf("tatolab-camera", "/home/jo/Downloads/tatolab-camera-0.68.85.zip")).toBe(false);
    expect(isAMarketplaceDownloadOf("tatolab-camera", "/home/jo/module-downloads/tatolab-camera-extras-0.1.0.zip")).toBe(false);
    expect(isAMarketplaceDownloadOf("tatolab-camera-extras", "/home/jo/module-downloads/tatolab-camera-0.68.85.zip")).toBe(false);
    expect(isAMarketplaceDownloadOf("tatolab-camera", "/home/jo/module-downloads/tatolab-camera-0.68.85")).toBe(false);
    expect(isAMarketplaceDownloadOf("tatolab-camera", "/home/jo/shows/camera")).toBe(false);
  });
});
