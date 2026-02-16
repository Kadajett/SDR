import type { Page } from "playwright";
import type { AssetDetail } from "../types.js";
import { DETAIL, OGA_BASE_URL, buildDetailUrl } from "./selectors.js";

export async function scrapeAssetDetail(
  page: Page,
  slug: string
): Promise<AssetDetail> {
  const url = buildDetailUrl(slug);
  await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 });

  // Title
  const title = await page
    .$eval(DETAIL.TITLE, (el) => el.textContent?.trim() || "")
    .catch(() => slug);

  // Author
  const author = await page
    .$eval(DETAIL.AUTHOR, (el) => el.textContent?.trim() || "")
    .catch(() => "Unknown");

  // Description
  const description = await page
    .$eval(DETAIL.DESCRIPTION, (el) => el.textContent?.trim() || "")
    .catch(() => "");

  // Favorites
  const favorites = await page
    .$eval(DETAIL.FAVORITES, (el) => {
      const text = el.textContent?.trim() || "0";
      return parseInt(text.replace(/[^0-9]/g, ""), 10) || 0;
    })
    .catch(() => 0);

  // Tags
  const tags = await page
    .$$eval(DETAIL.TAGS, (els) =>
      els.map((el) => el.textContent?.trim().toLowerCase() || "").filter(Boolean)
    )
    .catch(() => [] as string[]);

  // Licenses
  const licenses = await page
    .$$eval(DETAIL.LICENSE, (els) =>
      els
        .map((el) => el.textContent?.trim() || "")
        .filter(Boolean)
        .map((text) => {
          // Normalize license names
          const lower = text.toLowerCase();
          if (lower.includes("cc0") || lower.includes("public domain"))
            return "CC0";
          if (lower.includes("cc-by-sa") || lower.includes("cc by-sa"))
            return "CC-BY-SA";
          if (lower.includes("cc-by") || lower.includes("cc by"))
            return "CC-BY";
          if (lower.includes("gpl")) return "GPL";
          if (lower.includes("lgpl")) return "LGPL";
          if (lower.includes("ofl")) return "OFL";
          return text;
        })
    )
    .catch(() => [] as string[]);

  // Deduplicate licenses
  const uniqueLicenses = [...new Set(licenses)];

  // Files (each span.file contains a link, inline size text, and download count)
  const files = await page
    .$$eval(
      DETAIL.FILES_TABLE,
      (rows, selectors) => {
        return rows
          .map((row) => {
            const link = row.querySelector(selectors.fileLink);
            if (!link) return null;

            const href = link.getAttribute("href") || "";
            const filename =
              link.textContent?.trim() || href.split("/").pop() || "unknown";
            const fullUrl = href.startsWith("http")
              ? href
              : `${selectors.baseUrl}${href}`;

            // File size is inline text in span.file (e.g., "tilemap.png 2.9 Kb [20 download(s)]")
            // Also check the <a> type attribute (e.g., "image/png; length=2911")
            const spanText = row.textContent || "";
            let byteSize: number | null = null;
            const sizeMatch = spanText.match(
              /([\d.]+)\s*(KB|MB|GB|bytes?)/i
            );
            if (sizeMatch) {
              const num = parseFloat(sizeMatch[1]);
              const unit = sizeMatch[2].toUpperCase();
              if (unit.startsWith("BYTE")) byteSize = Math.round(num);
              else if (unit === "KB") byteSize = Math.round(num * 1024);
              else if (unit === "MB")
                byteSize = Math.round(num * 1024 * 1024);
              else if (unit === "GB")
                byteSize = Math.round(num * 1024 * 1024 * 1024);
            }
            // Fallback: parse length from type attribute
            if (byteSize === null) {
              const typeAttr = link.getAttribute("type") || "";
              const lengthMatch = typeAttr.match(/length=(\d+)/);
              if (lengthMatch) {
                byteSize = parseInt(lengthMatch[1], 10);
              }
            }

            // Download count from .dlcount-number
            const dlEl = row.querySelector(selectors.fileDownloads);
            const dlText = dlEl?.textContent?.trim() || "0";
            const downloadCount =
              parseInt(dlText.replace(/[^0-9]/g, ""), 10) || 0;

            // Guess MIME type from filename
            const ext = filename.split(".").pop()?.toLowerCase();
            let mimeType: string | null = null;
            if (ext === "png") mimeType = "image/png";
            else if (ext === "jpg" || ext === "jpeg") mimeType = "image/jpeg";
            else if (ext === "gif") mimeType = "image/gif";
            else if (ext === "svg") mimeType = "image/svg+xml";
            else if (ext === "zip") mimeType = "application/zip";
            else if (ext === "7z")
              mimeType = "application/x-7z-compressed";

            return {
              filename,
              url: fullUrl,
              mime_type: mimeType,
              byte_size: byteSize,
              download_count: downloadCount,
            };
          })
          .filter(
            (f): f is NonNullable<typeof f> => f !== null
          );
      },
      {
        fileLink: DETAIL.FILE_LINK,
        fileDownloads: DETAIL.FILE_DOWNLOADS,
        baseUrl: OGA_BASE_URL,
      }
    )
    .catch(() => [] as AssetDetail["files"]);

  // Preview images
  const previewUrls = await page
    .$$eval(
      DETAIL.PREVIEW_IMAGE,
      (imgs, baseUrl) =>
        imgs
          .map((img) => {
            const src = img.getAttribute("src") || "";
            return src.startsWith("http") ? src : `${baseUrl}${src}`;
          })
          .filter(Boolean),
      OGA_BASE_URL
    )
    .catch(() => [] as string[]);

  // Deduplicate preview URLs
  const uniquePreviews = [...new Set(previewUrls)];

  return {
    title,
    author,
    description,
    favorites,
    tags,
    licenses: uniqueLicenses,
    files,
    preview_urls: uniquePreviews,
  };
}
