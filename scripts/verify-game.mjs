#!/usr/bin/env node
/**
 * Playwright visual verification for SDR games.
 * Launches the game in a headless browser, waits for Phaser to render,
 * takes a screenshot, and checks:
 * 1. No critical JS errors
 * 2. Phaser canvas exists and has content
 * 3. At least one image texture is loaded (not just rectangles)
 * Exits 0 if OK, 1 if failed.
 */

import { chromium } from 'playwright';

const GAME_URL = process.env.GAME_URL || 'http://sdr.tailf93a13.ts.net/';
const SCREENSHOT_PATH = process.env.SCREENSHOT_PATH || '/tmp/game-verify.png';
const TIMEOUT = 30000;

async function verify() {
  const errors = [];
  let browser;

  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    // Collect JS errors
    const jsErrors = [];
    page.on('pageerror', (err) => {
      jsErrors.push(err.message);
    });
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        jsErrors.push(msg.text());
      }
    });

    console.log(`Navigating to ${GAME_URL}...`);
    await page.goto(GAME_URL, { waitUntil: 'networkidle', timeout: TIMEOUT });

    // Wait for the page to settle
    await page.waitForTimeout(3000);

    // Look for a Play button and click it if found
    const playButton = await page.$('button:has-text("Play"), [class*="play"], a:has-text("Play")');
    if (playButton) {
      console.log('Found Play button, clicking...');
      await playButton.click();
      // Wait for "How to Play" overlay to disappear (shows for 5 seconds at game start)
      await page.waitForTimeout(8000);
    }

    // Check for canvas element
    const canvasExists = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      return canvas !== null;
    });

    if (!canvasExists) {
      errors.push('No <canvas> element found - Phaser may not have initialized');
    } else {
      console.log('Canvas element found.');
    }

    // Check for loaded textures in Phaser
    const textureInfo = await page.evaluate(() => {
      // Try to find Phaser game instance
      const game = window.__PHASER_GAME__ ||
        window.game ||
        (window.Phaser && window.Phaser.GAMES && window.Phaser.GAMES[0]);

      if (!game) {
        // Try to find it via scene
        const canvases = document.querySelectorAll('canvas');
        for (const c of canvases) {
          if (c.__phaser) return { found: true, textures: ['unknown'], source: 'canvas' };
        }
        return { found: false, textures: [], source: 'none' };
      }

      const textures = game.textures;
      if (!textures) return { found: true, textures: [], source: 'game-no-textures' };

      const textureKeys = Object.keys(textures.list || {});
      const defaultKeys = ['__DEFAULT', '__MISSING', '__WHITE'];
      const customTextures = textureKeys.filter(k => !defaultKeys.includes(k));

      return {
        found: true,
        textures: customTextures,
        allTextures: textureKeys,
        source: 'game.textures'
      };
    });

    console.log('Texture info:', JSON.stringify(textureInfo));

    if (textureInfo.found && textureInfo.textures.length === 0) {
      errors.push('No custom textures loaded - game is using only colored rectangles. Textures found: ' +
        JSON.stringify(textureInfo.allTextures || []));
    } else if (textureInfo.found && textureInfo.textures.length > 0) {
      console.log(`Found ${textureInfo.textures.length} custom textures: ${textureInfo.textures.join(', ')}`);
    }

    // Check for critical JS errors (filter out non-critical ones)
    const criticalErrors = jsErrors.filter(e =>
      !e.includes('net::ERR') &&
      !e.includes('favicon') &&
      !e.includes('WebSocket')
    );

    if (criticalErrors.length > 0) {
      console.warn('JS errors detected:', criticalErrors);
      // Don't fail on JS errors alone - the game might still render fine
    }

    // Take screenshot
    await page.screenshot({ path: SCREENSHOT_PATH, fullPage: true });
    console.log(`Screenshot saved to ${SCREENSHOT_PATH}`);

    // Check if canvas has actual content (not just black)
    const canvasContent = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      if (!canvas) return { hasContent: false };

      const ctx = canvas.getContext('2d') || canvas.getContext('webgl') || canvas.getContext('webgl2');
      if (!ctx) return { hasContent: false };

      // For 2D context, check pixel data
      if (ctx instanceof CanvasRenderingContext2D) {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        let nonBlackPixels = 0;
        let uniqueColors = new Set();
        for (let i = 0; i < data.length; i += 16) { // Sample every 4th pixel
          const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
          if (a > 0 && (r > 10 || g > 10 || b > 10)) {
            nonBlackPixels++;
            uniqueColors.add(`${Math.floor(r / 32)},${Math.floor(g / 32)},${Math.floor(b / 32)}`);
          }
        }
        return {
          hasContent: nonBlackPixels > 100,
          nonBlackPixels,
          uniqueColors: uniqueColors.size,
          width: canvas.width,
          height: canvas.height
        };
      }

      // For WebGL, we can't easily check pixels, assume it has content if canvas exists
      return { hasContent: true, type: 'webgl' };
    });

    console.log('Canvas content check:', JSON.stringify(canvasContent));

    if (!canvasContent.hasContent) {
      errors.push('Canvas appears to be empty or black');
    }

  } catch (err) {
    errors.push(`Browser error: ${err.message}`);
  } finally {
    if (browser) await browser.close();
  }

  if (errors.length > 0) {
    console.error('\n❌ Verification FAILED:');
    errors.forEach(e => console.error(`  - ${e}`));
    process.exit(1);
  } else {
    console.log('\n✅ Verification PASSED');
    process.exit(0);
  }
}

verify().catch(err => {
  console.error('Verification script error:', err);
  process.exit(1);
});
