import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface CatalogAsset {
  key: string;
  file: string;
  source: string;
  width: number;
  height: number;
  license: string;
  tags: string[];
  category: string;
}

interface Catalog {
  assets: CatalogAsset[];
}

let catalog: Catalog | null = null;

function loadCatalog(): Catalog {
  if (!catalog) {
    const data = readFileSync(join(__dirname, "catalog.json"), "utf-8");
    catalog = JSON.parse(data) as Catalog;
  }
  return catalog;
}

/**
 * Find assets matching any of the given keywords (matched against tags).
 * Returns up to `limit` assets sorted by relevance (number of tag matches).
 */
export function queryAssets(keywords: string[], limit = 8): CatalogAsset[] {
  const cat = loadCatalog();
  const lowerKeywords = keywords.map((k) => k.toLowerCase());

  const scored = cat.assets.map((asset) => {
    const score = asset.tags.reduce((acc, tag) => {
      const tagLower = tag.toLowerCase();
      return acc + lowerKeywords.filter((kw) => tagLower.includes(kw) || kw.includes(tagLower)).length;
    }, 0);
    return { asset, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.asset);
}

/**
 * Get all available assets from the catalog.
 */
export function getAllAssets(): CatalogAsset[] {
  return loadCatalog().assets;
}
