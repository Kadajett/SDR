---
name: game-generation-guidelines
description: >
  Coding guidelines and constraints for Claude when generating nightly multiplayer games.
  Covers the engine API surface, ECS patterns with bitECS, multiplayer state sync with Colyseus,
  asset usage, and required game structure. This is the primary reference for the generation script.
  Trigger: "generate game", "game generation", "nightly game", "game coding guidelines".
---

# Game Generation Coding Guidelines

These are the rules Claude MUST follow when generating a new multiplayer game for the Steam Deck Randomizer system. Every generated game must compile, run, and be fun for 2-5 players on Steam Deck.

---

## Golden Rules

1. **Every game MUST be multiplayer** (2-5 players). No single-player games.
2. **Every game MUST work with gamepad AND keyboard**. See `steamdeck-controls` skill.
3. **Every game MUST extend the shared engine**. Do not reinvent rendering, input, or networking.
4. **Every game MUST use bitECS** for entity management. See `bitecs` skill.
5. **Every game MUST fit in TWO files**: one client scene file, one server room file.
6. **Every game MUST have clear win/lose conditions** and 2-5 minute rounds.
7. **Every game MUST use only assets from the provided catalog**. No external URLs.
8. **Every game MUST be frame-rate independent** (use delta time, never frame counts).
9. **Every game MUST target 1280x800** resolution (Steam Deck native).
10. **Every game MUST handle player join/leave gracefully** mid-game.

---

## Architecture Overview

```
Generated Game
  ├── client/game.ts    (extends BaseScene, uses bitECS + Phaser)
  ├── server/room.ts    (Colyseus room logic, authoritative state)
  ├── assets.json       (references to catalog assets)
  └── metadata.json     (title, description, controls, genre)
```

The engine (`@sdr/engine`) handles:
- Phaser initialization and lifecycle
- Gamepad + keyboard input reading
- Asset loading from manifest
- Colyseus client connection and state sync
- HUD (scores, timer, player list)
- Lobby (wait for players, ready up)

Claude generates ONLY gameplay logic on top of this.

---

## Client-Side Game File Structure

Every `client/game.ts` MUST follow this structure:

```typescript
import Phaser from "phaser";
import {
  createWorld, addEntity, addComponent, removeEntity,
  query, observe, onAdd, onRemove,
} from "bitecs";
import type { PlayerState, EntityDef, Vec2 } from "@sdr/shared";
import { BaseScene, InputManager } from "@sdr/engine";

// ============================================================
// 1. COMPONENTS (bitECS SoA format)
// ============================================================
const Position = { x: [] as number[], y: [] as number[] };
const Velocity = { dx: [] as number[], dy: [] as number[] };
const Health = { current: [] as number[], max: [] as number[] };
const SpriteRef = { key: [] as string[], gameObject: [] as (Phaser.GameObjects.Sprite | null)[] };
const PlayerControlled = { sessionId: [] as string[] };
// Add more components as needed for this game

// ============================================================
// 2. QUERIES (bitECS 0.4 uses query() directly, no defineQuery)
// ============================================================
// Queries are called inline: query(world, [Position, Velocity])
// There is NO defineQuery in bitECS 0.4.

// ============================================================
// 3. SYSTEMS (pure functions operating on the world)
// ============================================================
function movementSystem(world: ReturnType<typeof createWorld>, dt: number): void {
  for (const eid of query(world, [Position, Velocity])) {
    Position.x[eid] += Velocity.dx[eid] * dt;
    Position.y[eid] += Velocity.dy[eid] * dt;
  }
}

function inputSystem(
  world: ReturnType<typeof createWorld>,
  input: { moveX: number; moveY: number; action1: boolean },
  localPlayerEid: number,
  speed: number,
): void {
  Velocity.dx[localPlayerEid] = input.moveX * speed;
  Velocity.dy[localPlayerEid] = input.moveY * speed;
}

function renderSystem(
  world: ReturnType<typeof createWorld>,
  scene: Phaser.Scene,
): void {
  for (const eid of query(world, [Position, SpriteRef])) {
    const sprite = SpriteRef.gameObject[eid];
    if (sprite) {
      sprite.x = Position.x[eid];
      sprite.y = Position.y[eid];
    }
  }
}

// ============================================================
// 4. SCENE (extends BaseScene)
// ============================================================
export default class TodaysGame extends BaseScene {
  private world!: ReturnType<typeof createWorld>;
  private inputManager!: InputManager;
  private localPlayerEid = -1;

  // REQUIRED: entity definitions for this game
  entities: Record<string, EntityDef> = {
    player: { sprite: "player_sprite", physics: "dynamic", speed: 200 },
    // ... more entity types
  };

  create(): void {
    this.world = createWorld();
    this.inputManager = new InputManager(this);
    this.inputManager.setup();

    // Create entities, set up physics, load level
    // ...
  }

  // REQUIRED: called every frame
  onUpdate(dt: number, players: PlayerState[]): void {
    const input = this.inputManager.getState();

    inputSystem(this.world, input, this.localPlayerEid, 200);
    movementSystem(this.world, dt);
    renderSystem(this.world, this);
    // ... more systems
  }

  // REQUIRED: return winner's sessionId or null
  checkWinCondition(players: PlayerState[]): string | null {
    // Example: first to 10 points wins
    const winner = players.find((p) => (p.score ?? 0) >= 10);
    return winner?.sessionId ?? null;
  }

  // OPTIONAL: handle collisions
  onCollision(a: Phaser.GameObjects.GameObject, b: Phaser.GameObjects.GameObject): void {
    // ...
  }
}
```

