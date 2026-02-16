import sharp from "sharp";
import type { TileDetectionResult, AnimationDetectionResult, AnimationOrientation } from "../types.js";

// Standard game tile sizes get a scoring bonus
const STANDARD_TILE_SIZES = new Set([8, 16, 24, 32, 48, 64, 128]);

// Minimum score threshold for tile grid detection
const TILE_SCORE_THRESHOLD = 0.6;

export interface RawImageData {
  data: Buffer;
  width: number;
  height: number;
  channels: number;
  hasAlpha: boolean;
}

export async function getRawImageData(
  filePath: string
): Promise<RawImageData> {
  const image = sharp(filePath).ensureAlpha();
  const metadata = await image.metadata();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });

  return {
    data,
    width: info.width,
    height: info.height,
    channels: info.channels,
    hasAlpha: metadata.hasAlpha ?? false,
  };
}

export function detectTransparency(raw: RawImageData): boolean {
  if (raw.channels < 4) return false;

  const { data, width, height, channels } = raw;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels + 3; // alpha channel
      if (data[idx] < 255) return true;
    }
  }
  return false;
}

export function detectTileGrid(raw: RawImageData): TileDetectionResult | null {
  const { data, width, height, channels } = raw;

  // Generate candidate tile sizes
  const candidates = new Set<number>();

  // Add standard sizes that divide both dimensions evenly
  for (const size of STANDARD_TILE_SIZES) {
    if (size >= 8 && size <= Math.min(width, height) / 2) {
      if (width % size === 0 && height % size === 0) {
        candidates.add(size);
      }
    }
  }

  // Add common divisors of width and height
  const maxCandidate = Math.floor(Math.min(width, height) / 2);
  for (let size = 8; size <= maxCandidate; size++) {
    if (width % size === 0 && height % size === 0) {
      candidates.add(size);
    }
  }

  if (candidates.size === 0) return null;

  let bestResult: TileDetectionResult | null = null;
  let bestScore = 0;

  for (const tileSize of candidates) {
    const cols = width / tileSize;
    const rows = height / tileSize;

    // Need at least 2x2 grid
    if (cols < 2 || rows < 2) continue;
    // Need more than 4 tiles to be interesting
    if (cols * rows <= 4) continue;

    const score = scoreTileGrid(data, width, height, channels, tileSize, tileSize);
    const adjustedScore = STANDARD_TILE_SIZES.has(tileSize) ? score * 1.15 : score;
    const finalScore = Math.min(adjustedScore, 1.0);

    if (finalScore > bestScore && finalScore >= TILE_SCORE_THRESHOLD) {
      bestScore = finalScore;
      bestResult = {
        tile_width: tileSize,
        tile_height: tileSize,
        columns: cols,
        rows: rows,
        score: Math.round(finalScore * 1000) / 1000,
      };
    }
  }

  // Also try non-square tiles (width != height) for common sizes
  const widthCandidates = [...candidates];
  const heightCandidates = [...candidates];

  for (const tw of widthCandidates) {
    for (const th of heightCandidates) {
      if (tw === th) continue; // Already tested square
      if (width % tw !== 0 || height % th !== 0) continue;

      const cols = width / tw;
      const rows = height / th;
      if (cols < 2 || rows < 2) continue;
      if (cols * rows <= 4) continue;

      const score = scoreTileGrid(data, width, height, channels, tw, th);
      const isStandard = STANDARD_TILE_SIZES.has(tw) && STANDARD_TILE_SIZES.has(th);
      const adjustedScore = isStandard ? score * 1.15 : score;
      const finalScore = Math.min(adjustedScore, 1.0);

      if (finalScore > bestScore && finalScore >= TILE_SCORE_THRESHOLD) {
        bestScore = finalScore;
        bestResult = {
          tile_width: tw,
          tile_height: th,
          columns: cols,
          rows: rows,
          score: Math.round(finalScore * 1000) / 1000,
        };
      }
    }
  }

  return bestResult;
}

function scoreTileGrid(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
  tileWidth: number,
  tileHeight: number
): number {
  // Measure pixel discontinuity at tile boundaries vs. non-boundaries.
  // Higher ratio = more likely a real tile grid.

  let boundaryDiff = 0;
  let boundaryCount = 0;
  let innerDiff = 0;
  let innerCount = 0;

  // Horizontal boundaries (rows at y = n * tileHeight)
  for (let gridY = 1; gridY < height / tileHeight; gridY++) {
    const y = gridY * tileHeight;
    if (y >= height) break;

    for (let x = 0; x < width; x++) {
      const idx1 = ((y - 1) * width + x) * channels;
      const idx2 = (y * width + x) * channels;

      let diff = 0;
      for (let c = 0; c < Math.min(channels, 3); c++) {
        diff += Math.abs(data[idx1 + c] - data[idx2 + c]);
      }
      boundaryDiff += diff / 3;
      boundaryCount++;
    }
  }

  // Vertical boundaries (columns at x = n * tileWidth)
  for (let gridX = 1; gridX < width / tileWidth; gridX++) {
    const x = gridX * tileWidth;
    if (x >= width) break;

    for (let y = 0; y < height; y++) {
      const idx1 = (y * width + (x - 1)) * channels;
      const idx2 = (y * width + x) * channels;

      let diff = 0;
      for (let c = 0; c < Math.min(channels, 3); c++) {
        diff += Math.abs(data[idx1 + c] - data[idx2 + c]);
      }
      boundaryDiff += diff / 3;
      boundaryCount++;
    }
  }

  // Sample non-boundary rows for comparison
  const sampleStep = Math.max(1, Math.floor(tileHeight / 3));
  for (let y = sampleStep; y < height - 1; y += sampleStep) {
    // Skip if this is near a boundary
    if (y % tileHeight < 2 || y % tileHeight > tileHeight - 2) continue;

    for (let x = 0; x < width; x++) {
      const idx1 = ((y - 1) * width + x) * channels;
      const idx2 = (y * width + x) * channels;

      let diff = 0;
      for (let c = 0; c < Math.min(channels, 3); c++) {
        diff += Math.abs(data[idx1 + c] - data[idx2 + c]);
      }
      innerDiff += diff / 3;
      innerCount++;
    }
  }

  if (boundaryCount === 0 || innerCount === 0) return 0;

  const avgBoundaryDiff = boundaryDiff / boundaryCount;
  const avgInnerDiff = innerDiff / innerCount;

  // If inner diff is near zero, boundaries need to be significant
  if (avgInnerDiff < 0.5) {
    return avgBoundaryDiff > 5 ? 0.8 : 0;
  }

  // Ratio of boundary to inner discontinuity
  const ratio = avgBoundaryDiff / avgInnerDiff;

  // Normalize to 0-1 range. A ratio of 2+ is strong evidence.
  if (ratio < 1.2) return 0;
  if (ratio >= 3.0) return 1.0;
  return (ratio - 1.2) / (3.0 - 1.2);
}

