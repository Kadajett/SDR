import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { SCHEMA_SQL } from "./schema.js";

let instance: Database.Database | null = null;

export function getDatabase(dataDir: string): Database.Database {
  if (instance) return instance;

  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  const dbPath = join(dataDir, "catalog.db");
  instance = new Database(dbPath);
  instance.pragma("journal_mode = WAL");
  instance.pragma("foreign_keys = ON");
  instance.exec(SCHEMA_SQL);

  return instance;
}

export function closeDatabase(): void {
  if (instance) {
    instance.close();
    instance = null;
  }
}
