import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolContext } from "../types.js";
import { CatalogQueries } from "../db/queries.js";
import { scrapeAssetDetail } from "../scraper/asset-detail.js";

export function registerCrawlAssetDetail(
  server: McpServer,
  ctx: ToolContext
): void {
  server.tool(
    "crawl_asset_detail",
    "Visit an asset's detail page on OpenGameArt.org and extract full metadata: tags, licenses, files, preview images. The asset must already exist in the catalog (from crawl_search_page). Stores all extracted data in the database.",
    { slug: z.string().describe("Asset slug (from crawl_search_page results)") },
    async ({ slug }) => {
      try {
        const queries = new CatalogQueries(ctx.db);
        const asset = queries.getAssetBySlug(slug);

        if (!asset) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  error: `Asset with slug "${slug}" not found in catalog. Run crawl_search_page first.`,
                }),
              },
            ],
            isError: true,
          };
        }

        await ctx.rateLimiter.wait();

        const browser = await ctx.getBrowser();
        const page = await browser.newPage();

        try {
          const detail = await scrapeAssetDetail(page, slug);

          // Update asset with detail info
          queries.upsertAsset(
            slug,
            asset.url,
            detail.title,
            detail.author,
            detail.favorites
          );

          // Insert tags
          for (const tag of detail.tags) {
            queries.insertTag(asset.id, tag);
          }

          // Insert licenses
          for (const license of detail.licenses) {
            queries.insertLicense(asset.id, license);
          }

          // Insert files
          for (const file of detail.files) {
            queries.insertFile(asset.id, file);
          }

          // Insert preview URLs
          const previewIds: number[] = [];
          for (const previewUrl of detail.preview_urls) {
            const previewId = queries.insertPreview(asset.id, previewUrl);
            previewIds.push(previewId);
          }

          // Mark as detail crawled
          queries.markDetailCrawled(asset.id);

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  slug,
                  title: detail.title,
                  author: detail.author,
                  tags: detail.tags,
                  licenses: detail.licenses,
                  files_count: detail.files.length,
                  previews_count: detail.preview_urls.length,
                  preview_ids: previewIds,
                  description_length: detail.description.length,
                }),
              },
            ],
          };
        } finally {
          await page.close();
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
