---
name: steamdeck-controls
description: >
  Steam Deck controller mapping for Phaser 3 HTML5 games. Covers W3C Gamepad API standard mapping,
  Phaser 3 gamepad integration, Steam Deck button layout, dual-input (keyboard+gamepad) support,
  and best practices for Steam Deck-optimized controls. Trigger: "steamdeck controls", "gamepad input",
  "controller mapping", "phaser gamepad", "steam deck phaser".
---

# Steam Deck Controller Mapping for Phaser 3

Ensure every generated game works with Steam Deck controls out of the box. The Steam Deck exposes its controller as a standard XInput (Xbox-layout) gamepad via the W3C Gamepad API in browsers.

## Steam Deck Physical Layout

```
         [L1/LB]   [R1/RB]          Buttons 4, 5
         [L2/LT]   [R2/RT]          Buttons 6, 7 (analog 0.0-1.0)

[L4] [L5]                   [R4] [R5]   (back grip buttons, NOT in standard mapping)

         ┌─────────────────┐
    LS   │  [View] [Menu]  │   RS       Buttons 8, 9
   (10)  │     [Steam]     │  (11)      Button 16
         │                 │
  D-pad  │                 │  [Y] (3)
 12-15   │     Screen      │ [X] [B]    2, 1
         │   (Touchscreen) │  [A] (0)
         │                 │
         └─────────────────┘

  [Left Trackpad]    [Right Trackpad]    (mapped as mouse or additional axes)
```

## W3C Standard Gamepad Button Index Mapping

The Steam Deck presents as a standard gamepad. These indices are guaranteed:

| Index | Button | Phaser Property | Use In Games |
|-------|--------|-----------------|-------------|
| 0 | A (bottom) | `gamepad.A` | Primary action (jump, select, confirm) |
| 1 | B (right) | `gamepad.B` | Secondary action (cancel, back, dodge) |
| 2 | X (left) | `gamepad.X` | Tertiary action (use item, interact) |
| 3 | Y (top) | `gamepad.Y` | Quaternary action (inventory, special) |
| 4 | LB / L1 | `gamepad.L1` | Left bumper (cycle left, previous) |
| 5 | RB / R1 | `gamepad.R1` | Right bumper (cycle right, next) |
| 6 | LT / L2 | `gamepad.L2` | Left trigger (aim, brake) - analog 0.0-1.0 |
| 7 | RT / R2 | `gamepad.R2` | Right trigger (shoot, accelerate) - analog 0.0-1.0 |
| 8 | View/Back | N/A (index) | Pause menu, scoreboard |
| 9 | Menu/Start | N/A (index) | Start game, open menu |
| 10 | Left Stick Press | N/A (index) | Sprint, lock-on |
| 11 | Right Stick Press | N/A (index) | Zoom, camera reset |
| 12 | D-pad Up | `gamepad.up` | Menu navigate up |
| 13 | D-pad Down | `gamepad.down` | Menu navigate down |
| 14 | D-pad Left | `gamepad.left` | Menu navigate left |
| 15 | D-pad Right | `gamepad.right` | Menu navigate right |
| 16 | Steam/Home | N/A | System button (do not use) |

## Axes Mapping

| Index | Axis | Phaser Property | Range |
|-------|------|-----------------|-------|
| axes[0] | Left Stick X | `gamepad.leftStick.x` | -1.0 (left) to 1.0 (right) |
| axes[1] | Left Stick Y | `gamepad.leftStick.y` | -1.0 (up) to 1.0 (down) |
| axes[2] | Right Stick X | `gamepad.rightStick.x` | -1.0 (left) to 1.0 (right) |
| axes[3] | Right Stick Y | `gamepad.rightStick.y` | -1.0 (up) to 1.0 (down) |

**IMPORTANT**: Y-axis is inverted from screen coordinates. Up on the stick = negative value.

## Steam Deck Specifics

### What IS available via Gamepad API in browser:
- All 17 standard buttons (indices 0-16)
- 4 axes (2 analog sticks)
- D-pad as buttons (not axes)
- Triggers as analog buttons (0.0-1.0)

### What is NOT available via standard Gamepad API:
- Back grip buttons (L4, L5, R4, R5) - only available via Steam Input remapping
- Trackpads - can be mapped to mouse via Steam Input, not to gamepad buttons
- Gyroscope/accelerometer - not exposed to browser Gamepad API
- Touchscreen - use standard DOM touch events, not gamepad

### Steam Input Remapping
Users can remap back grips and trackpads via Steam Input overlay. Do NOT rely on these for core gameplay. Treat them as optional convenience bindings only.

---

## Phaser 3 Gamepad Integration

### Enable Gamepad Input in Config

```typescript
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 1280,
  height: 800,
  input: {
    gamepad: true,    // REQUIRED: enable gamepad support
  },
  // ... rest of config
};
```

