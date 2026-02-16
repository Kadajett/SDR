export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS crawl_pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  page_number INTEGER NOT NULL UNIQUE,
  url TEXT NOT NULL,
  assets_found INTEGER NOT NULL DEFAULT 0,
  crawled_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  url TEXT NOT NULL,
  title TEXT,
  author TEXT,
  favorites INTEGER NOT NULL DEFAULT 0,
  detail_crawled INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS asset_tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  UNIQUE(asset_id, tag)
);

CREATE TABLE IF NOT EXISTS asset_licenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  license TEXT NOT NULL,
  UNIQUE(asset_id, license)
);

CREATE TABLE IF NOT EXISTS asset_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  url TEXT NOT NULL,
  mime_type TEXT,
  byte_size INTEGER,
  download_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS asset_previews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  local_path TEXT,
  downloaded INTEGER NOT NULL DEFAULT 0,
  analyzed INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS asset_analysis (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  preview_id INTEGER NOT NULL UNIQUE REFERENCES asset_previews(id) ON DELETE CASCADE,
  category TEXT NOT NULL DEFAULT 'other',
  width INTEGER,
  height INTEGER,
  tile_width INTEGER,
  tile_height INTEGER,
  has_transparency INTEGER NOT NULL DEFAULT 0,
  dominant_colors TEXT,
  confidence REAL NOT NULL DEFAULT 0.0,
  frame_width INTEGER,
  frame_height INTEGER,
  frame_count INTEGER,
  is_animation INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_assets_slug ON assets(slug);
CREATE INDEX IF NOT EXISTS idx_assets_detail_crawled ON assets(detail_crawled);
CREATE INDEX IF NOT EXISTS idx_asset_tags_tag ON asset_tags(tag);
CREATE INDEX IF NOT EXISTS idx_asset_tags_asset_id ON asset_tags(asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_licenses_license ON asset_licenses(license);
CREATE INDEX IF NOT EXISTS idx_asset_licenses_asset_id ON asset_licenses(asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_files_asset_id ON asset_files(asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_previews_asset_id ON asset_previews(asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_previews_downloaded ON asset_previews(downloaded);
CREATE INDEX IF NOT EXISTS idx_asset_previews_analyzed ON asset_previews(analyzed);
CREATE INDEX IF NOT EXISTS idx_asset_analysis_category ON asset_analysis(category);
CREATE INDEX IF NOT EXISTS idx_asset_analysis_tile ON asset_analysis(tile_width, tile_height);
`;
