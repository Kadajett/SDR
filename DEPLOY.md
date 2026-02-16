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

## Nightly Game Generation: Agent Setup

The nightly generation can run two ways: as a simple `pnpm generate` script (which calls the Claude API directly via the Anthropic SDK), or as a fully autonomous Claude Code agent that has access to MCP tools, skills, and can self-heal when generation fails. This section covers both approaches.

### Option A: Simple Script (pnpm generate)

The built-in generator script calls the Anthropic API directly (no Claude Code CLI needed). It handles topic randomization, code generation, TypeScript validation with retry, asset validation, esbuild compilation, and git push.

```bash
crontab -e
```

```cron
0 3 * * * cd /opt/sdr && ANTHROPIC_API_KEY=sk-ant-... pnpm generate >> /var/log/sdr-generate.log 2>&1
```

**Required environment:**
- `ANTHROPIC_API_KEY`: Your Anthropic API key (the generator uses `claude-sonnet-4-5-20250929`)
- Git configured with push access to the remote (SSH key or credential helper)
- Node.js 20+, pnpm 9+ installed

This is the simpler option. The generator has built-in retry logic (up to 3 attempts with error context fed back to Claude) and will exit non-zero on failure. No MCP servers or skills are needed since the system prompt and engine API docs are embedded directly in `packages/generator/src/prompts/system.ts`.

### Option B: Claude Code Agent (Full Autonomy)

For more powerful generation with access to the asset catalog, browser automation, and self-healing capabilities, run Claude Code CLI as the cronjob agent. This gives the agent access to MCP tools (asset catalog search, image analysis, Playwright for asset crawling) and project skills (bitECS patterns, Phaser gamedev, Steam Deck controls).

#### 1. Install Claude Code CLI

```bash
npm install -g @anthropic-ai/claude-code
```

Verify the installation:

```bash
claude --version
```

#### 2. Authenticate

Claude Code needs an Anthropic API key. Set it in the environment where the cronjob will run:

```bash
# Option 1: Export in the user's shell profile (~/.bashrc, ~/.zshrc)
export ANTHROPIC_API_KEY="sk-ant-your-key-here"

# Option 2: Pass directly in the cron entry (see below)
```

#### 3. Configure MCP Servers

The project has a `.mcp.json` at the repo root that defines MCP servers. Claude Code reads this automatically when run from the project directory. The relevant MCP servers are:

**asset-catalog** (required for asset-aware generation):
- Provides tools: `crawl_search_page`, `crawl_asset_detail`, `download_preview`, `analyze_image`, `catalog_search`, `catalog_stats`, `get_crawl_status`
- Provides resources: asset catalog stats, recent crawls
- Uses SQLite database at `./data/asset-catalog/catalog.db`
- Requires: `better-sqlite3`, `sharp`, `tsx`

**playwright** (optional, for crawling new asset sources):
- Provides browser automation for crawling opengameart.org and similar sites
- Only needed if the agent should discover new assets, not for routine generation

The `.mcp.json` file is already in the repo:

```json
{
  "mcpServers": {
    "asset-catalog": {
      "type": "stdio",
      "command": "npx",
      "args": ["tsx", "./packages/asset-catalog/src/index.ts"],
      "env": {
        "SDR_CATALOG_DATA_DIR": "./data/asset-catalog",
        "SDR_CRAWL_DELAY_MS": "10000"
      }
    },
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest", "--caps=devtools"]
    }
  }
}
```

If running on a headless server without a display, you can remove the `playwright` entry or install Playwright's headless browser dependencies:

```bash
npx playwright install --with-deps chromium
```

#### 4. Project Skills (Automatic)

Claude Code automatically loads skills from `.claude/skills/` when running in the project directory. These skills provide domain expertise for game generation:

| Skill | Purpose |
|-------|---------|
| `phaser-gamedev` | Phaser 3 scene lifecycle, physics, sprites, tilemaps |
| `bitecs` | bitECS 0.4 entity component system patterns |
| `steamdeck-controls` | Steam Deck gamepad mapping, W3C Gamepad API |
| `game-generation-guidelines` | Full coding constraints and templates for generated games |
| `example-game` | Reference implementation (Grassland Gem Rush) showing correct engine usage |

No manual configuration needed. The agent reads these automatically.

