# Steam Deck Randomizer: Server Deployment Guide

This document explains how to deploy the game server (`@sdr/server`) to a Linux VPS (tested on Linode/Ubuntu). The server handles both the REST API for game discovery and the WebSocket multiplayer rooms. Generated games are compiled JS bundles that the server loads dynamically at runtime.

## Prerequisites

- Node.js 20+ (LTS recommended)
- pnpm 9+
- Git
- A server with at least 1GB RAM

## Repository Setup

```bash
git clone <repo-url> /opt/sdr
cd /opt/sdr
pnpm install
```

## Build

Build all packages. The server compiles from TypeScript to `packages/server/dist/`.

```bash
pnpm build
```

Only the server package needs to be built for deployment. If you only want to rebuild the server:

```bash
pnpm --filter @sdr/server build
```

## Directory Structure

```
/opt/sdr/
  packages/
    server/dist/       # Compiled server (runs from here)
    shared/src/        # Shared types (used at build time only)
    engine/src/        # Engine code (bundled into client games at generation time)
    generator/src/     # Game generator (runs as cronjob, not on the server)
  games/               # Generated game bundles (created by generator)
    2026-02-15/
      client/game.js   # Browser ESM bundle (self-contained, includes Phaser+bitECS)
      server/room.js   # Node.js ESM module (loaded dynamically by server)
      assets/           # Downloaded game assets (PNGs, audio)
      metadata.json     # Game metadata
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SDR_PORT` or `PORT` | `2567` | HTTP + WebSocket port |
| `SDR_GAMES_DIR` | `./games` (relative to cwd) | Absolute path to the games directory |
| `SDR_CORS_ORIGINS` | `http://localhost:1420,http://localhost:5173,http://localhost:3000` | Comma-separated allowed CORS origins |

For production, set `SDR_GAMES_DIR` to an absolute path and `SDR_CORS_ORIGINS` to your actual frontend domain(s).

## Running the Server

### Direct

```bash
cd /opt/sdr
SDR_GAMES_DIR=/opt/sdr/games SDR_PORT=2567 node packages/server/dist/index.js
```

### With PM2 (recommended)

```bash
npm install -g pm2

# Create ecosystem file
cat > /opt/sdr/ecosystem.config.cjs << 'EOF'
module.exports = {
  apps: [{
    name: "sdr-server",
    script: "packages/server/dist/index.js",
    cwd: "/opt/sdr",
    env: {
      NODE_ENV: "production",
      SDR_PORT: 2567,
      SDR_GAMES_DIR: "/opt/sdr/games",
      SDR_CORS_ORIGINS: "https://yourdomain.com"
    },
    max_memory_restart: "500M",
    log_date_format: "YYYY-MM-DD HH:mm:ss"
  }]
};
EOF

pm2 start ecosystem.config.cjs
pm2 save
pm2 startup  # Follow the printed command to enable on boot
```

### With systemd

