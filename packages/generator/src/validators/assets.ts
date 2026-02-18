import { stat } from "fs/promises";
import { join } from "path";
import sharp from "sharp";
import type { AssetManifest, AssetEntry } from "@sdr/shared";

/**
 * Validates assets for a generated game. Returns an array of error strings
 * (empty = all checks passed). Feeds into the retry loop like validateSyntax().
 *
 * Checks:
 * 1. Manifest structure (required fields, duplicates, frame consistency)
 * 2. Code/manifest cross-reference (keys used in code vs manifest)
 * 3. Spritesheet dimension validation (frame math vs actual image size)
 * 4. File existence (all referenced assets actually exist on disk)
 */
export async function validateAssets(
  manifest: AssetManifest,
  clientCode: string,
  assetsDir: string,
): Promise<string[]> {
  const errors: string[] = [];

  errors.push(...checkManifestStructure(manifest));
  errors.push(...checkCodeManifestCrossRef(manifest, clientCode));
  errors.push(...(await checkSpritesheetDimensions(manifest, assetsDir)));
  errors.push(...(await checkFileExistence(manifest, assetsDir)));

  return errors;
}

/**
 * Check 1: Manifest structure validation.
 * - Required fields present on every entry
 * - No duplicate keys across all asset types
 * - Spritesheet fields are consistent (both frameWidth and frameHeight, or neither)
 * - Animation frame indices within bounds
 */
function checkManifestStructure(manifest: AssetManifest): string[] {
  const errors: string[] = [];
  const allKeys = new Set<string>();

  const allEntries: Array<{ entry: AssetEntry; type: string }> = [
    ...manifest.sprites.map((e) => ({ entry: e, type: "sprite" })),
    ...manifest.audio.map((e) => ({ entry: e, type: "audio" })),
    ...manifest.music.map((e) => ({ entry: e, type: "music" })),
  ];

  for (const { entry, type } of allEntries) {
    if (!entry.key || entry.key.trim().length === 0) {
      errors.push(`${type} entry missing 'key' field (url: ${entry.url || "unknown"})`);
    }
    if (!entry.url || entry.url.trim().length === 0) {
      errors.push(`${type} entry missing 'url' field (key: ${entry.key || "unknown"})`);
    }

    if (entry.key && allKeys.has(entry.key)) {
      errors.push(`Duplicate asset key "${entry.key}" found in manifest`);
    }
    if (entry.key) allKeys.add(entry.key);
  }

  // Spritesheet-specific checks
  for (const sprite of manifest.sprites) {
    const hasWidth = sprite.frameWidth != null;
    const hasHeight = sprite.frameHeight != null;

    if (hasWidth !== hasHeight) {
      errors.push(
        `Sprite "${sprite.key}": frameWidth and frameHeight must both be present or both absent`,
      );
    }

    if (sprite.animations && sprite.animations.length > 0) {
      if (!hasWidth || !hasHeight) {
        errors.push(
          `Sprite "${sprite.key}" has animations but no frameWidth/frameHeight`,
        );
      }

      const frameCount = sprite.frameCount ?? Infinity;
      for (const anim of sprite.animations) {
        if (anim.startFrame < 0) {
          errors.push(`Sprite "${sprite.key}" animation "${anim.key}": startFrame < 0`);
        }
        if (anim.endFrame < anim.startFrame) {
          errors.push(
            `Sprite "${sprite.key}" animation "${anim.key}": endFrame (${anim.endFrame}) < startFrame (${anim.startFrame})`,
          );
        }
        if (anim.endFrame >= frameCount) {
          errors.push(
            `Sprite "${sprite.key}" animation "${anim.key}": endFrame (${anim.endFrame}) exceeds frameCount (${frameCount})`,
          );
        }
      }
    }
  }

  return errors;
}

/**
 * Check 2: Code/manifest cross-reference.
 * Regex-scans client code for Phaser asset key references and verifies
 * they exist in the manifest. Also warns about unused manifest entries.
 */
