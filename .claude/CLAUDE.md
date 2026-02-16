# Steam Deck Randomizer

## Project Overview

A system where a nightly cronjob calls Claude to generate a new multiplayer game. Each game uses a shared engine (Phaser 3 + Colyseus + bitECS) so Claude only generates gameplay logic, not infrastructure. A Tauri loader app on each Steam Deck fetches and plays games from the Linode server.

## Monorepo Structure

- `packages/shared` - Shared types, constants, protocol definitions (`@sdr/shared`)
- `packages/engine` - Phaser 3 game engine wrapper with multiplayer hooks (`@sdr/engine`)
- `packages/server` - Colyseus multiplayer server (`@sdr/server`)
- `packages/loader` - Tauri 2.0 + SolidJS app for Steam Deck (`@sdr/loader`)
- `packages/generator` - Nightly Claude API game generation script (`@sdr/generator`)
- `games/` - Generated games directory (gitignored)

## Tech Stack

- TypeScript throughout, pnpm workspace monorepo
- Phaser 3.90+ (game engine), bitECS 0.4+ (entity component system)
- Colyseus (multiplayer server + client)
- Tauri 2.0 (loader app), SolidJS + Tailwind CSS v4 (loader frontend)
- Node.js server on Linode

## Skills (colocated in `.claude/skills/`)

All skills live in this repo so the cronjob server has access:

- `phaser-gamedev` - Phaser 3 game development patterns, scene lifecycle, physics, sprites
- `bitecs` - bitECS v0.4 entity component system: worlds, entities, components, queries, systems
- `steamdeck-controls` - Steam Deck controller mapping, W3C Gamepad API, dual-input (keyboard+gamepad)
- `game-generation-guidelines` - Coding constraints and templates for nightly game generation
- `example-game` - Reference implementation demonstrating library and controller usage patterns

## Example Game (Reference Implementation)

The example game at `packages/generator/src/examples/` ("Grassland Gem Rush") is a **reference
implementation** demonstrating correct usage of the engine libraries and controller integration.
It is NOT the game code template itself. Generated games will vary wildly in genre, theme,
mechanics, and style.

What the example demonstrates:
- bitECS 0.4 API patterns (components, queries, observers, systems)
- Phaser 3 integration (scenes, game objects, rendering)
- InputManager usage (gamepad + keyboard dual-input with deadzone)
- ECS-to-Phaser bridge (GameObjects in Maps, not in ECS components)
- System ordering (input -> physics -> bounds -> collision -> logic -> render)
- Server room pattern (authoritative state, win conditions)

What varies per generated game:
- Genre, theme, mechanics, art style
- Number and type of entities
- Game rules and win conditions
- System composition and ordering

## Conventions

- Package names use `@sdr/` scope
- Base classes in engine are prefixed `Base` (BaseGame, BaseScene)
- Generated games extend engine base classes and use bitECS for entity management
- All packages export from `src/index.ts`
- Build output goes to `dist/`
- Workspace packages export source types (`"types": "./src/index.ts"`) for zero-build typecheck
- No tsconfig project references; pnpm workspace resolution handles cross-package imports
- Use `uv`/`uvx` instead of `python3`/`pip` for any Python tooling needs

## Commands

- `pnpm build` - Build all packages
- `pnpm dev:server` - Start Colyseus dev server
- `pnpm dev:loader` - Start Tauri dev window
- `pnpm generate` - Run game generation
- `pnpm typecheck` - TypeScript check all packages

## Game Generation Architecture

Each night, the generator:
1. Picks a random genre + theme combo
2. Calls Claude API with the engine API surface and game-generation-guidelines skill
3. Claude generates `client/game.ts` (extends BaseScene, uses bitECS) and `server/room.ts`
4. Validator runs `tsc --noEmit` with up to 3 retries on errors
5. Assets are downloaded from the catalog
6. Game is deployed to `games/YYYY-MM-DD/`
7. Server loads the new room definition
