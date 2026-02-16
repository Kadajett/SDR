import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolContext } from "../types.js";
import { CatalogQueries } from "../db/queries.js";

export function registerCatalogStats(
  server: McpServer,
  ctx: ToolContext
): void {
  server.tool(
    "catalog_stats",
    "Get summary statistics for the local asset catalog: total assets, per-category counts, per-license counts, top 20 tags, crawl progress. No parameters needed.",
    {},
    async () => {
      try {
        const queries = new CatalogQueries(ctx.db);
        const stats = queries.getStats();

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(stats),
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
