import { getDb } from './db.js';
import { embed, isEnabled as embeddingsEnabled } from './embeddings.js';
import type { SearchResult } from './types.js';

export async function semanticSearch(query: string, limit = 10, docSet?: string): Promise<SearchResult[]> {
  if (!embeddingsEnabled()) {
    // Fall back to keyword search when embeddings are disabled
    return keywordSearch(query, limit, docSet);
  }

  const db = getDb();
  const [queryEmbedding] = await embed([query]);

  const buffer = Buffer.from(queryEmbedding.buffer, queryEmbedding.byteOffset, queryEmbedding.byteLength);

  const knnResults = db.prepare(
    `SELECT chunk_id, distance FROM chunk_embeddings WHERE embedding MATCH ? AND k = ?`
  ).all(buffer, limit) as Array<{ chunk_id: number; distance: number }>;

  if (knnResults.length === 0) return [];

  const chunkIds = knnResults.map(r => r.chunk_id);
  const distanceMap = new Map(knnResults.map(r => [r.chunk_id, r.distance]));

  const placeholders = chunkIds.map(() => '?').join(', ');

  let sql = `
    SELECT c.id, c.chunk_text, c.section_heading, f.file_path, f.title
    FROM chunks c
    JOIN files f ON f.id = c.file_id
    WHERE c.id IN (${placeholders})`;

  const params: Array<string | number> = [...chunkIds];

  if (docSet) {
    sql += ` AND f.doc_set = ?`;
    params.push(docSet);
  }

  const rows = db.prepare(sql).all(...params) as Array<{
    id: number;
    chunk_text: string;
    section_heading: string | null;
    file_path: string;
    title: string | null;
  }>;

  return rows.map(row => ({
    chunk_text: row.chunk_text,
    section_heading: row.section_heading,
    file_path: row.file_path,
    title: row.title,
    score: distanceMap.get(row.id) ?? Infinity,
  })).sort((a, b) => a.score - b.score);
}

export async function keywordSearch(query: string, limit = 10, docSet?: string): Promise<SearchResult[]> {
  const db = getDb();

  let sql = `
    SELECT c.id, c.chunk_text, c.section_heading, f.file_path, f.title, fts.rank
    FROM chunks_fts fts
    JOIN chunks c ON c.id = fts.rowid
    JOIN files f ON f.id = c.file_id
    WHERE chunks_fts MATCH ?`;

  const params: Array<string | number> = [query];

  if (docSet) {
    sql += ` AND f.doc_set = ?`;
    params.push(docSet);
  }

  sql += `
    ORDER BY fts.rank
    LIMIT ?`;

  params.push(limit);

  const rows = db.prepare(sql).all(...params) as Array<{
    id: number;
    chunk_text: string;
    section_heading: string | null;
    file_path: string;
    title: string | null;
    rank: number;
  }>;

  return rows.map(row => ({
    chunk_text: row.chunk_text,
    section_heading: row.section_heading,
    file_path: row.file_path,
    title: row.title,
    score: row.rank,
  }));
}
