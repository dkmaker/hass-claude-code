import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const DB_PATH = process.env.DOCS_DB_PATH || '/opt/mcp-server/data/docs-search.db';

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return db;
}

export function initDb(): void {
  if (db) return;

  mkdirSync(dirname(DB_PATH), { recursive: true });

  db = new Database(DB_PATH);
  sqliteVec.load(db);
  db.defaultSafeIntegers(false);

  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path TEXT NOT NULL,
      doc_set TEXT NOT NULL DEFAULT 'hass-developer',
      content_hash TEXT NOT NULL,
      title TEXT,
      last_indexed_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(doc_set, file_path)
    );

    CREATE TABLE IF NOT EXISTS chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
      section_heading TEXT,
      chunk_text TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_file TEXT NOT NULL,
      target_file TEXT NOT NULL,
      link_text TEXT,
      section TEXT
    );
  `);

  // sqlite-vec virtual table
  try {
    db.exec(`
      CREATE VIRTUAL TABLE chunk_embeddings USING vec0(
        chunk_id INTEGER PRIMARY KEY,
        embedding FLOAT[384]
      );
    `);
  } catch (e: any) {
    if (!e.message.includes('already exists')) throw e;
  }

  // FTS5 virtual table
  try {
    db.exec(`
      CREATE VIRTUAL TABLE chunks_fts USING fts5(
        chunk_text, content='chunks', content_rowid='id'
      );
    `);
  } catch (e: any) {
    if (!e.message.includes('already exists')) throw e;
  }

  // FTS sync triggers
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS chunks_ai AFTER INSERT ON chunks BEGIN
      INSERT INTO chunks_fts(rowid, chunk_text) VALUES (new.id, new.chunk_text);
    END;

    CREATE TRIGGER IF NOT EXISTS chunks_ad AFTER DELETE ON chunks BEGIN
      INSERT INTO chunks_fts(chunks_fts, rowid, chunk_text) VALUES ('delete', old.id, old.chunk_text);
    END;

    CREATE TRIGGER IF NOT EXISTS chunks_au AFTER UPDATE ON chunks BEGIN
      INSERT INTO chunks_fts(chunks_fts, rowid, chunk_text) VALUES ('delete', old.id, old.chunk_text);
      INSERT INTO chunks_fts(rowid, chunk_text) VALUES (new.id, new.chunk_text);
    END;
  `);

  console.error('Database initialized at', DB_PATH);
}
