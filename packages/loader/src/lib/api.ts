import type { GameMetadata } from "@sdr/shared";

export async function fetchGames(): Promise<GameMetadata[]> {
  const res = await fetch("/api/games");
  const data = await res.json();
  return data.games ?? [];
}

export async function fetchCurrentGame(): Promise<GameMetadata | null> {
  const res = await fetch("/api/games/current");
  const data = await res.json();
  return data.game ?? null;
}

export async function fetchGame(date: string): Promise<GameMetadata | null> {
  const res = await fetch(`/api/games/${date}`);
  if (!res.ok) return null;
  const data = await res.json();
  return data.game ?? null;
}
