import { generateGame } from "./prompts/gameplay.js";
import { validateSyntax } from "./validators/syntax.js";
import { writeGeneratedGame } from "./templates/game-template.js";
import { compileGeneratedGame } from "./templates/compile.js";

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
