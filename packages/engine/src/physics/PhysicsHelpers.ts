import Phaser from "phaser";
import type { Vec2 } from "@sdr/shared";

export class PhysicsHelpers {
  static moveToward(
    body: Phaser.Physics.Arcade.Body,
    target: Vec2,
    speed: number
  ): void {
    const angle = Phaser.Math.Angle.Between(body.x, body.y, target.x, target.y);
    body.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
  }

  static applyInputVelocity(
    body: Phaser.Physics.Arcade.Body,
    input: { x: number; y: number },
    speed: number
  ): void {
    body.setVelocity(input.x * speed, input.y * speed);
  }

  static wrapAround(
    sprite: Phaser.GameObjects.Sprite,
    bounds: { width: number; height: number }
  ): void {
    if (sprite.x < 0) sprite.x = bounds.width;
    if (sprite.x > bounds.width) sprite.x = 0;
    if (sprite.y < 0) sprite.y = bounds.height;
    if (sprite.y > bounds.height) sprite.y = 0;
  }

  static distanceBetween(a: Vec2, b: Vec2): number {
    return Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y);
  }
}
