import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolContext } from "../types.js";
import { CatalogQueries } from "../db/queries.js";

const CATEGORY_ENUM = z.enum([
  "tilesheet",
  "spritesheet",
  "icon",
  "ui",
  "character",
  "effect",
  "background",
  "other",
]);

export function registerCatalogSearch(
  server: McpServer,
  ctx: ToolContext
): void {
  server.tool(
    "catalog_search",
    "Search the local asset catalog by category, tags, license, dimensions, and tile size. Returns matching assets sorted by favorites. Only returns assets that have been analyzed (detail crawled + preview downloaded + image analyzed).",
    {
      category: CATEGORY_ENUM.optional().describe("Filter by asset category"),
      tags: z.array(z.string()).optional().describe("Filter by tags (asset must have ALL specified tags)"),
      license: z.string().optional().describe("Filter by license (e.g., 'CC0', 'CC-BY', 'CC-BY-SA')"),
      min_width: z.number().int().positive().optional().describe("Minimum image width in pixels"),
      max_width: z.number().int().positive().optional().describe("Maximum image width in pixels"),
      min_height: z.number().int().positive().optional().describe("Minimum image height in pixels"),
      max_height: z.number().int().positive().optional().describe("Maximum image height in pixels"),
      tile_width: z.number().int().positive().optional().describe("Exact detected tile width in pixels"),
      tile_height: z.number().int().positive().optional().describe("Exact detected tile height in pixels"),
      has_transparency: z.boolean().optional().describe("Filter by transparency presence"),
      limit: z.number().int().min(1).max(100).optional().describe("Max results to return (default 20)"),
      offset: z.number().int().min(0).optional().describe("Offset for pagination (default 0)"),
    },
    async (params) => {
      try {
        const queries = new CatalogQueries(ctx.db);
        const results = queries.searchCatalog(params);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                count: results.length,
                limit: params.limit ?? 20,
                offset: params.offset ?? 0,
                results: results.map((r) => ({
                  slug: r.slug,
                  url: r.url,
                  title: r.title,
                  author: r.author,
                  favorites: r.favorites,
                  category: r.category,
                  width: r.width,
                  height: r.height,
                  tile_width: r.tile_width,
                  tile_height: r.tile_height,
                  has_transparency: r.has_transparency === 1,
                  confidence: r.confidence,
                })),
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