#### 5. Project Instructions (CLAUDE.md)

The project has a `.claude/CLAUDE.md` that tells the agent about the monorepo structure, conventions, commands, and generation architecture. This is loaded automatically. The agent will also read the root `CLAUDE.md` from the user's home directory if present.

#### 6. Git Configuration

The agent needs to commit and push generated games. Configure git on the server:

```bash
# Set identity for commits
git config --global user.name "SDR Generator"
git config --global user.email "sdr-bot@yourdomain.com"

# SSH key for push access (recommended)
ssh-keygen -t ed25519 -f ~/.ssh/sdr_deploy -N ""
# Add the public key as a deploy key on your GitHub repo (with write access)

# Or use a GitHub personal access token
git config --global credential.helper store
echo "https://oauth2:ghp_your_token@github.com" > ~/.git-credentials
```

#### 7. The Cronjob

The agent runs with `--dangerously-skip-permissions` so it can execute tools (bash commands, file writes, MCP calls) without interactive approval prompts. The `-p` flag sends a prompt directly instead of opening interactive mode.

```bash
crontab -e
```

```cron
# Run at 3 AM daily. Agent generates a game with full tool access.
0 3 * * * cd /opt/sdr && ANTHROPIC_API_KEY=sk-ant-... claude --dangerously-skip-permissions -p "Generate tonight's game. Follow these steps:

1. Run 'pnpm generate' to generate, validate, compile, and publish today's game.
2. If the generation fails, read the error output carefully.
3. If it's a TypeScript error in the generated code, the script has built-in retry (3 attempts). Let it finish.
4. If it's an infrastructure error (missing dependency, network issue, git push failure), diagnose and fix it, then re-run 'pnpm generate'.
5. If the game was generated but assets are missing or broken, use the asset-catalog MCP tools (catalog_search, analyze_image) to find suitable replacements, update the assets.json, re-download, and re-compile.
6. After successful generation, verify the game exists at games/YYYY-MM-DD/ with client/game.js, server/room.js, and metadata.json.
7. If everything looks good, confirm the git push went through.

Do not modify any code outside of the games/ directory. Do not modify engine, server, shared, or generator package code." >> /var/log/sdr-agent.log 2>&1
```

**Flags explained:**
- `--dangerously-skip-permissions`: Allows all tool calls without interactive approval. Required for unattended operation.
- `-p "..."`: Sends the prompt directly (non-interactive mode). The agent processes the prompt, executes the task, and exits.

#### 8. Alternative: Wrapper Script

For cleaner cron entries and better logging, use a wrapper script:

```bash
cat > /opt/sdr/scripts/nightly-generate.sh << 'SCRIPT'
#!/bin/bash
set -euo pipefail

LOG_DIR="/var/log/sdr"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/generate-$(date +%Y-%m-%d).log"

cd /opt/sdr

echo "=== Generation started at $(date) ===" >> "$LOG_FILE"

# Source environment (API key, PATH for node/pnpm)
source /etc/sdr/env.sh

# Option A: Simple script
# pnpm generate >> "$LOG_FILE" 2>&1

# Option B: Claude Code agent with full tool access
claude --dangerously-skip-permissions -p "$(cat <<'PROMPT'
Generate tonight's game using 'pnpm generate'. If it fails with infrastructure
errors (not TypeScript errors, which are retried automatically), diagnose and fix
the issue, then retry. Use asset-catalog MCP tools if assets need replacement.
Verify the final output exists in games/YYYY-MM-DD/ with all required files.
Do not modify code outside the games/ directory.
PROMPT
)" >> "$LOG_FILE" 2>&1

EXIT_CODE=$?
echo "=== Generation finished at $(date) with exit code $EXIT_CODE ===" >> "$LOG_FILE"

# Optional: notify on failure
if [ $EXIT_CODE -ne 0 ]; then
  echo "SDR generation failed on $(date). Check $LOG_FILE" | \
    mail -s "SDR Generation Failed" admin@yourdomain.com 2>/dev/null || true
fi

exit $EXIT_CODE
SCRIPT

chmod +x /opt/sdr/scripts/nightly-generate.sh
```

Environment file:

