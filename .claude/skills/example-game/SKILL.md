---
name: example-game
description: >
  Reference implementation of a generated game using the SDR engine, bitECS 0.4, Phaser 3,
  and Steam Deck controls. This example demonstrates library usage patterns and controller
  integration, NOT a game template. Generated games can be any genre, theme, or style.
  Trigger: "example game", "reference game", "how to write a game", "game patterns".
---

# Example Game: Grassland Gem Rush

This is a **reference implementation** demonstrating correct usage of:
- bitECS 0.4 (components, queries, observers, systems)
- Phaser 3 (scenes, game objects, rendering)
- InputManager (gamepad + keyboard dual-input)
- HUD (scores, timer, player list)
- BaseScene (extension pattern, required methods)
- Server room logic (authoritative state, win conditions)

**IMPORTANT**: This example demonstrates library usage and controller integration patterns.
It is NOT the game code template itself. Generated games will vary wildly in genre, theme,
mechanics, and style. The patterns shown here (ECS setup, input handling, render sync,
system ordering) apply to ALL generated games regardless of type.

## Source Files

- Client: `packages/generator/src/examples/client/game.ts`
- Server: `packages/generator/src/examples/server/room.ts`
- Metadata: `packages/generator/src/examples/metadata.json`

## Key Patterns Demonstrated

### 1. Component Design (bitECS 0.4 SoA)

Components are plain objects with array properties. Entity data is accessed by entity ID index:

```typescript
const Position = { x: [] as number[], y: [] as number[] };
const Velocity = { dx: [] as number[], dy: [] as number[] };
const Visual = { color: [] as number[], width: [] as number[], height: [] as number[] };
const Solid = {};  // Tag component (no data)
```

### 2. addComponent Signature (bitECS 0.4)

**CRITICAL**: bitECS 0.4 uses `addComponent(world, eid, Component)`, NOT `addComponent(world, Component, eid)`:

```typescript
const eid = addEntity(world);
addComponent(world, eid, Position);  // world, entity, component
addComponent(world, eid, Velocity);
addComponent(world, eid, Visual);
```

### 3. Queries (bitECS 0.4)

bitECS 0.4 uses `query(world, [...])` directly. There is NO `defineQuery`:

```typescript
// CORRECT (0.4):
for (const eid of query(world, [Position, Velocity])) { ... }

// WRONG (old API):
const q = defineQuery([Position, Velocity]);
for (const eid of q(world)) { ... }
```

### 4. Observers for Lifecycle (bitECS 0.4)

Instead of `enterQuery`/`exitQuery`, use `observe` + `onAdd`/`onRemove`:

```typescript
// Create Phaser GameObjects when entities gain Position + Visual
observe(world, onAdd(Position, Visual), (eid: number) => {
  const rect = scene.add.rectangle(
    Position.x[eid], Position.y[eid],
    Visual.width[eid], Visual.height[eid],
    Visual.color[eid],
  );
  gameObjects.set(eid, rect);
});

// Destroy Phaser GameObjects when entities lose Position or Visual
observe(world, onRemove(Position, Visual), (eid: number) => {
  gameObjects.get(eid)?.destroy();
  gameObjects.delete(eid);
});
```

### 5. Separating ECS Data from Phaser GameObjects

bitECS components must be serializable data (numbers, strings). Phaser GameObjects
are tracked in a separate Map, keyed by entity ID:

```typescript
const gameObjects = new Map<number, Phaser.GameObjects.Rectangle>();

// In render system:
function renderSystem(world) {
  for (const eid of query(world, [Position, Visual])) {
    const obj = gameObjects.get(eid);
    if (obj) {
      obj.x = Position.x[eid];
      obj.y = Position.y[eid];
    }
  }
}
```

### 6. System Ordering

Systems run in a deterministic order every frame:

```typescript
onUpdate(dt, players) {
  inputSystem(world, input, localPlayerEid, speed);  // 1. Read input
  movementSystem(world, dt);                          // 2. Apply physics
  boundsSystem(world);                                // 3. Enforce bounds
  solidCollisionSystem(world);                        // 4. Resolve collisions
  collectionSystem(world);                            // 5. Game logic
  renderSystem(world);                                // 6. Sync to display
}
```

### 7. Input with Deadzone

```typescript
const DEADZONE = 0.15;
let dx = Math.abs(input.x) > DEADZONE ? input.x : 0;
let dy = Math.abs(input.y) > DEADZONE ? input.y : 0;

// Normalize diagonal movement
const mag = Math.sqrt(dx * dx + dy * dy);
if (mag > 1) { dx /= mag; dy /= mag; }
```

### 8. Frame-Rate Independent Movement

```typescript
Position.x[eid] += Velocity.dx[eid] * dt;  // dt is in seconds
```

### 9. Using Primitives (No Sprites)

When sprites aren't loaded, use Phaser rectangles as stand-ins:

```typescript
const rect = scene.add.rectangle(x, y, width, height, 0xff4444);
```

This pattern lets generated games work without any asset dependencies.

### 10. Server Room Pattern

Server rooms export a `GeneratedRoomLogic` object with three methods:
- `onUpdate(dt, state)`: Tick logic (timer, collisions, spawning)
- `onPlayerAction(sessionId, action, data)`: Discrete player events
- `checkWinCondition(state)`: Returns winner sessionId or null
