import { mkdir, writeFile, rm } from "fs/promises";
import { join } from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export async function validateSyntax(
  clientCode: string,
  serverCode: string,
): Promise<string[]> {
  const errors: string[] = [];

  if (!clientCode || clientCode.trim().length === 0) {
    errors.push("Client code is empty");
  }

  if (!serverCode || serverCode.trim().length === 0) {
    errors.push("Server code is empty");
  }

  if (clientCode.includes("require(")) {
    errors.push("Client code uses require() instead of import");
  }

  if (serverCode.includes("require(")) {
    errors.push("Server code uses require() instead of import");
  }

  if (errors.length > 0) return errors;

  // Write temp files and run tsc --noEmit
  const tmpDir = join(process.cwd(), ".gen-validate-tmp");

  try {
    await mkdir(join(tmpDir, "client"), { recursive: true });
    await mkdir(join(tmpDir, "server"), { recursive: true });

    await writeFile(join(tmpDir, "client", "game.ts"), clientCode);
    await writeFile(join(tmpDir, "server", "room.ts"), serverCode);

    // Minimal tsconfig for validation
    const tsconfig = {
      compilerOptions: {
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "bundler",
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        esModuleInterop: true,
        paths: {
          "@sdr/shared": ["../../packages/shared/src/index.ts"],
          "@sdr/engine": ["../../packages/engine/src/index.ts"],
          "@sdr/server": ["../../packages/server/src/index.ts"],
        },
      },
      include: ["client/game.ts", "server/room.ts"],
    };

    await writeFile(
      join(tmpDir, "tsconfig.json"),
      JSON.stringify(tsconfig, null, 2),
    );

    await execFileAsync("npx", ["tsc", "--project", join(tmpDir, "tsconfig.json")], {
      cwd: tmpDir,
      timeout: 30000,
    });
  } catch (err) {
    const error = err as { stderr?: string; stdout?: string };
    const output = (error.stdout ?? "") + (error.stderr ?? "");

    // Parse tsc output into individual errors
    const lines = output.split("\n").filter((l) => l.includes("error TS"));
    if (lines.length > 0) {
      errors.push(...lines.map((l) => l.trim()));
    } else if (output.trim()) {
      errors.push(output.trim());
    } else {
      errors.push("TypeScript compilation failed with unknown error");
    }
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }

  return errors;
}
