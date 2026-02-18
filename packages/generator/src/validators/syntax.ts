import { mkdir, writeFile, rm } from "fs/promises";
import { join, resolve } from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
const WORKSPACE_ROOT = resolve(import.meta.dirname, "..", "..", "..", "..");

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

    // Create a minimal type stub for @sdr/server to avoid pulling in Colyseus decorators
    await mkdir(join(tmpDir, "stubs"), { recursive: true });
    await writeFile(join(tmpDir, "stubs", "sdr-server.d.ts"), `
declare module "@sdr/server" {
  export interface GameState {
    phase: string;
    timer: number;
    getPlayers(): Array<{ sessionId: string; name: string }>;
    setCustom(key: string, value: unknown): void;
    getCustom<T>(key: string): T | undefined;
    getCustomOr<T>(key: string, defaultValue: T): T;
    setPlayerCustom(sessionId: string, key: string, value: unknown): void;
    getPlayerCustom<T>(sessionId: string, key: string): T | undefined;
  }
  export interface RoomContext {
    state: GameState;
    broadcast(type: string, data: unknown): void;
    send(sessionId: string, type: string, data: unknown): void;
    elapsedTime: number;
  }
  export interface GeneratedRoomLogic {
    onInit?: (ctx: RoomContext) => void;
    onUpdate: (dt: number, ctx: RoomContext) => void;
    onPlayerInput?: (sessionId: string, input: { x: number; y: number; buttons: Record<string, boolean> }, ctx: RoomContext) => void;
    onPlayerAction: (sessionId: string, action: string, data: unknown, ctx: RoomContext) => void;
    onPlayerJoin?: (sessionId: string, ctx: RoomContext) => void;
    onPlayerLeave?: (sessionId: string, ctx: RoomContext) => void;
    checkWinCondition: (ctx: RoomContext) => string | null;
  }
}
`);

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
        experimentalDecorators: true,
        emitDecoratorMetadata: true,
        baseUrl: ".",
        paths: {
          "@sdr/shared": [join(WORKSPACE_ROOT, "packages/shared/src/index.ts")],
          "@sdr/engine": [join(WORKSPACE_ROOT, "packages/engine/src/index.ts")],
        },
      },
      include: ["client/game.ts", "server/room.ts", "stubs/sdr-server.d.ts"],
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
    const lines = output.split("\n").filter((l) =>
      l.includes("error TS") &&
      (l.includes("client/game.ts") || l.includes("server/room.ts"))
    );
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
