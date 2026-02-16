import { createSignal, onMount } from "solid-js";
import GameList from "./components/GameList.js";
import NowPlaying from "./components/NowPlaying.js";
import type { GameMetadata } from "@sdr/shared";
import { fetchGames } from "./lib/api.js";

export default function App() {
  const [games, setGames] = createSignal<GameMetadata[]>([]);
  const [activeGame, setActiveGame] = createSignal<GameMetadata | null>(null);
  const [loading, setLoading] = createSignal(true);

  onMount(async () => {
    try {
      setGames(await fetchGames());
    } catch (err) {
      console.error("Failed to fetch games:", err);
    } finally {
      setLoading(false);
    }
  });

  return (
    <div>
      <header>
        <h1>Steam Deck Randomizer</h1>
      </header>
      <main>
        {activeGame() ? (
          <NowPlaying
            game={activeGame()!}
            onExit={() => setActiveGame(null)}
          />
        ) : (
          <GameList
            games={games()}
            loading={loading()}
            onSelect={(game) => setActiveGame(game)}
          />
        )}
      </main>
    </div>
  );
}
