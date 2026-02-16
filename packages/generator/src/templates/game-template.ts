import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import type { GenerationResult } from "../prompts/gameplay.js";
import { GAME_DIR } from "@sdr/shared";

export async function writeGeneratedGame(
  date: string,
  result: GenerationResult
): Promise<string> {
  const gameDir = join(process.cwd(), "..", "..", GAME_DIR, date);
  const clientDir = join(gameDir, "client");
  const serverDir = join(gameDir, "server");
  const assetsDir = join(gameDir, "assets");

  await mkdir(clientDir, { recursive: true });
  await mkdir(serverDir, { recursive: true });
  await mkdir(assetsDir, { recursive: true });

  await writeFile(
    join(gameDir, "metadata.json"),
    JSON.stringify(result.metadata, null, 2)
  );

  await writeFile(join(clientDir, "game.ts"), result.clientCode);
  await writeFile(join(clientDir, "assets.json"), result.assetsManifest);
  await writeFile(join(serverDir, "room.ts"), result.serverCode);

  console.log(`Game written to ${gameDir}`);
  return gameDir;
}
