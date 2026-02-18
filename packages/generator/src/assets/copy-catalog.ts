import { copyFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { getAllAssets } from "./query.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CATALOG_PREVIEWS = join(__dirname, "../../../../data/asset-catalog/previews");

/**
 * Copy a catalog asset to the game's assets directory if it exists locally.
 * Returns true if the asset was found and copied.
 */
export function copyAssetFromCatalog(assetKey: string, targetDir: string): boolean {
  const assets = getAllAssets();
  const asset = assets.find((a) => a.key === assetKey);
  if (!asset) return false;

  const sourcePath = join(CATALOG_PREVIEWS, asset.file);
  if (!existsSync(sourcePath)) return false;

  mkdirSync(targetDir, { recursive: true });
  const destPath = join(targetDir, asset.file);
  copyFileSync(sourcePath, destPath);
  return true;
}

/**
 * Copy all catalog assets that are referenced in the manifest to the target dir.
 * Also saves with the URL-derived filename if a url is provided.
 * Returns list of keys that were successfully copied.
 */
export function copyCatalogAssets(
  entries: Array<{ key: string; url?: string }>,
  targetDir: string,
): string[] {
  const copied: string[] = [];
  for (const entry of entries) {
    if (copyAssetFromCatalog(entry.key, targetDir)) {
      copied.push(entry.key);
      // Also copy with the URL-derived filename so the validator finds it
      if (entry.url && entry.url.startsWith("http")) {
        const urlFilename = entry.url.split("/").pop();
        if (urlFilename) {
          const assets = getAllAssets();
          const asset = assets.find((a) => a.key === entry.key);
          if (asset) {
            const sourcePath = join(CATALOG_PREVIEWS, asset.file);
            const destPath = join(targetDir, urlFilename);
            if (existsSync(sourcePath) && !existsSync(destPath)) {
              copyFileSync(sourcePath, destPath);
            }
          }
        }
      }
    }
  }
  return copied;
}
