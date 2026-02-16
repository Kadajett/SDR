import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolContext } from "../types.js";
import { CatalogQueries } from "../db/queries.js";

export function registerCategoriesResource(
  server: McpServer,
  ctx: ToolContext
): void {
  server.resource(
    "catalog-categories",
    "catalog://categories",
    async (uri) => {
      const queries = new CatalogQueries(ctx.db);
      const categories = queries.getCategoryList();

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(categories, null, 2),
          },
        ],
      };
    }
  );
}
