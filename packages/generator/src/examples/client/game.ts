/**
 * EXAMPLE GAME: Grassland Gem Rush
 *
 * This is a REFERENCE IMPLEMENTATION demonstrating how to use the engine,
 * bitECS 0.4, InputManager, HUD, and Steam Deck controls together. It is
 * NOT a game template. Generated games may be any genre, theme, or style.
 *
 * Gameplay: Players run around a tile-based map collecting gems.
 * First to 10 gems wins. Gems respawn after being collected.
 *
 * All "sprites" are colored rectangles (primitives) since actual spritesheets
 * are loaded separately by the asset pipeline.
 */

import Phaser from "phaser";
import {
  createWorld,
  addEntity,
  addComponent,
  removeEntity,
  query,
  observe,
  onAdd,
  onRemove,
} from "bitecs";
import type { PlayerState, EntityDef } from "@sdr/shared";
import { BaseScene, InputManager, HUD } from "@sdr/engine";

// ============================================================
// TILE CONSTANTS
// Represents a 32x32 grassland tileset rendered as colored rects.
// Real games will use actual tilesheets; this demonstrates the pattern.
// ============================================================

const TILE_SIZE = 32;
const MAP_COLS = 40; // 1280 / 32
const MAP_ROWS = 25; // 800 / 32

const TILE_COLORS: Record<number, number> = {
  0: 0x4a8c3f, // grass (dark)
  1: 0x5da04e, // grass (light)
  2: 0x3a7cc9, // water
  3: 0x8b7355, // dirt path
  4: 0x2d5a1e, // tree
  5: 0x6b6b6b, // cliff / rock
};

// ============================================================
// 1. COMPONENTS (bitECS 0.4 SoA format)
// ============================================================

// Position in world pixels
const Position = { x: [] as number[], y: [] as number[] };

// Velocity in pixels/sec
const Velocity = { dx: [] as number[], dy: [] as number[] };

// Visual representation (primitive color + size)
const Visual = {
  color: [] as number[],
  width: [] as number[],
  height: [] as number[],
};

// Tag: this entity is controlled by a player
const PlayerControlled = { sessionId: [] as string[] };

// Tag: this entity is a collectible gem
const Collectible = { points: [] as number[] };

// Tag: this entity is a solid obstacle
const Solid = {};

// Tag: this is a tile (not a game entity)
const Tile = {};

// ============================================================
// 2. PHASER GAMEOBJECT TRACKING
//
// bitECS components are plain data. Phaser GameObjects are managed
// separately in Maps keyed by entity ID. This keeps the ECS pure
// and avoids storing non-serializable references in components.
// ============================================================

const gameObjects = new Map<number, Phaser.GameObjects.Rectangle>();

// ============================================================
// 3. SYSTEMS (pure functions operating on the world)
// ============================================================

const DEADZONE = 0.15;

/**
 * Reads unified input and applies velocity to the local player entity.
 * Supports both gamepad (analog stick) and keyboard (WASD/arrows).
 */
function inputSystem(
  world: ReturnType<typeof createWorld>,
  input: { x: number; y: number; buttons: Record<string, boolean> },
  localPlayerEid: number,
  speed: number,
): void {
  if (localPlayerEid < 0) return;

  let dx = Math.abs(input.x) > DEADZONE ? input.x : 0;
  let dy = Math.abs(input.y) > DEADZONE ? input.y : 0;

  // Normalize diagonal movement
  const mag = Math.sqrt(dx * dx + dy * dy);
  if (mag > 1) {
    dx /= mag;
    dy /= mag;
  }

  Velocity.dx[localPlayerEid] = dx * speed;
  Velocity.dy[localPlayerEid] = dy * speed;
}

/**
 * Moves all entities with Position + Velocity. Frame-rate independent.
 */
function movementSystem(world: ReturnType<typeof createWorld>, dt: number): void {
  for (const eid of query(world, [Position, Velocity])) {
    Position.x[eid] += Velocity.dx[eid] * dt;
    Position.y[eid] += Velocity.dy[eid] * dt;
  }
}

