import { build } from "esbuild";
import { join, resolve } from "path";

const WORKSPACE_ROOT = resolve(import.meta.dirname, "..", "..", "..", "..");

/**
 * Compiles generated game TypeScript files into JavaScript bundles.
 * - client/game.ts -> client/game.js (ESM, self-contained browser bundle with all deps)
 * - server/room.ts -> server/room.js (ESM, Node.js, externalizes server deps)
 *
 * The client bundle includes phaser, bitecs, and engine code so the game
 * is fully self-contained. Each game exports a `launch()` function that
 * creates the Phaser.Game internally.
 */
export async function compileGeneratedGame(gameDir: string): Promise<void> {
  const clientPath = join(gameDir, "client", "game.ts");
  const serverPath = join(gameDir, "server", "room.ts");

  // Compile client scene for browser (self-contained bundle)
  await build({
    entryPoints: [clientPath],
    outfile: join(gameDir, "client", "game.js"),
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "esnext",
    // Resolve workspace packages via their source
    alias: {
      "@sdr/shared": join(WORKSPACE_ROOT, "packages/shared/src/index.ts"),
      "@sdr/engine": join(WORKSPACE_ROOT, "packages/engine/src/index.ts"),
    },
    // Resolve node_modules from workspace packages (pnpm hoists deps per package)
    nodePaths: [
      join(WORKSPACE_ROOT, "packages/engine/node_modules"),
      join(WORKSPACE_ROOT, "packages/generator/node_modules"),
      join(WORKSPACE_ROOT, "node_modules"),
    ],
    absWorkingDir: WORKSPACE_ROOT,
    // Don't externalize anything for client: bundle phaser, bitecs, engine
    // so the game is fully self-contained in the browser
    minify: true,
    sourcemap: true,
  });

  // Compile server room for Node.js
  await build({
    entryPoints: [serverPath],
    outfile: join(gameDir, "server", "room.js"),
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node20",
    alias: {
      "@sdr/shared": join(WORKSPACE_ROOT, "packages/shared/src/index.ts"),
    },
    nodePaths: [join(WORKSPACE_ROOT, "node_modules")],
    absWorkingDir: WORKSPACE_ROOT,
    external: [
      "@sdr/server",
      "@sdr/engine",
      "@colyseus/schema",
      "@colyseus/core",
      "colyseus",
    ],
  });

  console.log("Game compiled successfully");
}
