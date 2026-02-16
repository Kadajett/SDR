import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { chromium, type Browser } from "playwright";
import { join, resolve } from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import { getDatabase, closeDatabase } from "./db/connection.js";
import { RateLimiter } from "./scraper/rate-limiter.js";
import type { ToolContext } from "./types.js";

// Tool registrations
import { registerCrawlSearchPage } from "./tools/crawl-search-page.js";
import { registerCrawlAssetDetail } from "./tools/crawl-asset-detail.js";
import { registerDownloadPreview } from "./tools/download-preview.js";
import { registerAnalyzeImage } from "./tools/analyze-image.js";
import { registerCatalogSearch } from "./tools/catalog-search.js";
import { registerCatalogStats } from "./tools/catalog-stats.js";
import { registerGetCrawlStatus } from "./tools/get-crawl-status.js";

// Resource registrations
import { registerStatsResource } from "./resources/stats.js";
import { registerCategoriesResource } from "./resources/categories.js";

async function main() {
  // Configuration from environment
  const dataDir = resolve(
    process.env.SDR_CATALOG_DATA_DIR || "./data/asset-catalog"
  );
  const crawlDelayMs = parseInt(
    process.env.SDR_CRAWL_DELAY_MS || "10000",
    10
  );
  const previewDir = join(dataDir, "previews");

  // Ensure directories exist
  if (!existsSync(previewDir)) {
    mkdirSync(previewDir, { recursive: true });
  }

  // Initialize database
  const db = getDatabase(dataDir);

  // Lazy browser instance
  let browser: Browser | null = null;

  async function getBrowser(): Promise<Browser> {
    if (!browser || !browser.isConnected()) {
      browser = await chromium.launch({ headless: true });
    }
    return browser;
  }

  // Rate limiter for all HTTP requests to OGA
  const rateLimiter = new RateLimiter(crawlDelayMs);

  // Build tool context
  const ctx: ToolContext = {
    db,
    getBrowser,
    rateLimiter,
    dataDir,
    previewDir,
  };

  // Create MCP server
  const server = new McpServer({
    name: "asset-catalog",
    version: "0.0.1",
  });

  // Register tools
  registerCrawlSearchPage(server, ctx);
  registerCrawlAssetDetail(server, ctx);
  registerDownloadPreview(server, ctx);
  registerAnalyzeImage(server, ctx);
  registerCatalogSearch(server, ctx);
  registerCatalogStats(server, ctx);
  registerGetCrawlStatus(server, ctx);

  // Register resources
  registerStatsResource(server, ctx);
  registerCategoriesResource(server, ctx);

  // Connect via stdio
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Cleanup on shutdown
  async function cleanup() {
    if (browser) {
      await browser.close().catch(() => {});
      browser = null;
    }
    closeDatabase();
  }

  process.on("SIGINT", async () => {
    await cleanup();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    await cleanup();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("Failed to start asset-catalog MCP server:", err);
  process.exit(1);
});