```bash
cat > /etc/sdr/env.sh << 'ENV'
export ANTHROPIC_API_KEY="sk-ant-your-key-here"
export PATH="/usr/local/bin:/usr/bin:$HOME/.local/bin:$PATH"
export NODE_ENV="production"
ENV

chmod 600 /etc/sdr/env.sh
```

Cron entry:

```cron
0 3 * * * /opt/sdr/scripts/nightly-generate.sh
```

#### 9. What the Agent Has Access To

Summary of everything available to the Claude Code agent when it runs from `/opt/sdr`:

| Resource | Location | Purpose |
|----------|----------|---------|
| Project instructions | `.claude/CLAUDE.md` | Monorepo structure, conventions, commands |
| Skills (5) | `.claude/skills/` | Phaser, bitECS, controls, generation guidelines, example game |
| MCP: asset-catalog | `.mcp.json` | Search/analyze game art assets in the catalog DB |
| MCP: playwright | `.mcp.json` | Browser automation for crawling new asset sources |
| Generator script | `packages/generator/` | Claude API call, validation, compilation, git push |
| System prompt | `packages/generator/src/prompts/system.ts` | Full engine API docs embedded in the generation prompt |
| Asset catalog DB | `data/asset-catalog/catalog.db` | SQLite database of crawled game art |
| Example game | `packages/generator/src/examples/` | Reference implementation (Grassland Gem Rush) |
| Topic randomizer | `packages/generator/src/randomizer/` | 168 settings x 175 activities x 158 twists |

#### 10. Monitoring and Failure Recovery

**Log rotation:**

```bash
cat > /etc/logrotate.d/sdr << 'EOF'
/var/log/sdr/*.log {
    daily
    rotate 30
    compress
    missingok
    notifempty
}
EOF
```

**Manual re-generation** (if the nightly run failed):

```bash
# Simple script
cd /opt/sdr && ANTHROPIC_API_KEY=sk-ant-... pnpm generate

# Or with the agent (interactive, so you can watch)
cd /opt/sdr && claude -p "Run pnpm generate and fix any issues"

# Or fully interactive
cd /opt/sdr && claude
# Then type: "Generate today's game"
```

**Check if today's game exists:**

```bash
curl http://localhost:2567/api/games/current
# Returns metadata JSON or 404 if no game for today
```

**Force re-generation for a specific date** (the generator always uses today's date, so you can only re-generate today's game by deleting it first):

```bash
rm -rf /opt/sdr/games/$(date +%Y-%m-%d)
cd /opt/sdr && pnpm generate
```

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

## Kubernetes (Local) with Cloudflare Zero Trust

This section covers running the server on a local machine using Kubernetes (via kubectl) and exposing it to the internet through Cloudflare Zero Trust tunnels. No public IP or port forwarding required.

### Prerequisites

