import { describe, expect, it } from "vitest";
import { isAMarketplaceDownloadOf, isTheDistributionOfTheMarketplaceEntry, isTheModuleNamedLikeTheMarketplaceEntry, marketplaceDownloadFileNameOf, moduleFolderNameOf } from "./marketplace_modules.js";

describe("a Marketplace entry among a project's modules", () => {
  it("names a module's folder as the runtime does", () => {
    expect(moduleFolderNameOf("Camera Tools!")).toBe("camera-tools");
    expect(moduleFolderNameOf("Tatolab_Camera")).toBe("tatolab_camera");
    expect(moduleFolderNameOf("a - b")).toBe("a--b");
    expect(moduleFolderNameOf(" !! ")).toBe("module");
  });

  it("tells the entry's module by its folder, or by the name its project file holds", () => {
    expect(isTheModuleNamedLikeTheMarketplaceEntry("tatolab-camera", { folder: "tatolab-camera", name: null })).toBe(true);
    expect(isTheModuleNamedLikeTheMarketplaceEntry("tatolab-camera", { folder: "camera", name: "Tatolab Camera" })).toBe(true);
    expect(isTheModuleNamedLikeTheMarketplaceEntry("tatolab-camera", { folder: "camera", name: "Camera" })).toBe(false);
  });

  it("tells the entry's wheel by its distribution's name, compared as packaging compares names", () => {
    expect(isTheDistributionOfTheMarketplaceEntry("tatolab-camera", "Tatolab_Camera")).toBe(true);
    expect(isTheDistributionOfTheMarketplaceEntry("tatolab-camera", "tatolab.camera")).toBe(true);
    expect(isTheDistributionOfTheMarketplaceEntry("tatolab-camera", "tatolab-camera-extras")).toBe(false);
  });
});

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
