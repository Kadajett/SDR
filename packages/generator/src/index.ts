import { execFile } from "child_process";
import { promisify } from "util";
import { generateGame } from "./prompts/gameplay.js";
import { validateSyntax } from "./validators/syntax.js";
import { writeGeneratedGame } from "./templates/game-template.js";
import { compileGeneratedGame } from "./templates/compile.js";

const exec = promisify(execFile);

async function gitPublish(date: string, title: string): Promise<void> {
  const cwd = process.cwd();
  // Navigate to workspace root (generator runs from packages/generator)
  const root = new URL("../../../..", import.meta.url).pathname;

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

      const gameDir = await writeGeneratedGame(today, result);
      await compileGeneratedGame(gameDir);
      console.log(`Game generated successfully: ${result.metadata.title}`);

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