---

## Server-Side Room File Structure

The server uses a **generic state container** (GameState) with flexible custom data storage. Generated rooms do NOT define custom schema fields. Instead, use `state.setCustom()` / `state.getCustom()` for game-level data and `state.setPlayerCustom()` / `state.getPlayerCustom()` for per-player data.

Every `server/room.ts` MUST follow this structure:

```typescript
import type { GeneratedRoomLogic } from "@sdr/server";
import type { GameState } from "@sdr/server";

const GAME_DURATION = 180; // seconds (3 minutes)

const roomLogic: GeneratedRoomLogic = {
  onInit(state: GameState): void {
    // Set up initial game state using custom data
    state.setCustom("roundTimer", GAME_DURATION);
    state.setCustom("items", []);

    // Initialize per-player state
    for (const player of state.getPlayers()) {
      state.setPlayerCustom(player.sessionId, "score", 0);
      state.setPlayerCustom(player.sessionId, "x", 640);
      state.setPlayerCustom(player.sessionId, "y", 400);
    }
  },

  onUpdate(dt: number, state: GameState): void {
    const timer = state.getCustomOr("roundTimer", GAME_DURATION);
    state.setCustom("roundTimer", timer - dt / 1000);

    if (timer <= 0) {
      state.phase = "finished";
    }

    // Authoritative game logic:
    // - Validate player positions
    // - Spawn items on timers
    // - Check collisions server-side
    // - Update scores via state.setPlayerCustom()
  },

  onPlayerInput(
    sessionId: string,
    input: { x: number; y: number; buttons: Record<string, boolean> },
    state: GameState,
  ): void {
    // Handle continuous input (movement, aim)
    const x = state.getPlayerCustom<number>(sessionId, "x") ?? 0;
    const y = state.getPlayerCustom<number>(sessionId, "y") ?? 0;
    state.setPlayerCustom(sessionId, "x", x + input.x * 5);
    state.setPlayerCustom(sessionId, "y", y + input.y * 5);
  },

  onPlayerAction(sessionId: string, action: string, data: unknown, state: GameState): void {
    // Handle discrete player-initiated actions
    // ALWAYS validate on server. Never trust client.
    switch (action) {
      case "use_item":
        // Validate player has the item, apply effect
        break;
      case "attack":
        // Validate range, cooldown, apply damage
        break;
    }
  },

  onPlayerJoin(sessionId: string, state: GameState): void {
    // Initialize new player's custom data
    state.setPlayerCustom(sessionId, "score", 0);
    state.setPlayerCustom(sessionId, "x", 640);
    state.setPlayerCustom(sessionId, "y", 400);
  },

  onPlayerLeave(sessionId: string, state: GameState): void {
    // Clean up player-specific data if needed
  },

  checkWinCondition(state: GameState): string | null {
    // Return sessionId of winner, or null if game continues
    for (const player of state.getPlayers()) {
      const score = state.getPlayerCustom<number>(player.sessionId, "score") ?? 0;
      if (score >= 10) return player.sessionId;
    }
    return null;
  },
};

export default roomLogic;
```

### GameState API Reference

| Method | Description |
|--------|-------------|
| `state.setCustom(key, value)` | Store any JSON-serializable value as game-level state |
| `state.getCustom<T>(key)` | Retrieve a typed value (returns `undefined` if missing) |
| `state.getCustomOr<T>(key, default)` | Retrieve with fallback default value |
| `state.setPlayerCustom(sessionId, key, value)` | Store data on a specific player |
| `state.getPlayerCustom<T>(sessionId, key)` | Retrieve player-specific data |
| `state.getPlayers()` | Get all connected players |
| `state.phase` | Current phase: "lobby", "playing", "finished" |
| `state.timer` | Game timer (number) |