### Detect Gamepad Connection

```typescript
class GameScene extends Phaser.Scene {
  private pad: Phaser.Input.Gamepad.Gamepad | null = null;

  create(): void {
    if (this.input.gamepad) {
      // If already connected
      if (this.input.gamepad.total > 0) {
        this.pad = this.input.gamepad.getPad(0);
      }

      // Listen for new connections
      this.input.gamepad.once(
        "connected",
        (pad: Phaser.Input.Gamepad.Gamepad) => {
          this.pad = pad;
        }
      );
    }
  }
}
```

### Read Input in Update Loop

```typescript
update(time: number, delta: number): void {
  if (!this.pad) return;

  // Analog sticks (apply deadzone)
  const DEADZONE = 0.15;
  const lx = Math.abs(this.pad.leftStick.x) > DEADZONE ? this.pad.leftStick.x : 0;
  const ly = Math.abs(this.pad.leftStick.y) > DEADZONE ? this.pad.leftStick.y : 0;

  // Face buttons (boolean)
  if (this.pad.A) { /* primary action */ }
  if (this.pad.B) { /* secondary action */ }
  if (this.pad.X) { /* tertiary action */ }
  if (this.pad.Y) { /* quaternary action */ }

  // Shoulder buttons
  if (this.pad.L1) { /* left bumper */ }
  if (this.pad.R1) { /* right bumper */ }

  // Triggers (analog 0.0 to 1.0)
  const leftTrigger = this.pad.L2;   // float
  const rightTrigger = this.pad.R2;  // float

  // D-pad (boolean)
  if (this.pad.up) { /* d-pad up */ }
  if (this.pad.down) { /* d-pad down */ }
  if (this.pad.left) { /* d-pad left */ }
  if (this.pad.right) { /* d-pad right */ }

  // Buttons by index (for View/Menu/Stick press)
  if (this.pad.isButtonDown(8)) { /* View/Back */ }
  if (this.pad.isButtonDown(9)) { /* Menu/Start */ }
  if (this.pad.isButtonDown(10)) { /* Left Stick Press */ }
  if (this.pad.isButtonDown(11)) { /* Right Stick Press */ }
}
```

---

## Dual-Input System (Keyboard + Gamepad)

Every game MUST support both keyboard and gamepad simultaneously. Use this unified input pattern:

### InputState Interface

```typescript
interface InputState {
  moveX: number;          // -1.0 to 1.0 (horizontal movement)
  moveY: number;          // -1.0 to 1.0 (vertical movement)
  aimX: number;           // -1.0 to 1.0 (aim/look horizontal)
  aimY: number;           // -1.0 to 1.0 (aim/look vertical)
  action1: boolean;       // A / Space - primary action
  action2: boolean;       // B / Shift - secondary action
  action3: boolean;       // X / E - tertiary action
  action4: boolean;       // Y / Q - quaternary action
  bumperLeft: boolean;    // LB / Tab
  bumperRight: boolean;   // RB / R
  triggerLeft: number;    // LT / -- (0.0 to 1.0)
  triggerRight: number;   // RT / -- (0.0 to 1.0)
  pause: boolean;         // Start / Escape
}
```

### Default Control Scheme

| Action | Gamepad | Keyboard (Player 1) | Description |
|--------|---------|---------------------|-------------|
| Move | Left Stick | WASD | Character movement |
| Aim/Look | Right Stick | Mouse (if available) | Camera or aim direction |
| Primary Action | A | Space | Jump, select, confirm |
| Secondary Action | B | Shift / Right-Click | Dodge, cancel, back |
| Tertiary Action | X | E | Interact, use item |
| Quaternary Action | Y | Q | Inventory, special ability |
| Bumper Left | LB | Tab | Cycle left, previous weapon |
| Bumper Right | RB | R | Cycle right, next weapon |
| Trigger Left | LT | (none) | Aim down sights, brake |
| Trigger Right | RT | Left-Click | Shoot, accelerate |
| Pause | Menu/Start | Escape | Pause menu |
| D-pad | D-pad | Arrow keys | Menu navigation, quick select |

### Unified Input Reader Implementation

