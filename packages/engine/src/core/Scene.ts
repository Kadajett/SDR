import Phaser from "phaser";
import type { PlayerState, EntityDef, Vec2 } from "@sdr/shared";

export abstract class BaseScene extends Phaser.Scene {
  protected players: Map<string, PlayerState> = new Map();

  abstract entities: Record<string, EntityDef>;
  abstract onUpdate(dt: number, players: PlayerState[]): void;
  abstract checkWinCondition(players: PlayerState[]): string | null;

  onPlayerJoin(player: PlayerState): void {
    this.players.set(player.sessionId, player);
  }

  onPlayerLeave(sessionId: string): void {
    this.players.delete(sessionId);
  }

  onCollision(_a: Phaser.GameObjects.GameObject, _b: Phaser.GameObjects.GameObject): void {
    // Override in generated games
  }

  update(_time: number, delta: number): void {
    const dt = delta / 1000;
    const playerList = Array.from(this.players.values());
    this.onUpdate(dt, playerList);

    const winner = this.checkWinCondition(playerList);
    if (winner) {
      this.events.emit("game:win", winner);
    }
  }

  protected spawnEntity(key: string, position: Vec2): Phaser.GameObjects.Sprite | null {
    const def = this.entities[key];
    if (!def) return null;

    const sprite = this.add.sprite(position.x, position.y, def.sprite);

    if (def.physics !== "none") {
      this.physics.add.existing(sprite, def.physics === "static");
    }

    return sprite;
  }
}
