// Tauri commands for the Steam Deck Randomizer loader

/// Fetch the list of available games from the server
pub fn fetch_games() -> String {
    // TODO: HTTP request to game server
    String::from("[]")
}

/// Download a specific game's assets
pub fn download_game(_game_date: &str) -> Result<String, String> {
    // TODO: Download game files from server
    Ok(String::from("downloaded"))
}

/// Get the local games directory path
pub fn get_games_dir() -> String {
    // TODO: Return platform-specific games directory
    String::from("./games")
}
