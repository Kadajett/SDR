import type { Page } from "playwright";
import type { SearchResultItem } from "../types.js";
import { SEARCH, OGA_BASE_URL, buildSearchUrl, extractSlug } from "./selectors.js";

export async function scrapeSearchPage(
  page: Page,
  pageNumber: number
): Promise<{ url: string; items: SearchResultItem[] }> {
  const url = buildSearchUrl(pageNumber);
  // Use networkidle to wait for Drupal Views AJAX to finish rendering results
  await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 });

  const items = await page.$$eval(
    SEARCH.RESULT_ITEM,
    (rows, selectors) => {
      return rows
        .map((row) => {
          const titleLink = row.querySelector(selectors.titleLink);
          if (!titleLink) return null;

          const href = titleLink.getAttribute("href") || "";
          const title = titleLink.textContent?.trim() || "";

          // Extract slug from the href
          const slugMatch = href.match(/\/content\/([^/?#]+)/);
          const slug = slugMatch ? slugMatch[1] : null;
          if (!slug) return null;

          const baseUrl = selectors.baseUrl;
          const fullUrl = href.startsWith("http") ? href : `${baseUrl}${href}`;

          // Thumbnail
          const thumbImg = row.querySelector(selectors.thumbnail);
          let thumbnailUrl = thumbImg?.getAttribute("src") || null;
          if (thumbnailUrl && !thumbnailUrl.startsWith("http")) {
            thumbnailUrl = `${baseUrl}${thumbnailUrl}`;
          }

          // Author and favorites are not shown on the search page.
          // They are populated later by crawl_asset_detail.
          const author = null;
          const favorites = 0;

          return { slug, url: fullUrl, title, thumbnail_url: thumbnailUrl, author, favorites };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);
    },
    {
      titleLink: SEARCH.TITLE_LINK,
      thumbnail: SEARCH.THUMBNAIL,
      baseUrl: OGA_BASE_URL,
    }
  );

  return { url, items };
}
