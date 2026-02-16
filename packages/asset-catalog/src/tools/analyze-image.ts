import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolContext } from "../types.js";
import { CatalogQueries } from "../db/queries.js";
import {
  getRawImageData,
  detectTransparency,
  detectTileGrid,
  extractDominantColors,
} from "../analysis/image-analyzer.js";
import { categorize } from "../analysis/categorizer.js";

export function registerAnalyzeImage(
  server: McpServer,
  ctx: ToolContext
): void {
  server.tool(
    "analyze_image",
    "Analyze a downloaded preview image: detect tile grid, categorize (tilesheet/spritesheet/background/effect/etc.), extract dominant colors, check transparency. The preview must be downloaded first (via download_preview).",
    { preview_id: z.number().int().positive().describe("Preview ID of a downloaded preview image") },
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
                  error: `Preview with ID ${preview_id} not found.`,
                }),
              },
            ],
            isError: true,
          };
        }

        if (!preview.downloaded || !preview.local_path) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  error: `Preview ${preview_id} has not been downloaded yet. Run download_preview first.`,
                }),
              },
            ],
            isError: true,
          };
        }

        // Get raw pixel data
        const raw = await getRawImageData(preview.local_path);

        // Analysis
        const hasTransparency = detectTransparency(raw);
        const tileGrid = detectTileGrid(raw);
        const dominantColors = extractDominantColors(raw);

        // Get asset tags for categorization
        const tags = queries.getAssetTags(preview.asset_id);

        // Categorize
        const { category, confidence } = categorize({
          width: raw.width,
          height: raw.height,
          has_transparency: hasTransparency,
          tile_grid: tileGrid,
          tags,
        });

        const analysisResult = {
          width: raw.width,
          height: raw.height,
          has_transparency: hasTransparency,
          tile_grid: tileGrid,
          dominant_colors: dominantColors,
          category,
          confidence,
        };

        // Save to database
        queries.saveAnalysis(preview_id, analysisResult);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                preview_id,
                ...analysisResult,
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