```bash
cat > /etc/systemd/system/sdr-server.service << 'EOF'
[Unit]
Description=Steam Deck Randomizer Game Server
After=network.target

[Service]
Type=simple
User=sdr
WorkingDirectory=/opt/sdr
ExecStart=/usr/bin/node packages/server/dist/index.js
Environment=NODE_ENV=production
Environment=SDR_PORT=2567
Environment=SDR_GAMES_DIR=/opt/sdr/games
Environment=SDR_CORS_ORIGINS=https://yourdomain.com
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable sdr-server
systemctl start sdr-server
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check (returns `{ status, gamesDir, uptime }`) |
| GET | `/api/games` | List all games (newest first) |
| GET | `/api/games/current` | Today's game metadata |
| GET | `/api/games/:date` | Game by date (YYYY-MM-DD) |
| GET | `/games/<date>/**` | Static files (client JS bundles, assets) |

WebSocket rooms connect via Colyseus client on the same port. Room name is `"game"` with options `{ gameDate: "YYYY-MM-DD" }`.

## How Generated Games Work

The server does NOT contain game logic. Each generated game is a pair of JS bundles:

1. **`client/game.js`**: Self-contained browser ESM bundle. Includes Phaser 3, bitECS, and the engine. Exports a `launch(containerId)` function. The loader app (or any HTML page) imports this module to run the game.

2. **`server/room.js`**: Node.js ESM module. Default-exports a `GeneratedRoomLogic` object that the server's `GameRoom` loads via `RoomFactory`. This module is loaded dynamically via `import()` when a client joins a room.

### GeneratedRoomLogic Interface

All generated server room modules implement this contract:

```typescript
interface RoomContext {
  state: GameState;                                     // Colyseus-synced state
  broadcast(type: string, data: unknown): void;         // Send to all clients
  send(sessionId: string, type: string, data: unknown): void; // Send to one client
  elapsedTime: number;                                  // ms since room creation
}

interface GeneratedRoomLogic {
  onInit?: (ctx: RoomContext) => void;
  onUpdate: (dt: number, ctx: RoomContext) => void;
  onPlayerInput?: (sessionId: string, input: InputData, ctx: RoomContext) => void;
  onPlayerAction: (sessionId: string, action: string, data: unknown, ctx: RoomContext) => void;
  onPlayerJoin?: (sessionId: string, ctx: RoomContext) => void;
  onPlayerLeave?: (sessionId: string, ctx: RoomContext) => void;
  checkWinCondition: (ctx: RoomContext) => string | null;
}
```

### ECS Data Flow

The server is game-type agnostic. ECS component data flows through two channels:

1. **Colyseus state sync** (automatic): `ctx.state.customData` is a `MapSchema<string>` that Colyseus synchronizes to all clients. Games store arbitrary JSON-serialized data here via `setCustom`/`getCustom`. Good for authoritative state that all clients need continuously.

2. **Message broadcasting** (explicit): `ctx.broadcast(type, data)` sends a one-shot message to all clients. Games use this for entity spawn/destroy events, ECS snapshots, and any data that doesn't fit the key-value state model. The client listens via `room.onMessage(type, callback)`.

Convention for ECS messages (not enforced, but recommended):
- `"ecs:sync"` with `{ entities: [...] }` for full state snapshots
- `"ecs:spawn"` with entity data for new entities
- `"ecs:destroy"` with `{ id }` for removed entities
- Any custom message type the game defines

## Deploying a New Game

Games are deployed by the generator cronjob. The process is:

1. Generator runs (`pnpm generate` or via cron)
2. Claude API generates game code
3. Code is validated (TypeScript check + asset validation)
4. Game is compiled with esbuild into JS bundles
5. Bundles are written to `games/YYYY-MM-DD/`
6. Generator commits and pushes to git

On the server, pull the new game:

```bash
cd /opt/sdr
git pull origin main
# No server restart needed. RoomFactory loads games dynamically on first join.
```

The server caches loaded room logic per game date. If you need to force-reload a game (e.g., after fixing a bug in a generated game):

```bash
# Restart the server to clear the cache
pm2 restart sdr-server
# or
systemctl restart sdr-server
```

## Nightly Cronjob Setup

To generate a new game every night, add a cron entry on the generation machine (can be the same server or a different one):

```bash
# Requires ANTHROPIC_API_KEY in the environment
crontab -e
```

```cron
0 3 * * * cd /opt/sdr && ANTHROPIC_API_KEY=sk-ant-... pnpm generate >> /var/log/sdr-generate.log 2>&1
```

The generator:
1. Picks 3 random topic words (setting + activity + twist, seeded by date)
2. Calls Claude API to generate client scene + server room
3. Runs TypeScript validation (up to 3 retries on errors)
4. Validates asset manifest against client code
5. Compiles with esbuild
6. Commits and pushes to git

## Reverse Proxy (nginx)

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:2567;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

WebSocket upgrade headers are required for Colyseus rooms to work through the proxy.

## Troubleshooting

**Server won't start**: Check `SDR_GAMES_DIR` exists. The server creates a `games/` directory relative to cwd if not configured. Run `node -e "console.log(process.cwd())"` from the same working directory to verify.

**Game room fails to load**: Check the server logs for `Failed to load room for YYYY-MM-DD`. The room.js file must be a valid ESM module with a default export. Verify it exists at `$SDR_GAMES_DIR/YYYY-MM-DD/server/room.js`.

**CORS errors**: Set `SDR_CORS_ORIGINS` to include your frontend's origin (with protocol, e.g., `https://yourdomain.com`). Multiple origins are comma-separated.

**Health check**: `curl http://localhost:2567/api/health` should return `{"status":"ok","gamesDir":"...","uptime":...}`.
