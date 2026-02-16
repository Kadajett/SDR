import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { join, extname } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import sharp from "sharp";

export interface DownloadResult {
  local_path: string;
  width: number;
  height: number;
  format: string;
  channels: number;
  has_alpha: boolean;
  byte_size: number;
}

export async function downloadPreview(
  url: string,
  previewDir: string,
  previewId: number
): Promise<DownloadResult> {
  if (!existsSync(previewDir)) {
    mkdirSync(previewDir, { recursive: true });
  }

  // Determine file extension from URL
  const urlPath = new URL(url).pathname;
  let ext = extname(urlPath).toLowerCase();
  if (!ext || ![".png", ".jpg", ".jpeg", ".gif", ".webp"].includes(ext)) {
    ext = ".png";
  }

  const filename = `preview_${previewId}${ext}`;
  const localPath = join(previewDir, filename);

  // Download the image
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }

  const body = response.body;
  if (!body) {
    throw new Error(`No response body for ${url}`);
  }

  // Write to disk
  const nodeStream = Readable.fromWeb(body as Parameters<typeof Readable.fromWeb>[0]);
  await pipeline(nodeStream, createWriteStream(localPath));

  // Get image metadata via sharp
  const metadata = await sharp(localPath).metadata();

  return {
    local_path: localPath,
    width: metadata.width ?? 0,
    height: metadata.height ?? 0,
    format: metadata.format ?? "unknown",
    channels: metadata.channels ?? 3,
    has_alpha: metadata.hasAlpha ?? false,
    byte_size: metadata.size ?? 0,
  };
}