/**
 * Keeps player entities within map bounds.
 */
function boundsSystem(world: ReturnType<typeof createWorld>): void {
  const maxX = MAP_COLS * TILE_SIZE;
  const maxY = MAP_ROWS * TILE_SIZE;

  for (const eid of query(world, [Position, Velocity, PlayerControlled, Visual])) {
    const hw = Visual.width[eid] / 2;
    const hh = Visual.height[eid] / 2;

    if (Position.x[eid] < hw) Position.x[eid] = hw;
    if (Position.x[eid] > maxX - hw) Position.x[eid] = maxX - hw;
    if (Position.y[eid] < hh) Position.y[eid] = hh;
    if (Position.y[eid] > maxY - hh) Position.y[eid] = maxY - hh;
  }
}

/**
 * Simple AABB collision between players and solid tiles.
 */
function solidCollisionSystem(world: ReturnType<typeof createWorld>): void {
  const players = query(world, [Position, Velocity, PlayerControlled, Visual]);
  const solids = query(world, [Position, Solid, Visual]);

  for (const pid of players) {
    const px = Position.x[pid];
    const py = Position.y[pid];
    const pw = Visual.width[pid] / 2;
    const ph = Visual.height[pid] / 2;

    for (const sid of solids) {
      const sx = Position.x[sid];
      const sy = Position.y[sid];
      const sw = Visual.width[sid] / 2;
      const sh = Visual.height[sid] / 2;

      const overlapX = (pw + sw) - Math.abs(px - sx);
      const overlapY = (ph + sh) - Math.abs(py - sy);

      if (overlapX > 0 && overlapY > 0) {
        if (overlapX < overlapY) {
          Position.x[pid] += px < sx ? -overlapX : overlapX;
        } else {
          Position.y[pid] += py < sy ? -overlapY : overlapY;
        }
      }
    }
  }
}

/**
 * Checks if any player overlaps a collectible gem.
 */
function collectionSystem(
  world: ReturnType<typeof createWorld>,
): Array<{ playerEid: number; gemEid: number; points: number }> {
  const collected: Array<{ playerEid: number; gemEid: number; points: number }> = [];
  const players = query(world, [Position, PlayerControlled]);
  const gems = query(world, [Position, Collectible]);
  const COLLECT_RADIUS = 20;

  for (const pid of players) {
    for (const gid of gems) {
      const dx = Position.x[pid] - Position.x[gid];
      const dy = Position.y[pid] - Position.y[gid];
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < COLLECT_RADIUS) {
        collected.push({
          playerEid: pid,
          gemEid: gid,
          points: Collectible.points[gid],
        });
      }
    }
  }

  return collected;
}

/**
 * Syncs Position component data to Phaser GameObjects for rendering.
 */
function renderSystem(world: ReturnType<typeof createWorld>): void {
  for (const eid of query(world, [Position, Visual])) {
    const obj = gameObjects.get(eid);
    if (obj) {
      obj.x = Position.x[eid];
      obj.y = Position.y[eid];
    }
  }
}

// ============================================================
// 4. MAP GENERATION
// ============================================================

/**
 * Generates a simple tile map using deterministic patterns.
 * Real games will load tilesheets; this uses colored rectangles.
 */
function generateMap(world: ReturnType<typeof createWorld>): void {
  for (let row = 0; row < MAP_ROWS; row++) {
    for (let col = 0; col < MAP_COLS; col++) {
      let tileType = 0; // default: grass dark

      // Checkerboard grass
      if ((row + col) % 2 === 0) tileType = 1;

      // Water border
      if (row < 2 || row > MAP_ROWS - 3 || col < 2 || col > MAP_COLS - 3) {
        tileType = 2;
      }

      // Dirt paths in a cross pattern
      if ((row === Math.floor(MAP_ROWS / 2) || col === Math.floor(MAP_COLS / 2))
        && tileType !== 2) {
        tileType = 3;
      }

      // Scatter trees
      if (tileType === 0 && ((row * 7 + col * 13) % 17 === 0)) {
        tileType = 4;
      }

      // Scatter rocks
      if (tileType === 1 && ((row * 11 + col * 3) % 23 === 0)) {
        tileType = 5;
      }

      const eid = addEntity(world);
      addComponent(world, eid, Position);
      addComponent(world, eid, Visual);
      addComponent(world, eid, Tile);

      Position.x[eid] = col * TILE_SIZE + TILE_SIZE / 2;
      Position.y[eid] = row * TILE_SIZE + TILE_SIZE / 2;
      Visual.color[eid] = TILE_COLORS[tileType];
      Visual.width[eid] = TILE_SIZE;
      Visual.height[eid] = TILE_SIZE;

      // Trees, rocks, and water are solid
      if (tileType === 2 || tileType === 4 || tileType === 5) {
        addComponent(world, eid, Solid);
      }
    }
  }
}

