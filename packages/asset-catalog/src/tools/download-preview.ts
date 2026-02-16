import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolContext } from "../types.js";
import { CatalogQueries } from "../db/queries.js";
import { downloadPreview } from "../downloader/preview.js";

export function registerDownloadPreview(
  server: McpServer,
  ctx: ToolContext
): void {
  server.tool(
    "download_preview",
    "Download a specific preview image from OpenGameArt.org to the local cache. Returns image dimensions and format info from sharp. The preview must exist in the database (from crawl_asset_detail).",
    { preview_id: z.number().int().positive().describe("Preview ID from crawl_asset_detail results") },
    async ({ preview_id }) => {
      try {
        const queries = new CatalogQueries(ctx.db);
        const preview = queries.getPreviewById(preview_id);

        if (!preview) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  error: `Preview with ID ${preview_id} not found. Run crawl_asset_detail first.`,
                }),
              },
            ],
            isError: true,
          };
        }

        if (preview.downloaded) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  preview_id,
                  already_downloaded: true,
                  local_path: preview.local_path,
                }),
              },
            ],
          };
        }

        await ctx.rateLimiter.wait();

        const result = await downloadPreview(
          preview.url,
          ctx.previewDir,
          preview_id
        );

        queries.markPreviewDownloaded(preview_id, result.local_path);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                preview_id,
                local_path: result.local_path,
                width: result.width,
                height: result.height,
                format: result.format,
                channels: result.channels,
                has_alpha: result.has_alpha,
                byte_size: result.byte_size,
              }),
            },
          ],
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
          isError: true,
        };
      }
    }
  );
}
