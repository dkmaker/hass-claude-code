import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { semanticSearch, keywordSearch } from './search.js';
import { getDb } from './db.js';
import type { SearchResult } from './types.js';

const DOCS_BASE_PATH = process.env.DOCS_PATH || '/opt/docs';

export async function searchDocs(args: {
  query: string;
  doc_set?: string;
  limit?: number;
  mode?: 'semantic' | 'keyword' | 'auto';
}): Promise<SearchResult[]> {
  const limit = args.limit || 10;
  const mode = args.mode || 'auto';

  if (mode === 'keyword') {
    return keywordSearch(args.query, limit, args.doc_set);
  }

  if (mode === 'semantic') {
    return semanticSearch(args.query, limit, args.doc_set);
  }

  // Auto mode: try semantic first, fall back to keyword
  const results = await semanticSearch(args.query, limit, args.doc_set);
  if (results.length > 0) return results;

  return keywordSearch(args.query, limit, args.doc_set);
}

export async function readDoc(args: {
  file_path: string;
  doc_set?: string;
}): Promise<string> {
  // Determine which doc set to look in
  const docSets = args.doc_set ? [args.doc_set] : ['hass-developer', 'hass-user'];

  for (const docSet of docSets) {
    const fullPath = join(DOCS_BASE_PATH, docSet, args.file_path);
    if (existsSync(fullPath)) {
      return readFile(fullPath, 'utf-8');
    }
  }

  throw new Error(`Document not found: ${args.file_path} (searched in: ${docSets.join(', ')})`);
}

export function getDocStats(): {
  total_files: number;
  total_chunks: number;
  total_links: number;
  doc_sets: Array<{ name: string; files: number; chunks: number }>;
} {
  const db = getDb();

  const total_files = (db.prepare('SELECT COUNT(*) as count FROM files').get() as { count: number }).count;
  const total_chunks = (db.prepare('SELECT COUNT(*) as count FROM chunks').get() as { count: number }).count;
  const total_links = (db.prepare('SELECT COUNT(*) as count FROM links').get() as { count: number }).count;

  const doc_sets = db.prepare(`
    SELECT f.doc_set as name,
           COUNT(DISTINCT f.id) as files,
           COUNT(c.id) as chunks
    FROM files f
    LEFT JOIN chunks c ON c.file_id = f.id
    GROUP BY f.doc_set
  `).all() as Array<{ name: string; files: number; chunks: number }>;

  return { total_files, total_chunks, total_links, doc_sets };
}
