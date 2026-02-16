import type Database from "better-sqlite3";
import type {
  AssetRecord,
  AssetPreviewRecord,
  AssetAnalysisRecord,
  AssetFileInfo,
  CatalogSearchParams,
  CatalogStats,
  CrawlStatus,
  ImageAnalysisResult,
} from "../types.js";

export class CatalogQueries {
  private upsertCrawlPageStmt: Database.Statement;
  private upsertAssetStmt: Database.Statement;
  private getAssetBySlugStmt: Database.Statement;
  private markDetailCrawledStmt: Database.Statement;
  private insertTagStmt: Database.Statement;
  private insertLicenseStmt: Database.Statement;
  private insertFileStmt: Database.Statement;
  private insertPreviewStmt: Database.Statement;
  private getPreviewByIdStmt: Database.Statement;
  private markPreviewDownloadedStmt: Database.Statement;
  private markPreviewAnalyzedStmt: Database.Statement;
  private upsertAnalysisStmt: Database.Statement;
  private getAssetTagsStmt: Database.Statement;
  private getAssetLicensesStmt: Database.Statement;

  constructor(private db: Database.Database) {
    this.upsertCrawlPageStmt = db.prepare(`
      INSERT INTO crawl_pages (page_number, url, assets_found)
      VALUES (?, ?, ?)
      ON CONFLICT(page_number) DO UPDATE SET
        assets_found = excluded.assets_found,
        crawled_at = datetime('now')
    `);

    this.upsertAssetStmt = db.prepare(`
      INSERT INTO assets (slug, url, title, author, favorites)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(slug) DO UPDATE SET
        title = COALESCE(excluded.title, title),
        author = COALESCE(excluded.author, author),
        favorites = excluded.favorites,
        updated_at = datetime('now')
    `);

    this.getAssetBySlugStmt = db.prepare(
      `SELECT * FROM assets WHERE slug = ?`
    );

    this.markDetailCrawledStmt = db.prepare(
      `UPDATE assets SET detail_crawled = 1, updated_at = datetime('now') WHERE id = ?`
    );

    this.insertTagStmt = db.prepare(
      `INSERT OR IGNORE INTO asset_tags (asset_id, tag) VALUES (?, ?)`
    );

    this.insertLicenseStmt = db.prepare(
      `INSERT OR IGNORE INTO asset_licenses (asset_id, license) VALUES (?, ?)`
    );

    this.insertFileStmt = db.prepare(`
      INSERT INTO asset_files (asset_id, filename, url, mime_type, byte_size, download_count)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    this.insertPreviewStmt = db.prepare(`
      INSERT INTO asset_previews (asset_id, url) VALUES (?, ?)
    `);

    this.getPreviewByIdStmt = db.prepare(
      `SELECT * FROM asset_previews WHERE id = ?`
    );

    this.markPreviewDownloadedStmt = db.prepare(
      `UPDATE asset_previews SET downloaded = 1, local_path = ? WHERE id = ?`
    );

    this.markPreviewAnalyzedStmt = db.prepare(
      `UPDATE asset_previews SET analyzed = 1 WHERE id = ?`
    );

    this.upsertAnalysisStmt = db.prepare(`
      INSERT INTO asset_analysis (preview_id, category, width, height, tile_width, tile_height, has_transparency, dominant_colors, confidence)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(preview_id) DO UPDATE SET
        category = excluded.category,
        width = excluded.width,
        height = excluded.height,
        tile_width = excluded.tile_width,
        tile_height = excluded.tile_height,
        has_transparency = excluded.has_transparency,
        dominant_colors = excluded.dominant_colors,
        confidence = excluded.confidence
    `);

    this.getAssetTagsStmt = db.prepare(
      `SELECT tag FROM asset_tags WHERE asset_id = ?`
    );

    this.getAssetLicensesStmt = db.prepare(
      `SELECT license FROM asset_licenses WHERE asset_id = ?`
    );
  }

  upsertCrawlPage(
    pageNumber: number,
    url: string,
    assetsFound: number
  ): void {
    this.upsertCrawlPageStmt.run(pageNumber, url, assetsFound);
  }

  upsertAsset(
    slug: string,
    url: string,
    title: string | null,
    author: string | null,
    favorites: number
  ): number {
    this.upsertAssetStmt.run(slug, url, title, author, favorites);
    const row = this.getAssetBySlugStmt.get(slug) as AssetRecord;
    return row.id;
  }

  getAssetBySlug(slug: string): AssetRecord | undefined {
    return this.getAssetBySlugStmt.get(slug) as AssetRecord | undefined;
  }

  markDetailCrawled(assetId: number): void {
    this.markDetailCrawledStmt.run(assetId);
  }

  insertTag(assetId: number, tag: string): void {
    this.insertTagStmt.run(assetId, tag);
  }

  insertLicense(assetId: number, license: string): void {
    this.insertLicenseStmt.run(assetId, license);
  }

  insertFile(assetId: number, file: AssetFileInfo): void {
    this.insertFileStmt.run(
      assetId,
      file.filename,
      file.url,
      file.mime_type,
      file.byte_size,
      file.download_count
    );
  }

  insertPreview(assetId: number, url: string): number {
    const result = this.insertPreviewStmt.run(assetId, url);
    return Number(result.lastInsertRowid);
  }

  getPreviewById(previewId: number): AssetPreviewRecord | undefined {
    return this.getPreviewByIdStmt.get(previewId) as
      | AssetPreviewRecord
      | undefined;
  }

  markPreviewDownloaded(previewId: number, localPath: string): void {
    this.markPreviewDownloadedStmt.run(localPath, previewId);
  }

  saveAnalysis(previewId: number, analysis: ImageAnalysisResult): void {
    this.upsertAnalysisStmt.run(
      previewId,
      analysis.category,
      analysis.width,
      analysis.height,
      analysis.tile_grid?.tile_width ?? null,
      analysis.tile_grid?.tile_height ?? null,
      analysis.has_transparency ? 1 : 0,
      JSON.stringify(analysis.dominant_colors),
      analysis.confidence
    );
    this.markPreviewAnalyzedStmt.run(previewId);
  }

  getAssetTags(assetId: number): string[] {
    const rows = this.getAssetTagsStmt.all(assetId) as Array<{ tag: string }>;
    return rows.map((r) => r.tag);
  }

  getAssetLicenses(assetId: number): string[] {
    const rows = this.getAssetLicensesStmt.all(assetId) as Array<{
      license: string;
    }>;
    return rows.map((r) => r.license);
  }

  searchCatalog(params: CatalogSearchParams): Array<
    AssetRecord &
      Partial<
        Pick<
          AssetAnalysisRecord,
          | "category"
          | "width"
          | "height"
          | "tile_width"
          | "tile_height"
          | "has_transparency"
          | "confidence"
        >
      >
  > {
    const conditions: string[] = [];
    const values: unknown[] = [];

    if (params.category) {
      conditions.push("an.category = ?");
      values.push(params.category);
    }

    if (params.tags && params.tags.length > 0) {
      const placeholders = params.tags.map(() => "?").join(",");
      conditions.push(`a.id IN (
        SELECT asset_id FROM asset_tags WHERE tag IN (${placeholders})
        GROUP BY asset_id HAVING COUNT(DISTINCT tag) = ?
      )`);
      values.push(...params.tags, params.tags.length);
    }

    if (params.license) {
      conditions.push(
        "a.id IN (SELECT asset_id FROM asset_licenses WHERE license = ?)"
      );
      values.push(params.license);
    }

    if (params.min_width != null) {
      conditions.push("an.width >= ?");
      values.push(params.min_width);
    }
    if (params.max_width != null) {
      conditions.push("an.width <= ?");
      values.push(params.max_width);
    }
    if (params.min_height != null) {
      conditions.push("an.height >= ?");
      values.push(params.min_height);
    }
    if (params.max_height != null) {
      conditions.push("an.height <= ?");
      values.push(params.max_height);
    }

    if (params.tile_width != null) {
      conditions.push("an.tile_width = ?");
      values.push(params.tile_width);
    }
    if (params.tile_height != null) {
      conditions.push("an.tile_height = ?");
      values.push(params.tile_height);
    }

    if (params.has_transparency != null) {
      conditions.push("an.has_transparency = ?");
      values.push(params.has_transparency ? 1 : 0);
    }

    let sql = `
      SELECT DISTINCT a.*, an.category, an.width, an.height,
             an.tile_width, an.tile_height, an.has_transparency, an.confidence
      FROM assets a
      LEFT JOIN asset_previews ap ON ap.asset_id = a.id
      LEFT JOIN asset_analysis an ON an.preview_id = ap.id
    `;

    if (conditions.length > 0) {
      sql += " WHERE " + conditions.join(" AND ");
    }

    sql += " ORDER BY a.favorites DESC";
    sql += " LIMIT ? OFFSET ?";
    values.push(params.limit ?? 20, params.offset ?? 0);

    return this.db.prepare(sql).all(...values) as Array<
      AssetRecord &
        Partial<
          Pick<
            AssetAnalysisRecord,
            | "category"
            | "width"
            | "height"
            | "tile_width"
            | "tile_height"
            | "has_transparency"
            | "confidence"
          >
        >
    >;
  }

  getStats(): CatalogStats {
    const totalAssets =
      (
        this.db.prepare("SELECT COUNT(*) as count FROM assets").get() as {
          count: number;
        }
      ).count;

    const detailCrawled =
      (
        this.db
          .prepare(
            "SELECT COUNT(*) as count FROM assets WHERE detail_crawled = 1"
          )
          .get() as { count: number }
      ).count;

    const previewsDownloaded =
      (
        this.db
          .prepare(
            "SELECT COUNT(*) as count FROM asset_previews WHERE downloaded = 1"
          )
          .get() as { count: number }
      ).count;

    const previewsAnalyzed =
      (
        this.db
          .prepare(
            "SELECT COUNT(*) as count FROM asset_previews WHERE analyzed = 1"
          )
          .get() as { count: number }
      ).count;

    const byCategoryRows = this.db
      .prepare(
        "SELECT category, COUNT(*) as count FROM asset_analysis GROUP BY category"
      )
      .all() as Array<{ category: string; count: number }>;
    const byCategory: Record<string, number> = {};
    for (const row of byCategoryRows) {
      byCategory[row.category] = row.count;
    }

    const byLicenseRows = this.db
      .prepare(
        "SELECT license, COUNT(DISTINCT asset_id) as count FROM asset_licenses GROUP BY license"
      )
      .all() as Array<{ license: string; count: number }>;
    const byLicense: Record<string, number> = {};
    for (const row of byLicenseRows) {
      byLicense[row.license] = row.count;
    }

    const topTags = this.db
      .prepare(
        "SELECT tag, COUNT(*) as count FROM asset_tags GROUP BY tag ORDER BY count DESC LIMIT 20"
      )
      .all() as Array<{ tag: string; count: number }>;

    const pagesCrawled =
      (
        this.db
          .prepare("SELECT COUNT(*) as count FROM crawl_pages")
          .get() as { count: number }
      ).count;

    return {
      total_assets: totalAssets,
      detail_crawled: detailCrawled,
      previews_downloaded: previewsDownloaded,
      previews_analyzed: previewsAnalyzed,
      by_category: byCategory,
      by_license: byLicense,
      top_tags: topTags,
      pages_crawled: pagesCrawled,
    };
  }

  getCrawlStatus(): CrawlStatus {
    const pagesCrawled =
      (
        this.db
          .prepare("SELECT COUNT(*) as count FROM crawl_pages")
          .get() as { count: number }
      ).count;

    const totalAssets =
      (
        this.db.prepare("SELECT COUNT(*) as count FROM assets").get() as {
          count: number;
        }
      ).count;

    const assetsWithDetails =
      (
        this.db
          .prepare(
            "SELECT COUNT(*) as count FROM assets WHERE detail_crawled = 1"
          )
          .get() as { count: number }
      ).count;

    const previewsDownloaded =
      (
        this.db
          .prepare(
            "SELECT COUNT(*) as count FROM asset_previews WHERE downloaded = 1"
          )
          .get() as { count: number }
      ).count;

    const previewsAnalyzed =
      (
        this.db
          .prepare(
            "SELECT COUNT(*) as count FROM asset_previews WHERE analyzed = 1"
          )
          .get() as { count: number }
      ).count;

    const lastPage = this.db
      .prepare(
        "SELECT page_number FROM crawl_pages ORDER BY page_number DESC LIMIT 1"
      )
      .get() as { page_number: number } | undefined;

    const lastCrawledPage = lastPage?.page_number ?? null;
    const suggestedNextPage = lastCrawledPage != null ? lastCrawledPage + 1 : 0;

    return {
      pages_crawled: pagesCrawled,
      total_assets: totalAssets,
      assets_with_details: assetsWithDetails,
      previews_downloaded: previewsDownloaded,
      previews_analyzed: previewsAnalyzed,
      last_crawled_page: lastCrawledPage,
      suggested_next_page: suggestedNextPage,
    };
  }

  getCategoryList(): Array<{ category: string; count: number }> {
    return this.db
      .prepare(
        "SELECT category, COUNT(*) as count FROM asset_analysis GROUP BY category ORDER BY count DESC"
      )
      .all() as Array<{ category: string; count: number }>;
  }
}
