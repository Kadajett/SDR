import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolContext } from "../types.js";
import { CatalogQueries } from "../db/queries.js";

export function registerStatsResource(
  server: McpServer,
  ctx: ToolContext
): void {
  server.resource("catalog-stats", "catalog://stats", async (uri) => {
    const queries = new CatalogQueries(ctx.db);
    const stats = queries.getStats();

    return {
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(stats, null, 2),
        },
      ],
    };
  });
}
