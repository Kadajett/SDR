# Steam Deck Randomizer

A system that generates a new multiplayer game every night using AI. Each game runs on a shared engine (Phaser 3 + bitECS + Colyseus), so the generator only produces gameplay logic. A loader app on each Steam Deck fetches and plays games from the server.

## How It Works

```
                        Nightly Cronjob
                              |
                    +---------v----------+
                    |   @sdr/generator   |
                    | Claude API call    |
                    | TypeScript + asset |
                    | validation         |
                    | esbuild compile    |
                    +---------+----------+
                              |
                     git push to games/
                              |
              +---------------v----------------+
              |         @sdr/server            |
              | Colyseus rooms + REST API      |
              | Loads generated room.js at     |
              | runtime via dynamic import()   |
              +---+-------------------+--------+
                  |                   |
          WebSocket (play)      HTTP (browse)
                  |                   |
              +---v-------------------v--------+
              |         @sdr/loader            |
              | SolidJS frontend + Tauri shell |
              | Imports client game.js module  |
              +--------------------------------+
```

Each generated game is a pair of self-contained JS bundles:
- **client/game.js**: Browser ESM bundle containing the Phaser scene, bitECS world, and all engine code. Exports a `launch()` function.
- **server/room.js**: Node.js ESM module exporting a `GeneratedRoomLogic` object that the server's GameRoom loads dynamically.

## Monorepo Structure

| Package | Description |
|---------|-------------|
| `@sdr/shared` | Types, constants, protocol definitions |
| `@sdr/engine` | Phaser 3 game engine wrapper with multiplayer hooks, input management, HUD, asset loading |
| `@sdr/server` | Colyseus multiplayer server with REST API for game discovery |
| `@sdr/loader` | Tauri 2.0 + SolidJS app for browsing and playing games on Steam Deck |
| `@sdr/generator` | Nightly game generation: Claude API, validation, esbuild compilation |
| `@sdr/asset-catalog` | MCP server for crawling, analyzing, and cataloging game art assets |

## Tech Stack

- **Language**: TypeScript throughout
- **Monorepo**: pnpm workspaces
- **Game Engine**: Phaser 3.90+
- **ECS**: bitECS 0.4 (data-oriented entity component system)
- **Multiplayer**: Colyseus 0.15 (WebSocket rooms with schema sync)
- **Loader App**: Tauri 2.0 + SolidJS + Tailwind CSS v4
- **Generation**: Claude API (Sonnet), esbuild for compilation
- **Asset Catalog**: MCP server with Playwright scraper, sharp image analysis, SQLite

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 9+

### Install and Build

```bash
pnpm install
pnpm build
```

### Development

```bash
# Start the game server (port 2567)
pnpm dev:server

# Start the loader frontend (port 5173, proxies API to server)
pnpm dev:loader

# Generate a game (requires ANTHROPIC_API_KEY)
ANTHROPIC_API_KEY=sk-ant-... pnpm generate

# Typecheck all packages
pnpm typecheck
```

### Server Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SDR_PORT` | `2567` | HTTP + WebSocket port |
| `SDR_GAMES_DIR` | `./games` | Path to generated games directory |
| `SDR_CORS_ORIGINS` | `localhost:1420,5173,3000` | Allowed CORS origins |

## Game Generation Pipeline

The generator runs nightly and produces a complete game in ~60 seconds:

1. **Topic Selection**: Picks 3 random words from curated lists (168 settings x 175 activities x 158 twists = 4.6M combinations), seeded by date for reproducibility.

2. **Code Generation**: Calls Claude API with the engine API surface, bitECS patterns, and game design constraints. Produces client scene code, server room logic, asset manifest, and metadata.

3. **Validation**:
   - TypeScript compilation check (up to 3 retries with error context)
   - Asset manifest structure validation (duplicate keys, frame consistency)
   - Code/manifest cross-reference (all asset keys used in code exist in manifest)
   - Spritesheet dimension validation (frame sizes match actual image dimensions)
   - File existence check (all referenced assets are downloadable)

4. **Compilation**: esbuild bundles client code into a self-contained browser ESM module (includes Phaser, bitECS, engine) and server code into a Node.js ESM module.

5. **Deployment**: Writes to `games/YYYY-MM-DD/`, commits, and pushes to git. The server picks up new games automatically via dynamic `import()`.

## Server Architecture

The server is game-type agnostic. It provides:

- **GameRoom**: Colyseus room that loads generated logic via `RoomFactory` and routes player messages
- **RoomContext**: Gives generated game logic access to state management and client messaging
- **GameState**: Colyseus-synchronized state with flexible `customData` (JSON-serialized key-value store)
- **REST API**: `/api/games` (list), `/api/games/current` (today), `/api/games/:date` (by date), `/api/health`
- **Static serving**: `/games/<date>/**` serves client bundles and assets

### ECS Data Over the Wire

Generated games can send any data to clients through two channels:

1. **State sync** (automatic): Write to `ctx.state.customData` via `setCustom()`/`getCustom()`. Colyseus synchronizes changes to all connected clients automatically.

2. **Message broadcast** (explicit): Call `ctx.broadcast(type, data)` to push one-shot messages. Used for ECS entity snapshots, spawn/destroy events, and game-specific notifications.

```typescript
// In generated server room logic:
const roomLogic: GeneratedRoomLogic = {
  onUpdate(dt, ctx) {
    // Automatic sync via state
    ctx.state.setCustom("timer", timer);

    // Explicit broadcast for entity updates
    if (entitiesChanged) {
      ctx.broadcast("ecs:sync", { entities: entityList });
    }
  },
};
```

## Asset Pipeline

The `@sdr/asset-catalog` package is an MCP server that provides tools for:

- Crawling game art websites for free assets
- Downloading and analyzing preview images
- Detecting tile grids and animation strips via pixel analysis
- Categorizing assets (tilesheet, spritesheet, character, background, etc.)
- Searching the catalog by category, tags, dimensions, and transparency

The generator's asset manifest supports both static images and spritesheets with animation definitions. The `AssetLoader` in the engine automatically handles spritesheet loading and Phaser animation creation from manifest data.

## Deployment

See [DEPLOY.md](./DEPLOY.md) for production deployment instructions covering PM2, systemd, nginx, cronjob setup, and Kubernetes with Cloudflare Zero Trust tunnels.

## Project Commands

| Command | Description |
|---------|-------------|
| `pnpm build` | Build all packages |
| `pnpm typecheck` | TypeScript check all packages |
| `pnpm dev:server` | Start Colyseus dev server |
| `pnpm dev:loader` | Start Tauri/SolidJS dev window |
| `pnpm generate` | Run game generation |
| `pnpm clean` | Clean all build artifacts |
