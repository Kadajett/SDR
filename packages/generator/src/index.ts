import { execFile } from "child_process";
import { promisify } from "util";
import { join } from "path";
import { generateGame } from "./prompts/gameplay.js";
import { validateSyntax } from "./validators/syntax.js";
import { validateAssets } from "./validators/assets.js";
import { writeGeneratedGame } from "./templates/game-template.js";
import { compileGeneratedGame } from "./templates/compile.js";
import { downloadAssets } from "./assets/downloader.js";
import { copyAssetFromCatalog } from "./assets/copy-catalog.js";
import type { AssetManifest } from "@sdr/shared";

const exec = promisify(execFile);

async function gitPublish(date: string, title: string): Promise<void> {
  const cwd = process.cwd();
  // Navigate to workspace root (generator runs from packages/generator)
  const root = join(process.cwd(), "..", "..");

  const run = (cmd: string, args: string[]) =>
    exec(cmd, args, { cwd: root });

  console.log("Publishing game to git...");

  await run("git", ["add", `games/${date}`]);
  await run("git", [
    "commit",
    "-m",
    `Add generated game for ${date}: ${title}`,
  ]);
  await run("git", ["push"]);

  console.log("Game pushed to GitHub");
}

async function main() {
  const today = new Date().toISOString().split("T")[0];
  console.log(`Generating game for ${today}...`);

  const maxRetries = 3;
  let previousErrors: string[] | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`Attempt ${attempt}/${maxRetries}`);

    try {
      const result = await generateGame(previousErrors);

      // Step 1: Syntax validation
      const syntaxErrors = await validateSyntax(result.clientCode, result.serverCode);
      if (syntaxErrors.length > 0) {
        console.error("Syntax errors found:", syntaxErrors);
        previousErrors = syntaxErrors;
        if (attempt < maxRetries) {
          console.log("Retrying with error context...");
          continue;
        }
        throw new Error(`Failed after ${maxRetries} attempts: ${syntaxErrors.join(", ")}`);
      }

      // Step 2: Write game files (creates directory structure)
      const gameDir = await writeGeneratedGame(today, result);
      const assetsDir = join(gameDir, "assets");

      // Step 3: Copy catalog assets + download any remote assets
      const manifest: AssetManifest = JSON.parse(result.assetsManifest);
      // First, try copying from local catalog
      const { copyCatalogAssets } = await import("./assets/copy-catalog.js");
      const copied = copyCatalogAssets(manifest.sprites, assetsDir);
      if (copied.length > 0) {
        console.log(`Copied ${copied.length} assets from catalog: ${copied.join(", ")}`);
      }

      // Then download any remaining remote assets
      const allEntries = [
        ...manifest.sprites,
        ...manifest.audio,
        ...manifest.music,
      ];

      if (allEntries.length > 0) {
        const toDownload = allEntries
          .filter((e) => e.url && e.url.startsWith("http") && !copied.includes(e.key));
        if (toDownload.length > 0) {
          console.log(`Downloading ${toDownload.length} remote assets...`);
          await downloadAssets(
            toDownload.map((e) => ({
              url: e.url,
              filename: e.url.split("/").pop() || e.key,
              targetDir: assetsDir,
            })),
          );
        }
      }

      // Step 4: Asset validation
      const assetErrors = await validateAssets(manifest, result.clientCode, assetsDir);
      if (assetErrors.length > 0) {
        console.error("Asset validation errors:", assetErrors);
        previousErrors = assetErrors;
        if (attempt < maxRetries) {
          console.log("Retrying with asset error context...");
          continue;
        }
        throw new Error(`Asset validation failed after ${maxRetries} attempts: ${assetErrors.join(", ")}`);
      }

      // Step 5: Compile
      await compileGeneratedGame(gameDir);
      console.log(`Game compiled successfully: ${result.metadata.title}`);

      // Step 6: Playwright visual verification (if available)
      try {
        const verifyScript = join(process.cwd(), "..", "..", "scripts", "verify-game.mjs");
        const { existsSync: verifyExists } = await import("fs");
        if (verifyExists(verifyScript)) {
          console.log("Running Playwright visual verification...");
          const verifyResult = await exec("node", [verifyScript], {
            env: { ...process.env, GAME_URL: `http://sdr.tailf93a13.ts.net/`, SCREENSHOT_PATH: `/tmp/game-verify-${today}.png` },
          });
          console.log(verifyResult.stdout);
          if (verifyResult.stderr) console.warn(verifyResult.stderr);
          console.log("Visual verification passed!");
        } else {
          console.warn("Playwright verify script not found, skipping visual verification");
        }
      } catch (verifyErr: unknown) {
        const errMsg = verifyErr instanceof Error ? verifyErr.message : String(verifyErr);
        console.error("Visual verification failed:", errMsg);
        previousErrors = [
          `Previous attempt failed visual verification: sprites not loading. ` +
          `Make sure asset paths start with /games/${today}/assets/ and you're using this.load.image() in preload(). ` +
          `Use at least 2 assets from the catalog.`
        ];
        if (attempt < maxRetries) {
          console.log("Retrying with visual verification error context...");
          continue;
        }
        console.warn("Visual verification failed but proceeding (max retries reached)");
      }

      await gitPublish(today, result.metadata.title);
      return;
    } catch (err) {
      console.error(`Attempt ${attempt} failed:`, err);
      if (attempt === maxRetries) {
        throw err;
      }
    }
  }
}

main().catch((err) => {
  console.error("Generation failed:", err);
  process.exit(1);
});