**IMPORTANT**: Do NOT assume `x`, `y`, or `score` exist on the player schema. Use `setPlayerCustom` / `getPlayerCustom` for ALL game-specific player data.

---

## bitECS Patterns for Generated Games

### addComponent Signature (CRITICAL)

bitECS 0.4 uses `addComponent(world, eid, Component)`, NOT `addComponent(world, Component, eid)`:

```typescript
const eid = addEntity(world);
addComponent(world, eid, Position);  // world, entity, component
addComponent(world, eid, Velocity);
```

### Component Design Rules

1. **Use SoA (Structure-of-Arrays) format** for performance:
   ```typescript
   // GOOD: SoA - cache friendly
   const Position = { x: [] as number[], y: [] as number[] };

   // AVOID: AoS for hot data
   const Position = [] as { x: number; y: number }[];
   ```

2. **Keep components small and focused**. One concern per component:
   ```typescript
   // GOOD: Separate concerns
   const Position = { x: [] as number[], y: [] as number[] };
   const Health = { current: [] as number[], max: [] as number[] };

   // BAD: Kitchen sink component
   const Entity = { x: [], y: [], health: [], name: [], score: [] };
   ```

3. **Use tag components** (empty objects) for flags:
   ```typescript
   const IsEnemy = {};
   const IsCollectible = {};
   const IsDead = {};
   ```

### System Design Rules

1. **Systems are pure functions**. They take the world (and optional context) and mutate component data:
   ```typescript
   function gravitySystem(world: World, dt: number): void {
     for (const eid of query(world, [Position, Velocity])) {
       Velocity.dy[eid] += 9.8 * dt;
     }
   }
   ```

2. **Run systems in a deterministic order** in the scene's `onUpdate`:
   ```typescript
   onUpdate(dt: number, players: PlayerState[]): void {
     inputSystem(this.world, input, this.localPlayerEid);
     movementSystem(this.world, dt);
     collisionSystem(this.world);
     spawnSystem(this.world, dt);
     scoreSystem(this.world, players);
     cleanupSystem(this.world);
     renderSystem(this.world, this);
   }
   ```

3. **Use observers** for entity lifecycle (bitECS 0.4 uses `observe` + `onAdd`/`onRemove`, NOT `enterQuery`/`exitQuery`):
   ```typescript
   // Set up observers once (e.g., in scene create):
   observe(world, onAdd(IsEnemy, Position), (eid: number) => {
     // New enemy: create sprite
     const sprite = scene.add.sprite(Position.x[eid], Position.y[eid], "enemy");
     gameObjects.set(eid, sprite);
   });

   observe(world, onRemove(IsEnemy, Position), (eid: number) => {
     // Enemy removed: destroy sprite
     gameObjects.get(eid)?.destroy();
     gameObjects.delete(eid);
   });
   ```

   **CRITICAL**: Store Phaser GameObjects in a `Map<number, GameObject>`, NOT in ECS components.
   ECS components must contain only serializable data (numbers, strings).

---

## Multiplayer State Sync Rules

### Client-Server Authority Model

The server is AUTHORITATIVE for:
- Player positions (validated)
- Scores
- Game phase (lobby, playing, finished)
- Win/lose conditions
- Item spawns and pickups
- Damage and health

The client is responsible for:
- Reading local input
- Sending input to server
- Rendering interpolated state
- Playing sound effects
- Showing UI/HUD
- Client-side prediction (optional, for responsiveness)

### Network Message Types

Generated games communicate via these Colyseus message types:

```typescript
// Client -> Server
"input"      // { x, y, buttons } - every frame
"action"     // { action: string, data: unknown } - discrete events
"ready"      // { ready: boolean } - lobby ready state

// Server -> Client (via state sync)
// Colyseus automatically syncs GameState schema changes
// Use broadcast for game events:
"game:start"    // Game begins
"game:event"    // Custom game events (item spawned, explosion, etc.)
"game:win"      // { winnerId: string } - game over
```

### Keep Network Traffic Minimal

