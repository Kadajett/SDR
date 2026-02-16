import Phaser from "phaser";
import type { AssetManifest } from "@sdr/shared";

export class AssetLoader {
  private scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  loadFromManifest(manifest: AssetManifest, basePath: string): void {
    for (const sprite of manifest.sprites) {
      const url = `${basePath}/${sprite.url}`;
      if (sprite.frameWidth && sprite.frameHeight) {
        this.scene.load.spritesheet(sprite.key, url, {
          frameWidth: sprite.frameWidth,
          frameHeight: sprite.frameHeight,
        });
      } else {
        this.scene.load.image(sprite.key, url);
      }
    }

    for (const audio of manifest.audio) {
      this.scene.load.audio(audio.key, `${basePath}/${audio.url}`);
    }

    for (const music of manifest.music) {
      this.scene.load.audio(music.key, `${basePath}/${music.url}`);
    }
  }

  createAnimations(manifest: AssetManifest): void {
    for (const sprite of manifest.sprites) {
      if (!sprite.animations || sprite.animations.length === 0) continue;
      for (const anim of sprite.animations) {
        this.scene.anims.create({
          key: anim.key,
          frames: this.scene.anims.generateFrameNumbers(sprite.key, {
            start: anim.startFrame,
            end: anim.endFrame,
          }),
          frameRate: anim.frameRate,
          repeat: anim.repeat,
        });
      }
    }
  }
}
