import type { AssetCategory, TileDetectionResult, AnimationDetectionResult } from "../types.js";

export interface CategorizationInput {
  width: number;
  height: number;
  has_transparency: boolean;
  tile_grid: TileDetectionResult | null;
  animation: AnimationDetectionResult | null;
  tags: string[];
}

export interface CategorizationResult {
  category: AssetCategory;
  confidence: number;
}

export function categorize(input: CategorizationInput): CategorizationResult {
  const { width, height, has_transparency, tile_grid, animation, tags } = input;
  const tagSet = new Set(tags.map((t) => t.toLowerCase()));

  // Helper to check if any tag matches
  const hasTag = (...keywords: string[]) =>
    keywords.some(
      (kw) =>
        tagSet.has(kw) ||
        [...tagSet].some((t) => t.includes(kw))
    );

  // 0. Animation strip detected with high confidence: always spritesheet
  if (animation?.isAnimationStrip && animation.confidence > 0.6) {
    return { category: "spritesheet", confidence: animation.confidence };
  }

  // 1. Tilesheet: tile grid detected, image > 128x128, more than 4 tiles, NOT an animation
  if (tile_grid && tile_grid.score > 0.6 && width > 128 && height > 128) {
    const totalTiles = tile_grid.columns * tile_grid.rows;
    if (totalTiles > 4) {
      return { category: "tilesheet", confidence: tile_grid.score };
    }
  }

  // 2. Spritesheet: horizontal strip with transparency, relevant tags, or animation detected
  const aspectRatio = width / height;
  const isHorizontalStrip = aspectRatio >= 4 && has_transparency;
  const hasSpriteTags = hasTag("sprite", "animation", "spritesheet", "walk", "run", "idle");
  const hasAnimationSignal = animation != null && animation.frameSimilarity > 0.5;

  if (isHorizontalStrip || (hasSpriteTags && has_transparency) || hasAnimationSignal) {
    let confidence = 0.7;
    if (isHorizontalStrip && hasSpriteTags) confidence = 0.9;
    else if (hasAnimationSignal) confidence = Math.max(0.75, animation!.confidence);
    return { category: "spritesheet", confidence };
  }

  // 3. Icon: small dimensions with transparency
  if (width <= 128 && height <= 128 && has_transparency) {
    const confidence = hasTag("icon", "item") ? 0.85 : 0.65;
    return { category: "icon", confidence };
  }

  // 4. UI: relevant tags
  if (hasTag("ui", "button", "hud", "menu", "interface", "gui")) {
    return { category: "ui", confidence: 0.75 };
  }

  // 5. Character: relevant tags with transparency
  if (hasTag("character", "player", "enemy", "npc", "hero") && has_transparency) {
    return { category: "character", confidence: 0.7 };
  }

  // 6. Effect: relevant tags with transparency
  if (hasTag("effect", "particle", "explosion", "magic", "fire", "smoke") && has_transparency) {
    return { category: "effect", confidence: 0.7 };
  }

  // 7. Background: no transparency, large, no tile grid, or background tags
  const isLarge = width > 512 || height > 512;
  const hasBackgroundTags = hasTag("background", "parallax", "sky", "landscape");

  if (hasBackgroundTags || (!has_transparency && isLarge && !tile_grid)) {
    const confidence = hasBackgroundTags ? 0.8 : 0.6;
    return { category: "background", confidence };
  }

  // 8. Fallback
  return { category: "other", confidence: 0.3 };
}