1. Send input every frame (it's small: x, y, buttons)
2. Send actions only on discrete events (button press, not hold)
3. Do NOT send full entity state from client (server is authoritative)
4. Use Colyseus schema for automatic delta compression

---

## Asset Usage Rules

### Using the Asset Catalog

Games MUST only reference assets from `packages/generator/src/assets/catalog.json`. The asset catalog contains pre-curated, pre-licensed assets from opengameart.org.

```typescript
// In assets.json for a generated game:
{
  "sprites": [
    { "id": "player_knight", "key": "player", "url": "sprites/knight_idle.png" },
    { "id": "enemy_slime", "key": "enemy", "url": "sprites/slime.png" }
  ],
  "audio": [
    { "id": "sfx_hit", "key": "hit", "url": "audio/hit.wav" }
  ],
  "music": [
    { "id": "bgm_battle", "key": "bgm", "url": "music/battle_loop.ogg" }
  ]
}
```

### Asset Rules

1. **Never use external URLs**. All assets must be from the catalog.
2. **Reference assets by their `key`** in Phaser (e.g., `this.add.sprite(x, y, "player")`).
3. **Use placeholder rectangles** if an asset is missing. Never crash due to a missing asset.
4. **Keep total assets per game under 20** (sprites + audio + music combined).

---

## Game Design Constraints

### Pacing & Win Conditions (CRITICAL)
- Rounds: 60-120 seconds. Err on the side of shorter and more intense.
- Include a visible countdown timer via HUD.
- **The game MUST end**. When the timer expires or a score target is reached, the game MUST stop gameplay and show a clear winner screen.
- `checkWinCondition()` alone is NOT enough. The scene's `onUpdate` MUST check it and act on it by showing a game-over overlay and freezing gameplay.
- After the win screen (5s), restart the round automatically (reset timer, scores, and entities).
- Escalate tension: make freeze intervals shorter, spawns faster, or hazards more frequent as the timer runs down.
- Score targets should be achievable in 60-90 seconds of active play. If the score target is too high, the timer will end the round instead.

### Player Count
- Minimum: 2 players
- Maximum: 5 players
- Game must be fun at ANY player count in that range
- If a player disconnects, the game continues (don't end on disconnect)

### Game Topics (Provided by Randomizer)

Each game receives three topic words from the randomizer: a **setting** (where it takes place), an **activity** (what players do), and a **twist** (what makes it weird). For example: "underwater basketball with magnets" or "haunted mansion dodgeball on ice". Design the game to incorporate all three topics into a fun 2D multiplayer experience.

### Difficulty
- Simple rules that can be understood in 10 seconds
- Show a brief "How to Play" overlay before starting (5 seconds)
- No complex tutorials or progression systems

### Fun Factor Checklist
Every generated game should aim for:
- [ ] Immediate, obvious feedback when you do something (hit an enemy, collect an item)
- [ ] Visual and audio feedback for all actions
- [ ] Clear scoreboard showing all players
- [ ] A "comeback mechanic" so losing players have a chance
- [ ] Escalating tension (game gets harder/faster over time)
- [ ] Clear winner announcement at end

---

## File Naming and Metadata

### metadata.json

```json
{
  "id": "2026-02-15",
  "date": "2026-02-15",
  "title": "pirate arena with shrinking platforms",
  "description": "A 2D multiplayer game: pirate arena with shrinking platforms",
  "playerCount": { "min": 2, "max": 5 },
  "controls": "Left stick to move, A to attack, B to dodge",
  "howToPlay": "Battle other pirates on shrinking platforms. Last pirate standing wins!",
  "seed": "2026-02-15-0",
  "topics": {
    "seed": "2026-02-15-0",
    "setting": "pirate ship",
    "activity": "arena battle",
    "twist": "with shrinking platforms"
  },
  "assets": {
    "sprites": [],
    "audio": [],
    "music": []
  }
}
```

---

## Validation Checklist (Post-Generation)

Before a game is deployed, it must pass ALL of these checks:

1. **TypeScript compilation**: `tsc --noEmit` on both client and server files
2. **Imports valid**: Only imports from `@sdr/shared`, `@sdr/engine`, `phaser`, `bitecs`, `colyseus`
3. **Extends BaseScene**: Client file exports a default class extending BaseScene
4. **Required methods implemented**: `entities`, `onUpdate`, `checkWinCondition`
5. **No external URLs**: No fetch() calls, no external image/audio URLs
6. **Uses InputManager**: Input read through the unified input system, not raw Phaser input
7. **Uses bitECS 0.4**: Entities managed through createWorld/addEntity/query/observe pattern (NOT defineQuery/enterQuery/exitQuery)
8. **Frame-rate independent**: All movement uses `dt` parameter
9. **Resolution correct**: No hardcoded sizes other than 1280x800
10. **Metadata complete**: All fields in metadata.json are filled in