// ============================================================
// 5. ENTITY SPAWNING HELPERS
// ============================================================

const PLAYER_COLORS = [0xff4444, 0x4444ff, 0x44ff44, 0xffff44, 0xff44ff];

function spawnPlayer(
  world: ReturnType<typeof createWorld>,
  sessionId: string,
  playerIndex: number,
): number {
  const eid = addEntity(world);
  addComponent(world, eid, Position);
  addComponent(world, eid, Velocity);
  addComponent(world, eid, Visual);
  addComponent(world, eid, PlayerControlled);

  const spawnPoints = [
    { x: 640, y: 400 },
    { x: 480, y: 300 },
    { x: 800, y: 300 },
    { x: 480, y: 500 },
    { x: 800, y: 500 },
  ];
  const spawn = spawnPoints[playerIndex % spawnPoints.length];

  Position.x[eid] = spawn.x;
  Position.y[eid] = spawn.y;
  Velocity.dx[eid] = 0;
  Velocity.dy[eid] = 0;
  Visual.color[eid] = PLAYER_COLORS[playerIndex % PLAYER_COLORS.length];
  Visual.width[eid] = 24;
  Visual.height[eid] = 24;
  PlayerControlled.sessionId[eid] = sessionId;

  return eid;
}

function spawnGem(world: ReturnType<typeof createWorld>): number {
  const eid = addEntity(world);
  addComponent(world, eid, Position);
  addComponent(world, eid, Visual);
  addComponent(world, eid, Collectible);

  const minX = 3 * TILE_SIZE;
  const maxX = (MAP_COLS - 3) * TILE_SIZE;
  const minY = 3 * TILE_SIZE;
  const maxY = (MAP_ROWS - 3) * TILE_SIZE;

  Position.x[eid] = minX + Math.random() * (maxX - minX);
  Position.y[eid] = minY + Math.random() * (maxY - minY);
  Visual.color[eid] = 0xffd700; // gold
  Visual.width[eid] = 12;
  Visual.height[eid] = 12;
  Collectible.points[eid] = 1;

  return eid;
}

// ============================================================
// 6. SCENE
// ============================================================

const PLAYER_SPEED = 200;
const WIN_SCORE = 10;
const GAME_DURATION = 180; // 3 minutes
const GEM_COUNT = 8;

export default class GrasslandGemRush extends BaseScene {
  private world!: ReturnType<typeof createWorld>;
  private inputManager!: InputManager;
  private hud!: HUD;
  private localPlayerEid = -1;
  private timer = GAME_DURATION;
  private howToPlayText: Phaser.GameObjects.Text | null = null;
  private howToPlayTimer = 5;

  // REQUIRED by BaseScene: entity definitions for spawnEntity()
  entities: Record<string, EntityDef> = {
    player: { sprite: "player_rect", physics: "dynamic", speed: PLAYER_SPEED },
    gem: { sprite: "gem_rect", physics: "none" },
    tree: { sprite: "tree_rect", physics: "static" },
    rock: { sprite: "rock_rect", physics: "static" },
  };

  constructor() {
    super({ key: "GrasslandGemRush" });
  }

