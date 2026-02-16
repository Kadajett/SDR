import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolContext } from "../types.js";
import { CatalogQueries } from "../db/queries.js";
import { scrapeSearchPage } from "../scraper/search-page.js";

export function registerCrawlSearchPage(
  server: McpServer,
  ctx: ToolContext
): void {
  server.tool(
    "crawl_search_page",
    "Crawl one page of OpenGameArt.org 2D art search results. Stores asset stubs (slug, URL, title, author) in the local catalog database. Each page contains ~24 results. Use get_crawl_status to find which page to crawl next.",
    { page: z.number().int().min(0).describe("Zero-indexed page number to crawl") },
    async ({ page }) => {
      try {
        await ctx.rateLimiter.wait();

        const browser = await ctx.getBrowser();
        const browserPage = await browser.newPage();

        try {
          const { url, items } = await scrapeSearchPage(browserPage, page);
          const queries = new CatalogQueries(ctx.db);

          for (const item of items) {
            queries.upsertAsset(
              item.slug,
              item.url,
              item.title,
              item.author,
              item.favorites
            );
          }

          queries.upsertCrawlPage(page, url, items.length);

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  page,
                  url,
                  assets_found: items.length,
                  assets: items.map((i) => ({
                    slug: i.slug,
                    title: i.title,
                    author: i.author,
                  })),
                }),
              },
            ],
          };
        } finally {
          await browserPage.close();
        }
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
