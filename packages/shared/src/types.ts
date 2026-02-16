export interface GameTopics {
  seed: string;
  setting: string;
  activity: string;
  twist: string;
}

export interface GameMetadata {
  id: string;
  date: string;
  title: string;
  description: string;
  playerCount: { min: number; max: number };
  controls: string;
  howToPlay: string;
  seed: string;
  topics: GameTopics;
  assets: AssetManifest;
}

export interface AssetManifest {
  sprites: AssetEntry[];
  audio: AssetEntry[];
  music: AssetEntry[];
}

export interface AssetEntry {
  id: string;
  url: string;
  key: string;
  license: string;
}

export interface PlayerState {
  id: string;
  sessionId: string;
  name: string;
  x?: number;
  y?: number;
  score?: number;
  ready: boolean;
  connected: boolean;
  customData: Record<string, unknown>;
}

export interface Vec2 {
  x: number;
  y: number;
}

export interface EntityDef {
  sprite: string;
  physics: "dynamic" | "static" | "none";
  health?: number;
  speed?: number;
  effect?: string;
}

export type GamePhase = "lobby" | "playing" | "finished";