  create(): void {
    // Initialize ECS world
    this.world = createWorld();

    // Set up observers for creating/destroying Phaser GameObjects
    // This is the bitECS 0.4 equivalent of enterQuery/exitQuery
    observe(this.world, onAdd(Position, Visual), (eid: number) => {
      const rect = this.add.rectangle(
        Position.x[eid],
        Position.y[eid],
        Visual.width[eid],
        Visual.height[eid],
        Visual.color[eid],
      );
      // Tiles at depth 0, game entities at depth 10
      rect.setDepth(Tile === undefined || !query(this.world, [Tile]).includes(eid) ? 10 : 0);
      gameObjects.set(eid, rect);
    });

    observe(this.world, onRemove(Position, Visual), (eid: number) => {
      const obj = gameObjects.get(eid);
      if (obj) {
        obj.destroy();
        gameObjects.delete(eid);
      }
    });

    // Generate tile map with primitives
    generateMap(this.world);

    // Set up input (gamepad + keyboard)
    this.inputManager = new InputManager(this);
    this.inputManager.setup({
      w: "W",
      a: "A",
      s: "S",
      d: "D",
      space: "SPACE",
      shift: "SHIFT",
      e: "E",
      q: "Q",
      esc: "ESC",
    });

    // Set up HUD
    this.hud = new HUD(this);
    this.hud.create();

    // Spawn local player
    const localSessionId = "local-player";
    this.localPlayerEid = spawnPlayer(this.world, localSessionId, 0);

    // Register player in BaseScene's player tracking
    this.onPlayerJoin({
      id: "1", sessionId: localSessionId, name: "You",
      x: 640, y: 400, score: 0, ready: true, connected: true,
      customData: {},
    });

    // Spawn initial gems
    for (let i = 0; i < GEM_COUNT; i++) {
      spawnGem(this.world);
    }

    // "How to Play" overlay
    this.howToPlayText = this.add.text(640, 400, [
      "GRASSLAND GEM RUSH",
      "",
      "Collect golden gems!",
      "First to 10 wins!",
      "",
      "Move: Left Stick / WASD",
    ].join("\n"), {
      fontSize: "28px",
      color: "#ffffff",
      backgroundColor: "#000000aa",
      padding: { x: 32, y: 24 },
      align: "center",
    }).setOrigin(0.5).setDepth(2000).setScrollFactor(0);
  }

  // REQUIRED by BaseScene: called every frame via update()
  onUpdate(dt: number, players: PlayerState[]): void {
    // Dismiss "How to Play"
    if (this.howToPlayTimer > 0) {
      this.howToPlayTimer -= dt;
      if (this.howToPlayTimer <= 0) {
        this.howToPlayText?.destroy();
        this.howToPlayText = null;
      }
      return;
    }

    // Read input
    const input = this.inputManager.getState();

    // Run ECS systems in deterministic order
    inputSystem(this.world, input, this.localPlayerEid, PLAYER_SPEED);
    movementSystem(this.world, dt);
    boundsSystem(this.world);
    solidCollisionSystem(this.world);

    // Check gem collection
    const collected = collectionSystem(this.world);
    for (const { gemEid, points } of collected) {
      const sessionId = PlayerControlled.sessionId[this.localPlayerEid];
      const player = this.players.get(sessionId);
      if (player) {
        player.score = (player.score ?? 0) + points;
      }
      removeEntity(this.world, gemEid);
      spawnGem(this.world);
    }

    // Sync ECS positions to Phaser GameObjects
    renderSystem(this.world);

    // Update timer
    this.timer -= dt;
    if (this.timer < 0) this.timer = 0;

    // Update HUD
    const localPlayer = this.players.get("local-player");
    if (localPlayer) {
      this.hud.updateScore(localPlayer.score ?? 0);
    }
    this.hud.updateTimer(this.timer);
    this.hud.updatePlayerList(players);
  }

  // REQUIRED by BaseScene: return winner's sessionId or null
  checkWinCondition(players: PlayerState[]): string | null {
    const winner = players.find((p) => (p.score ?? 0) >= WIN_SCORE);
    if (winner) return winner.sessionId;

    if (this.timer <= 0 && players.length > 0) {
      const sorted = [...players].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
      return sorted[0].sessionId;
    }

    return null;
  }
}
