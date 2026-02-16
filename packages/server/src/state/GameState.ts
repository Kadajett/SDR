import { Schema, MapSchema, type } from "@colyseus/schema";

export class PlayerSchema extends Schema {
  @type("string") sessionId: string = "";
  @type("string") name: string = "";
  @type("boolean") ready: boolean = false;
  @type("boolean") connected: boolean = true;
  @type({ map: "string" }) customData = new MapSchema<string>();

  setCustom(key: string, value: unknown): void {
    this.customData.set(key, JSON.stringify(value));
  }

  getCustom<T>(key: string): T | undefined {
    const raw = this.customData.get(key);
    if (raw === undefined) return undefined;
    return JSON.parse(raw) as T;
  }

  getCustomOr<T>(key: string, defaultValue: T): T {
    const raw = this.customData.get(key);
    if (raw === undefined) return defaultValue;
    return JSON.parse(raw) as T;
  }
}

export class GameState extends Schema {
  @type({ map: PlayerSchema }) players = new MapSchema<PlayerSchema>();
  @type("string") phase: string = "lobby";
  @type("number") timer: number = 0;
  @type({ map: "string" }) customData = new MapSchema<string>();

  addPlayer(sessionId: string, name: string): void {
    const player = new PlayerSchema();
    player.sessionId = sessionId;
    player.name = name;
    this.players.set(sessionId, player);
  }

  removePlayer(sessionId: string): void {
    this.players.delete(sessionId);
  }

  setPlayerReady(sessionId: string, ready: boolean): void {
    const player = this.players.get(sessionId);
    if (player) {
      player.ready = ready;
    }
  }

  getPlayers(): PlayerSchema[] {
    return Array.from(this.players.values());
  }

  // --- Custom data helpers for game-level state ---

  setCustom(key: string, value: unknown): void {
    this.customData.set(key, JSON.stringify(value));
  }

  getCustom<T>(key: string): T | undefined {
    const raw = this.customData.get(key);
    if (raw === undefined) return undefined;
    return JSON.parse(raw) as T;
  }

  getCustomOr<T>(key: string, defaultValue: T): T {
    const raw = this.customData.get(key);
    if (raw === undefined) return defaultValue;
    return JSON.parse(raw) as T;
  }

  // --- Player custom data shortcuts ---

  setPlayerCustom(sessionId: string, key: string, value: unknown): void {
    const player = this.players.get(sessionId);
    if (player) {
      player.setCustom(key, value);
    }
  }

  getPlayerCustom<T>(sessionId: string, key: string): T | undefined {
    const player = this.players.get(sessionId);
    if (!player) return undefined;
    return player.getCustom<T>(key);
  }
}
