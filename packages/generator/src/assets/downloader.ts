import { mkdir, writeFile } from "fs/promises";
import { join } from "path";

export interface AssetDownload {
  url: string;
  filename: string;
  targetDir: string;
}

export async function downloadAssets(assets: AssetDownload[]): Promise<void> {
  for (const asset of assets) {
    await mkdir(asset.targetDir, { recursive: true });

    try {
      const response = await fetch(asset.url);
      if (!response.ok) {
        console.error(`Failed to download ${asset.url}: ${response.status}`);
        continue;
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      const filePath = join(asset.targetDir, asset.filename);
      await writeFile(filePath, buffer);
      console.log(`Downloaded: ${asset.filename}`);
    } catch (err) {
      console.error(`Error downloading ${asset.url}:`, err);
    }
  }
}