/**
 * Detect whether an image is an animation strip/grid by analyzing frame similarity.
 * Uses the tile grid result to find frame boundaries, then compares consecutive
 * frames via average color histograms. High inter-frame similarity with transparency
 * suggests an animation strip; low similarity suggests a tilesheet.
 */
export function detectAnimationFrames(
  raw: RawImageData,
  tileGrid: TileDetectionResult | null
): AnimationDetectionResult | null {
  if (!tileGrid) return null;

  const { data, width, channels } = raw;
  const { tile_width, tile_height, columns, rows } = tileGrid;
  const frameCount = columns * rows;

  // Need at least 2 frames for animation
  if (frameCount < 2) return null;

  // Compute average color per frame
  const frameAverages: Array<{ r: number; g: number; b: number; a: number }> = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      let rSum = 0, gSum = 0, bSum = 0, aSum = 0;
      const pixels = tile_width * tile_height;

      for (let py = 0; py < tile_height; py++) {
        for (let px = 0; px < tile_width; px++) {
          const x = col * tile_width + px;
          const y = row * tile_height + py;
          const idx = (y * width + x) * channels;
          rSum += data[idx];
          gSum += data[idx + 1];
          bSum += data[idx + 2];
          aSum += channels >= 4 ? data[idx + 3] : 255;
        }
      }

      frameAverages.push({
        r: rSum / pixels,
        g: gSum / pixels,
        b: bSum / pixels,
        a: aSum / pixels,
      });
    }
  }

  // Compute similarity between consecutive frames (0-1, 1 = identical)
  let totalSimilarity = 0;
  for (let i = 0; i < frameAverages.length - 1; i++) {
    const a = frameAverages[i];
    const b = frameAverages[i + 1];
    const diff =
      (Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b) + Math.abs(a.a - b.a)) / 4;
    totalSimilarity += 1 - diff / 255;
  }
  const avgSimilarity = totalSimilarity / (frameAverages.length - 1);

  // Determine orientation
  let orientation: AnimationOrientation;
  if (rows === 1) orientation = "horizontal";
  else if (columns === 1) orientation = "vertical";
  else orientation = "grid";

  // Animation strips have high consecutive frame similarity (subtle pose changes)
  // and typically have transparency. Tilesheets have more varied tiles.
  const hasTransparency = raw.hasAlpha && frameAverages.some((f) => f.a < 240);
  const isAnimationStrip = avgSimilarity > 0.7 && hasTransparency;

  // Confidence based on similarity and transparency
  let confidence = 0;
  if (isAnimationStrip) {
    confidence = Math.min(0.5 + avgSimilarity * 0.4 + (hasTransparency ? 0.1 : 0), 1.0);
  }

  return {
    isAnimationStrip,
    frameWidth: tile_width,
    frameHeight: tile_height,
    frameCount,
    columns,
    rows,
    orientation,
    frameSimilarity: Math.round(avgSimilarity * 1000) / 1000,
    confidence: Math.round(confidence * 1000) / 1000,
  };
}

export function extractDominantColors(
  raw: RawImageData,
  maxColors: number = 5
): string[] {
  const { data, width, height, channels } = raw;
  const colorMap = new Map<string, number>();

  // Sample every Nth pixel for performance
  const sampleStep = Math.max(1, Math.floor((width * height) / 10_000));

  for (let i = 0; i < width * height; i += sampleStep) {
    const idx = i * channels;
    const alpha = channels >= 4 ? data[idx + 3] : 255;
    if (alpha < 128) continue; // Skip transparent pixels

    // Quantize to reduce color space (round to nearest 32)
    const r = Math.round(data[idx] / 32) * 32;
    const g = Math.round(data[idx + 1] / 32) * 32;
    const b = Math.round(data[idx + 2] / 32) * 32;

    const key = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
    colorMap.set(key, (colorMap.get(key) ?? 0) + 1);
  }

  // Sort by frequency and return top N
  return [...colorMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxColors)
    .map(([color]) => color);
}
