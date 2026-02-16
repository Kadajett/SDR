import type { GameMetadata } from "@sdr/shared";
import GameCard from "./GameCard.js";

interface GameListProps {
  games: GameMetadata[];
  loading: boolean;
  onSelect: (game: GameMetadata) => void;
}

export default function GameList(props: GameListProps) {
  return (
    <div>
      <h2>Available Games</h2>
      {props.loading ? (
        <p>Loading games...</p>
      ) : props.games.length === 0 ? (
        <p>No games available yet. Check back after tonight's generation!</p>
      ) : (
        <div>
          {props.games.map((game) => (
            <GameCard game={game} onSelect={() => props.onSelect(game)} />
          ))}
        </div>
      )}
    </div>
  );
}