- Docker or Podman (for building the container image)
- kubectl with a local cluster (minikube, k3s, kind, or Docker Desktop's built-in k8s)
- A Cloudflare account with a domain (free tier works)
- `cloudflared` CLI installed

### Container Image

Create a Dockerfile at the repo root:

```dockerfile
# Dockerfile
FROM node:20-slim AS build
WORKDIR /app
RUN corepack enable pnpm

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/engine/package.json packages/engine/
COPY packages/server/package.json packages/server/

RUN pnpm install --frozen-lockfile

COPY packages/shared/ packages/shared/
COPY packages/engine/ packages/engine/
COPY packages/server/ packages/server/

RUN pnpm --filter @sdr/server build

FROM node:20-slim
WORKDIR /app
RUN corepack enable pnpm

COPY --from=build /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=build /app/packages/shared/ packages/shared/
COPY --from=build /app/packages/engine/ packages/engine/
COPY --from=build /app/packages/server/ packages/server/
COPY --from=build /app/node_modules/ node_modules/
COPY --from=build /app/packages/server/node_modules/ packages/server/node_modules/

EXPOSE 2567
CMD ["node", "packages/server/dist/index.js"]
```

Build and load into your local cluster:

```bash
docker build -t sdr-server:latest .

# For minikube:
minikube image load sdr-server:latest

# For kind:
kind load docker-image sdr-server:latest

# For k3s (import from docker):
docker save sdr-server:latest | sudo k3s ctr images import -

# For Docker Desktop k8s: the image is already available
```

### Kubernetes Manifests

Create `k8s/` directory with the following files:

**k8s/namespace.yaml**
```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: sdr
```

**k8s/games-pvc.yaml**

Persistent volume for the games directory. Games survive pod restarts.

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: sdr-games
  namespace: sdr
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 5Gi
```

**k8s/configmap.yaml**
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: sdr-config
  namespace: sdr
data:
  SDR_PORT: "2567"
  SDR_GAMES_DIR: "/data/games"
  SDR_CORS_ORIGINS: "https://sdr.yourdomain.com"
  NODE_ENV: "production"
```

**k8s/secret.yaml**

Only needed if running the generator on the same cluster.

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: sdr-secrets
  namespace: sdr
type: Opaque
stringData:
  ANTHROPIC_API_KEY: "sk-ant-your-key-here"
```

**k8s/deployment.yaml**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: sdr-server
  namespace: sdr
spec:
  replicas: 1  # Single replica: Colyseus rooms are stateful
  selector:
    matchLabels:
      app: sdr-server
  template:
    metadata:
      labels:
        app: sdr-server
    spec:
      containers:
        - name: sdr-server
          image: sdr-server:latest
          imagePullPolicy: Never  # Local image, not from a registry
          ports:
            - containerPort: 2567
              name: http-ws
          envFrom:
            - configMapRef:
                name: sdr-config
          volumeMounts:
            - name: games
              mountPath: /data/games
          readinessProbe:
            httpGet:
              path: /api/health
              port: 2567
            initialDelaySeconds: 5
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: /api/health
              port: 2567
            initialDelaySeconds: 10
            periodSeconds: 30
          resources:
            requests:
              memory: "256Mi"
              cpu: "250m"
            limits:
              memory: "512Mi"
              cpu: "1000m"
      volumes:
        - name: games
          persistentVolumeClaim:
            claimName: sdr-games
```

**k8s/service.yaml**
```yaml
apiVersion: v1
kind: Service
metadata:
  name: sdr-server
  namespace: sdr
spec:
  selector:
    app: sdr-server
  ports:
    - port: 2567
      targetPort: 2567
      name: http-ws
```

**k8s/generator-cronjob.yaml**

Optional: run the generator as a Kubernetes CronJob instead of a system cron.

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: sdr-generator
  namespace: sdr
spec:
  schedule: "0 3 * * *"  # 3 AM daily
  concurrencyPolicy: Forbid
  jobTemplate:
    spec:
      activeDeadlineSeconds: 600
      template:
        spec:
          restartPolicy: Never
          containers:
            - name: generator
              image: sdr-server:latest  # Same image, different command
              command: ["pnpm", "generate"]
              workingDir: /app
              envFrom:
                - configMapRef:
                    name: sdr-config
                - secretRef:
                    name: sdr-secrets
              volumeMounts:
                - name: games
                  mountPath: /data/games
          volumes:
            - name: games
              persistentVolumeClaim:
                claimName: sdr-games
```

### Apply Manifests

```bash
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/games-pvc.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secret.yaml      # Only if using the generator CronJob
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/generator-cronjob.yaml  # Optional

# Verify
kubectl -n sdr get pods
kubectl -n sdr logs deployment/sdr-server
```

### Cloudflare Zero Trust Tunnel

Cloudflare Tunnels expose your local Kubernetes service to the internet without opening ports or needing a public IP. Traffic flows: `Internet -> Cloudflare edge -> cloudflared (in cluster) -> sdr-server Service`.

#### 1. Create the tunnel

```bash
cloudflared tunnel login  # Opens browser, authorizes your Cloudflare account
cloudflared tunnel create sdr-tunnel
```

This outputs a tunnel ID (UUID) and creates a credentials file at `~/.cloudflared/<TUNNEL_ID>.json`.

#### 2. Create the credentials Secret

```bash
kubectl -n sdr create secret generic cloudflared-creds \
  --from-file=credentials.json=$HOME/.cloudflared/<TUNNEL_ID>.json
```

#### 3. Configure DNS

Point your subdomain to the tunnel:

```bash
cloudflared tunnel route dns sdr-tunnel sdr.yourdomain.com
```

#### 4. Deploy cloudflared in the cluster

**k8s/cloudflared.yaml**
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: cloudflared-config
  namespace: sdr
data:
  config.yaml: |
    tunnel: <TUNNEL_ID>
    credentials-file: /etc/cloudflared/credentials.json
    no-autoupdate: true
    ingress:
      - hostname: sdr.yourdomain.com
        service: http://sdr-server:2567
        originRequest:
          noTLSVerify: true
          httpHostHeader: sdr.yourdomain.com
      - service: http_status:404
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: cloudflared
  namespace: sdr
spec:
  replicas: 1
  selector:
    matchLabels:
      app: cloudflared
  template:
    metadata:
      labels:
        app: cloudflared
    spec:
      containers:
        - name: cloudflared
          image: cloudflare/cloudflared:latest
          args: ["tunnel", "--config", "/etc/cloudflared/config.yaml", "run"]
          volumeMounts:
            - name: config
              mountPath: /etc/cloudflared/config.yaml
              subPath: config.yaml
              readOnly: true
            - name: creds
              mountPath: /etc/cloudflared/credentials.json
              subPath: credentials.json
              readOnly: true
          resources:
            requests:
              memory: "64Mi"
              cpu: "50m"
            limits:
              memory: "128Mi"
              cpu: "200m"
      volumes:
        - name: config
          configMap:
            name: cloudflared-config
        - name: creds
          secret:
            secretName: cloudflared-creds
```

```bash
kubectl apply -f k8s/cloudflared.yaml
```

#### 5. WebSocket Support

Cloudflare Tunnels support WebSockets natively. No extra configuration needed for Colyseus connections. The Cloudflare edge automatically detects the `Upgrade: websocket` header and maintains the persistent connection through the tunnel.

Make sure `SDR_CORS_ORIGINS` in the ConfigMap includes `https://sdr.yourdomain.com`.

#### 6. Verify

```bash
# Check tunnel is connected
kubectl -n sdr logs deployment/cloudflared

# Test from the internet
curl https://sdr.yourdomain.com/api/health
```

### Zero Trust Access Policies (Optional)

If you want to restrict who can access the game server (e.g., only your household):

1. Go to Cloudflare Zero Trust dashboard > Access > Applications
2. Create an application for `sdr.yourdomain.com`
3. Add a policy: allow by email, IP range, or device posture
4. Clients will see a Cloudflare login page before reaching the server

For the Steam Deck loader app, you can either:
- Exempt the `/api/` and `/games/` paths from the access policy (since the Tauri app handles auth separately)
- Use a Cloudflare Service Token for machine-to-machine auth (set `CF-Access-Client-Id` and `CF-Access-Client-Secret` headers in the loader)

### Deploying New Games to the Cluster

When the generator runs outside the cluster (e.g., on your dev machine):

```bash
# Generate the game locally
ANTHROPIC_API_KEY=sk-ant-... pnpm generate

# Copy the game to the pod's persistent volume
kubectl -n sdr cp games/2026-02-15 \
  $(kubectl -n sdr get pod -l app=sdr-server -o name | head -1):/data/games/2026-02-15

# No restart needed, the server loads games dynamically
```

When the generator runs as a CronJob inside the cluster, it writes directly to the shared PVC and no copy is needed.

### Updating the Server

```bash
# Rebuild the image
docker build -t sdr-server:latest .

# Load into cluster (use the command for your cluster type)
minikube image load sdr-server:latest

# Restart the deployment to pick up the new image
kubectl -n sdr rollout restart deployment/sdr-server
kubectl -n sdr rollout status deployment/sdr-server
```

## Troubleshooting

**Server won't start**: Check `SDR_GAMES_DIR` exists. The server creates a `games/` directory relative to cwd if not configured. Run `node -e "console.log(process.cwd())"` from the same working directory to verify.

**Game room fails to load**: Check the server logs for `Failed to load room for YYYY-MM-DD`. The room.js file must be a valid ESM module with a default export. Verify it exists at `$SDR_GAMES_DIR/YYYY-MM-DD/server/room.js`.

**CORS errors**: Set `SDR_CORS_ORIGINS` to include your frontend's origin (with protocol, e.g., `https://yourdomain.com`). Multiple origins are comma-separated.

**Health check**: `curl http://localhost:2567/api/health` should return `{"status":"ok","gamesDir":"...","uptime":...}`.
