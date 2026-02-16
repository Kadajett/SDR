// CSS selectors for opengameart.org (Drupal 7 site)
// These target the standard OGA HTML structure. If the site layout changes,
// update these constants rather than modifying scraper logic.

export const OGA_BASE_URL = "https://opengameart.org";

// Search results page: /art-search-advanced
// The page has multiple .view-content blocks (forum sidebar + art results).
// We scope to .view-art to target only the art search results.
export const SEARCH = {
  // Each result item in the art search grid (scoped to avoid forum sidebar)
  RESULT_ITEM: ".view-art .view-content .views-row",
  // Title link within a result item (Drupal DS field, not Views field)
  TITLE_LINK: ".field-name-title a, .art-preview-title a",
  // Thumbnail image within a result item
  THUMBNAIL: ".field-name-field-art-preview img",
  // Author and favorites are NOT shown on the search page.
  // They are populated later by crawl_asset_detail.
  AUTHOR_LINK: "",
  FAVORITES: "",
  // Pager for detecting total pages
  PAGER_LAST: ".pager-last a",
  PAGER_ITEM: ".pager-item a, .pager-current",
} as const;

// Asset detail page: /content/{slug}
export const DETAIL = {
  // Page title (Drupal DS field, not a heading element)
  TITLE: ".field-name-title .field-item, #page-title, h1.title",
  // Author/submitter link
  AUTHOR: ".field-name-author-submitter a, .username, .submitted a",
  // Description/body text
  DESCRIPTION: ".field-name-body .field-item, .node-content .field-type-text-with-summary .field-item",
  // Tags (taxonomy terms)
  TAGS: ".field-name-field-art-tags .field-item a, .taxonomy-term-reference a",
  // License information
  LICENSE: ".field-name-field-art-licenses .field-item, .license-name, .field-name-field-art-licenses a",
  // File attachments: each span.file contains one downloadable file
  FILES_TABLE: ".field-name-field-art-files span.file",
  FILE_LINK: "a[href]",
  // Size is inline text in span.file (extracted via textContent regex)
  FILE_SIZE: "",
  // Download count in a dedicated span
  FILE_DOWNLOADS: ".dlcount-number",
  // Preview images
  PREVIEW_IMAGE: ".field-name-field-art-preview img, .field-name-field-art-preview-2 img, .node-content img[src*='preview'], .field-type-image img",
  // Favorites count
  FAVORITES: ".flag-favorites .flag-count, .rate-number-up-down-rating",
} as const;

// Build a search URL for 2D art, sorted by creation date
export function buildSearchUrl(page: number): string {
  const params = new URLSearchParams({
    keys: "",
    "field_art_type_tid[]": "9", // 2D Art
    sort_by: "created",
    sort_order: "DESC",
  });
  if (page > 0) {
    params.set("page", String(page));
  }
  return `${OGA_BASE_URL}/art-search-advanced?${params.toString()}`;
}

// Build a detail page URL from a slug
export function buildDetailUrl(slug: string): string {
  return `${OGA_BASE_URL}/content/${slug}`;
}

// Extract a slug from an OGA content URL
export function extractSlug(url: string): string | null {
  const match = url.match(/\/content\/([^/?#]+)/);
  return match ? match[1] : null;
}
