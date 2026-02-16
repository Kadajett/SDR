import Phaser from "phaser";
import type { AssetManifest } from "@sdr/shared";

export class AssetLoader {
  private scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  loadFromManifest(manifest: AssetManifest, basePath: string): void {
    for (const sprite of manifest.sprites) {
      this.scene.load.image(sprite.key, `${basePath}/${sprite.url}`);
    }

    for (const audio of manifest.audio) {
      this.scene.load.audio(audio.key, `${basePath}/${audio.url}`);
    }

    for (const music of manifest.music) {
      this.scene.load.audio(music.key, `${basePath}/${music.url}`);
    }
  }
}