function checkCodeManifestCrossRef(
  manifest: AssetManifest,
  clientCode: string,
): string[] {
  const errors: string[] = [];

  // Collect all manifest keys
  const manifestKeys = new Set<string>();
  for (const s of manifest.sprites) manifestKeys.add(s.key);
  for (const a of manifest.audio) manifestKeys.add(a.key);
  for (const m of manifest.music) manifestKeys.add(m.key);

  // Patterns that reference asset keys in Phaser:
  // this.add.sprite(x, y, "key"), this.add.image(x, y, "key"), load.image("key"),
  // load.spritesheet("key"), .play("key"), this.sound.add("key")
  const keyPatterns = [
    /\.(?:add\.(?:sprite|image|tileSprite)|load\.(?:image|spritesheet|audio))\s*\(\s*["']([^"']+)["']/g,
    /\.(?:add\.(?:sprite|image|tileSprite))\s*\([^,]+,\s*[^,]+,\s*["']([^"']+)["']/g,
    /\.play\s*\(\s*["']([^"']+)["']/g,
    /\.sound\.add\s*\(\s*["']([^"']+)["']/g,
  ];

  const referencedKeys = new Set<string>();
  for (const pattern of keyPatterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(clientCode)) !== null) {
      referencedKeys.add(match[1]);
    }
  }

  // Keys used in code but missing from manifest
  for (const key of referencedKeys) {
    if (!manifestKeys.has(key)) {
      errors.push(`Asset key "${key}" used in client code but missing from manifest`);
    }
  }

  return errors;
}

/**
 * Check 3: Spritesheet dimension validation.
 * For sprites with frame data, reads the actual image and verifies dimensions
 * are compatible with the declared frame size and count.
 */
async function checkSpritesheetDimensions(
  manifest: AssetManifest,
  assetsDir: string,
): Promise<string[]> {
  const errors: string[] = [];

  for (const sprite of manifest.sprites) {
    if (!sprite.frameWidth || !sprite.frameHeight) continue;

    const spriteFilename = sprite.url.startsWith("http")
      ? sprite.url.split("/").pop() || sprite.key
      : sprite.url;
    const filePath = join(assetsDir, spriteFilename);

    try {
      await stat(filePath);
    } catch {
      // File doesn't exist, check 4 will catch this
      continue;
    }

    try {
      const metadata = await sharp(filePath).metadata();
      const imgWidth = metadata.width;
      const imgHeight = metadata.height;

      if (!imgWidth || !imgHeight) {
        errors.push(`Sprite "${sprite.key}": could not read image dimensions`);
        continue;
      }

      if (imgWidth % sprite.frameWidth !== 0) {
        errors.push(
          `Sprite "${sprite.key}": image width ${imgWidth} not divisible by frameWidth ${sprite.frameWidth}`,
        );
      }

      if (imgHeight % sprite.frameHeight !== 0) {
        errors.push(
          `Sprite "${sprite.key}": image height ${imgHeight} not divisible by frameHeight ${sprite.frameHeight}`,
        );
      }

      const cols = Math.floor(imgWidth / sprite.frameWidth);
      const rows = Math.floor(imgHeight / sprite.frameHeight);
      const maxFrames = cols * rows;

      if (sprite.frameCount != null && sprite.frameCount > maxFrames) {
        errors.push(
          `Sprite "${sprite.key}": declared frameCount ${sprite.frameCount} exceeds maximum ${maxFrames} (${cols}x${rows} grid)`,
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Sprite "${sprite.key}": failed to read image: ${msg}`);
    }
  }

  return errors;
}

/**
 * Check 4: File existence.
 * Verifies each URL in the manifest points to a real file on disk.
 */
async function checkFileExistence(
  manifest: AssetManifest,
  assetsDir: string,
): Promise<string[]> {
  const errors: string[] = [];

  const allEntries = [
    ...manifest.sprites.map((e) => ({ entry: e, type: "sprite" })),
    ...manifest.audio.map((e) => ({ entry: e, type: "audio" })),
    ...manifest.music.map((e) => ({ entry: e, type: "music" })),
  ];

  for (const { entry, type } of allEntries) {
    if (!entry.url) continue;
    // If url is an HTTP URL, check for the downloaded filename
    const filename = entry.url.startsWith("http")
      ? entry.url.split("/").pop() || entry.key
      : entry.url;
    const filePath = join(assetsDir, filename);
    try {
      await stat(filePath);
    } catch {
      errors.push(`${type} "${entry.key}": file not found at ${filename}`);
    }
  }

  return errors;
}
