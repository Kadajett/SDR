import type BetterSqlite3 from "better-sqlite3";
import type { Browser } from "playwright";

// Database record types

export interface CrawlPageRecord {
  id: number;
  page_number: number;
  url: string;
  assets_found: number;
  crawled_at: string;
}

export interface AssetRecord {
  id: number;
  slug: string;
  url: string;
  title: string | null;
  author: string | null;
  favorites: number;
  detail_crawled: number;
  created_at: string;
  updated_at: string;
}

export interface AssetTagRecord {
  id: number;
  asset_id: number;
  tag: string;
}

export interface AssetLicenseRecord {
  id: number;
  asset_id: number;
  license: string;
}

export interface AssetFileRecord {
  id: number;
  asset_id: number;
  filename: string;
  url: string;
  mime_type: string | null;
  byte_size: number | null;
  download_count: number;
}

export interface AssetPreviewRecord {
  id: number;
  asset_id: number;
  url: string;
  local_path: string | null;
  downloaded: number;
  analyzed: number;
}

export interface AssetAnalysisRecord {
  id: number;
  preview_id: number;
  category: AssetCategory;
  width: number | null;
  height: number | null;
  tile_width: number | null;
  tile_height: number | null;
  has_transparency: number;
  dominant_colors: string | null;
  confidence: number;
  frame_width: number | null;
  frame_height: number | null;
  frame_count: number | null;
  is_animation: number;
}

// Category type

export type AssetCategory =
  | "tilesheet"
  | "spritesheet"
  | "icon"
  | "ui"
  | "character"
  | "effect"
  | "background"
  | "other";

// Scraper output types

export interface SearchResultItem {
  slug: string;
  url: string;
  title: string;
  thumbnail_url: string | null;
  author: string | null;
  favorites: number;
}

export interface AssetDetail {
  title: string;
  author: string;
  description: string;
  favorites: number;
  tags: string[];
  licenses: string[];
  files: AssetFileInfo[];
  preview_urls: string[];
}

export interface AssetFileInfo {
  filename: string;
  url: string;
  mime_type: string | null;
  byte_size: number | null;
  download_count: number;
}

// Animation detection types

export type AnimationOrientation = "horizontal" | "vertical" | "grid";

export interface AnimationDetectionResult {
  isAnimationStrip: boolean;
  frameWidth: number;
  frameHeight: number;
  frameCount: number;
  columns: number;
  rows: number;
  orientation: AnimationOrientation;
  frameSimilarity: number; // 0-1, consecutive frame similarity score
  confidence: number;
}

// Analysis types

export interface TileDetectionResult {
  tile_width: number;
  tile_height: number;
  columns: number;
  rows: number;
  score: number;
}

export interface ImageAnalysisResult {
  width: number;
  height: number;
  has_transparency: boolean;
  tile_grid: TileDetectionResult | null;
  animation: AnimationDetectionResult | null;
  dominant_colors: string[];
  category: AssetCategory;
  confidence: number;
}

// Search params

export interface CatalogSearchParams {
  category?: AssetCategory;
  tags?: string[];
  license?: string;
  min_width?: number;
  max_width?: number;
  min_height?: number;
  max_height?: number;
  tile_width?: number;
  tile_height?: number;
  has_transparency?: boolean;
  limit?: number;
  offset?: number;
}

// Stats

export interface CatalogStats {
  total_assets: number;
  detail_crawled: number;
  previews_downloaded: number;
  previews_analyzed: number;
  by_category: Record<string, number>;
  by_license: Record<string, number>;
  top_tags: Array<{ tag: string; count: number }>;
  pages_crawled: number;
}

// Crawl status

export interface CrawlStatus {
  pages_crawled: number;
  total_assets: number;
  assets_with_details: number;
  previews_downloaded: number;
  previews_analyzed: number;
  last_crawled_page: number | null;
  suggested_next_page: number;
}

// Tool context

export interface ToolContext {
  db: BetterSqlite3.Database;
  getBrowser: () => Promise<Browser>;
  rateLimiter: { wait(): Promise<void> };
  dataDir: string;
  previewDir: string;
}