```typescript
const DEADZONE = 0.15;

function readInput(
  scene: Phaser.Scene,
  pad: Phaser.Input.Gamepad.Gamepad | null,
  cursors: Phaser.Types.Input.Keyboard.CursorKeys | null,
  keys: Record<string, Phaser.Input.Keyboard.Key>
): InputState {
  const state: InputState = {
    moveX: 0, moveY: 0,
    aimX: 0, aimY: 0,
    action1: false, action2: false,
    action3: false, action4: false,
    bumperLeft: false, bumperRight: false,
    triggerLeft: 0, triggerRight: 0,
    pause: false,
  };

  // Gamepad input (takes priority for analog precision)
  if (pad && pad.connected) {
    const lx = pad.leftStick.x;
    const ly = pad.leftStick.y;
    state.moveX = Math.abs(lx) > DEADZONE ? lx : 0;
    state.moveY = Math.abs(ly) > DEADZONE ? ly : 0;

    const rx = pad.rightStick.x;
    const ry = pad.rightStick.y;
    state.aimX = Math.abs(rx) > DEADZONE ? rx : 0;
    state.aimY = Math.abs(ry) > DEADZONE ? ry : 0;

    state.action1 = pad.A;
    state.action2 = pad.B;
    state.action3 = pad.X;
    state.action4 = pad.Y;
    state.bumperLeft = pad.L1;
    state.bumperRight = pad.R1;
    state.triggerLeft = pad.L2;
    state.triggerRight = pad.R2;
    state.pause = pad.isButtonDown(9);
  }

  // Keyboard input (merge, don't override)
  if (keys.w?.isDown || cursors?.up?.isDown) state.moveY = -1;
  if (keys.s?.isDown || cursors?.down?.isDown) state.moveY = 1;
  if (keys.a?.isDown || cursors?.left?.isDown) state.moveX = -1;
  if (keys.d?.isDown || cursors?.right?.isDown) state.moveX = 1;

  if (keys.space?.isDown) state.action1 = true;
  if (keys.shift?.isDown) state.action2 = true;
  if (keys.e?.isDown) state.action3 = true;
  if (keys.q?.isDown) state.action4 = true;
  if (keys.tab?.isDown) state.bumperLeft = true;
  if (keys.r?.isDown) state.bumperRight = true;
  if (keys.esc?.isDown) state.pause = true;

  return state;
}
```

---

## Required Patterns for All Generated Games

### 1. Always Apply Deadzone to Analog Sticks

```typescript
// BAD: Raw stick values drift when idle
const x = gamepad.leftStick.x;

// GOOD: Apply deadzone
const DEADZONE = 0.15;
const x = Math.abs(gamepad.leftStick.x) > DEADZONE ? gamepad.leftStick.x : 0;
```

### 2. Always Handle Missing Gamepad Gracefully

```typescript
// BAD: Assumes gamepad exists
const x = this.pad!.leftStick.x;

// GOOD: Null-safe access
const x = this.pad?.leftStick.x ?? 0;
```

### 3. Always Support Both Input Methods

Every game must be fully playable with EITHER keyboard OR gamepad. Never require both. Never require ONLY gamepad.

### 4. Use Delta Time for All Movement

```typescript
// BAD: Frame-rate dependent
player.x += speed;

// GOOD: Frame-rate independent
player.x += speed * dt;
```

### 5. Screen Resolution

Always target **1280x800** (Steam Deck native resolution). Use `Phaser.Scale.FIT` with `CENTER_BOTH` to handle different aspect ratios.

```typescript
scale: {
  mode: Phaser.Scale.FIT,
  autoCenter: Phaser.Scale.CENTER_BOTH,
  width: 1280,
  height: 800,
}
```

### 6. Readable UI at Steam Deck Size

The Steam Deck has a 7" 1280x800 screen. Minimum text size should be 18px. Buttons and interactive elements should have at least 48x48px touch targets. Use high-contrast colors.

### 7. Normalize Diagonal Movement

```typescript
// Prevent faster diagonal movement
let dx = state.moveX;
let dy = state.moveY;
const mag = Math.sqrt(dx * dx + dy * dy);
if (mag > 1) {
  dx /= mag;
  dy /= mag;
}
```

### 8. Button Prompts

When showing button prompts in-game, detect whether the last input was from gamepad or keyboard and show the appropriate icon/text:

```typescript
// Track last input device
let lastDevice: "keyboard" | "gamepad" = "keyboard";

// In update:
if (pad && (Math.abs(pad.leftStick.x) > 0.1 || pad.A || pad.B)) {
  lastDevice = "gamepad";
}
if (anyKeyDown) {
  lastDevice = "keyboard";
}

// In UI:
const actionLabel = lastDevice === "gamepad" ? "[A]" : "[SPACE]";
```

---

## Common Pitfalls

1. **Do not use button index 16 (Steam/Home)** - This is the system button. It opens the Steam overlay.
2. **Do not require back grip buttons (L4/L5/R4/R5)** - They are not exposed to the standard Gamepad API.
3. **Do not require trackpad input** - It may be mapped to mouse, or disabled entirely.
4. **Do not forget the deadzone** - Steam Deck sticks have slight drift. Always use >= 0.15 deadzone.
5. **Do not assume gamepad is always connected** - The browser may not report it until the user presses a button.
6. **Do not use `gamepad.vibration`** - Steam Deck supports haptics but browser API support is inconsistent on Linux.
7. **Do not hard-code button indices** - Use Phaser's named properties (`.A`, `.B`, `.L1`, etc.) when available.
