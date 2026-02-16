import Anthropic from "@anthropic-ai/sdk";
import type { GameMetadata } from "@sdr/shared";
import { SYSTEM_PROMPT } from "./system.js";
import { randomize, topicsToPrompt } from "../randomizer/index.js";

export interface GenerationResult {
  metadata: GameMetadata;
  clientCode: string;
  serverCode: string;
  assetsManifest: string;
}

const CLIENT_MARKER = "```typescript:client/game.ts";
const SERVER_MARKER = "```typescript:server/room.ts";
const ASSETS_MARKER = "```json:assets.json";
const META_MARKER = "```json:metadata.json";

function extractBlock(response: string, marker: string): string {
  const start = response.indexOf(marker);
  if (start === -1) return "";
  const codeStart = response.indexOf("\n", start) + 1;
  const end = response.indexOf("```", codeStart);
  if (end === -1) return "";
  return response.slice(codeStart, end).trim();
}

export async function generateGame(
  previousErrors?: string[],
): Promise<GenerationResult> {
  const today = new Date().toISOString().split("T")[0];
  const topics = randomize(today);
  const prompt = topicsToPrompt(topics);

  console.log(`Topics: ${prompt}`);
  console.log(`Seed: ${topics.seed}`);

  const client = new Anthropic();

  let userPrompt = `Create a 2D multiplayer game based on this concept: **${prompt}**

Generate the following files:

1. \`${CLIENT_MARKER}\` - A complete client scene extending BaseScene, using bitECS 0.4 for entity management
2. \`${SERVER_MARKER}\` - Server room logic implementing GeneratedRoomLogic with RoomContext (import from @sdr/server)
3. \`${ASSETS_MARKER}\` - Asset manifest (use empty arrays for now, assets will be filled in later)
4. \`${META_MARKER}\` - Game metadata with these fields:
   { "title": "short catchy name", "description": "1-2 sentence description", "controls": "control scheme description", "howToPlay": "brief rules explanation" }

The game must:
- Be fun for 2-5 players on Steam Deck (1280x800, gamepad input)
- Use InputManager for input (gamepad + keyboard)
- Use bitECS 0.4 patterns (createWorld, addEntity, addComponent, query, observe, onAdd, onRemove)
- Have clear win/lose conditions and 2-5 minute rounds
- Use frame-rate independent movement (delta time)
- Show a "How to Play" overlay for 5 seconds at start
- Use HUD from @sdr/engine for score display, timer, and player list
- Use ctx.state.setCustom/getCustom for all game state on the server (no hardcoded x/y/score on PlayerSchema)
- Use ctx.broadcast() to push ECS entity data to clients when entity state changes
- Use this.add.sprite() for catalog assets with colored rectangle fallback for simple shapes
- Every asset key used in code MUST appear in the assets.json manifest (the validator checks this)`;

  if (previousErrors && previousErrors.length > 0) {
    userPrompt += `\n\nThe previous generation attempt had these TypeScript errors. Fix them:\n${previousErrors.join("\n")}`;
  }

  const message = await client.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const responseText = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n");

  const clientCode = extractBlock(responseText, CLIENT_MARKER);
  const serverCode = extractBlock(responseText, SERVER_MARKER);
  const assetsManifest = extractBlock(responseText, ASSETS_MARKER) || '{"sprites":[],"audio":[],"music":[]}';
  const metaBlock = extractBlock(responseText, META_MARKER);

  if (!clientCode) {
    throw new Error("Failed to extract client code from Claude response");
  }

  if (!serverCode) {
    throw new Error("Failed to extract server code from Claude response");
  }

  // Parse metadata from Claude's response, with fallbacks
  let gameMeta = { title: prompt, description: `A 2D multiplayer game: ${prompt}`, controls: "Left stick to move, A to action", howToPlay: "" };
  if (metaBlock) {
    try {
      const parsed = JSON.parse(metaBlock) as Record<string, string>;
      gameMeta = {
        title: parsed.title || gameMeta.title,
        description: parsed.description || gameMeta.description,
        controls: parsed.controls || gameMeta.controls,
        howToPlay: parsed.howToPlay || gameMeta.howToPlay,
      };
    } catch {
      console.warn("Failed to parse metadata block, using defaults");
    }
  }

  return {
    metadata: {
      id: today,
      date: today,
      title: gameMeta.title,
      description: gameMeta.description,
      playerCount: { min: 2, max: 5 },
      controls: gameMeta.controls,
      howToPlay: gameMeta.howToPlay,
      seed: topics.seed,
      topics,
      assets: JSON.parse(assetsManifest),
    },
    clientCode,
    serverCode,
    assetsManifest,
  };
}
