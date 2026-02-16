import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolContext } from "../types.js";
import { CatalogQueries } from "../db/queries.js";

export function registerGetCrawlStatus(
  server: McpServer,
  ctx: ToolContext
): void {
  server.tool(
    "get_crawl_status",
    "Get current crawl progress: pages crawled, total assets found, how many have been detail-crawled, how many previews downloaded and analyzed, and the suggested next page number to crawl. No parameters needed.",
    {},
    async () => {
      try {
        const queries = new CatalogQueries(ctx.db);
        const status = queries.getCrawlStatus();

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(status),
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
