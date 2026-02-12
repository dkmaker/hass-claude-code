import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { glob } from 'glob';
import { join, relative, dirname, resolve } from 'node:path';
import { getDb } from './db.js';
import { embed, isEnabled as embeddingsEnabled } from './embeddings.js';

let indexingInProgress = false;

export function isIndexing(): boolean {
  return indexingInProgress;
}

export function computeHash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

export function extractTitle(content: string): string | null {
  const match = content.match(/^# (.+)$/m);
  return match ? match[1].trim() : null;
}

export function chunkByHeadings(
  content: string,
): Array<{ heading: string | null; text: string; position: number }> {
  const chunks: Array<{ heading: string | null; text: string; position: number }> = [];
  const lines = content.split('\n');

  let currentHeading: string | null = null;
  let currentLines: string[] = [];
  let position = 0;

  for (const line of lines) {
    if (line.startsWith('## ')) {
      const text = currentLines.join('\n').trim();
      if (text.length > 0) {
        chunks.push({ heading: currentHeading, text, position });
        position++;
      }
      currentHeading = line.slice(3).trim();
      currentLines = [line];
    } else {
      currentLines.push(line);
    }
  }

  const text = currentLines.join('\n').trim();
  if (text.length > 0) {
    chunks.push({ heading: currentHeading, text, position });
  }

  return chunks;
}

export function extractLinks(
  content: string,
  sourceFile: string,
  basePath: string,
): Array<{ target_file: string; link_text: string; section: string | null }> {
  const links: Array<{ target_file: string; link_text: string; section: string | null }> = [];
  const lines = content.split('\n');
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;

  let currentSection: string | null = null;

  for (const line of lines) {
    if (line.startsWith('## ')) {
      currentSection = line.slice(3).trim();
    }

    let match;
    while ((match = linkRegex.exec(line)) !== null) {
      const linkText = match[1];
      const url = match[2];

      if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('#')) {
        continue;
      }

      const urlPath = url.split('#')[0];
      if (!urlPath) continue;

      if (!urlPath.endsWith('.md') && urlPath.includes('.')) {
        continue;
      }

      const sourceDir = dirname(sourceFile);
      const absoluteTarget = resolve(join(basePath, sourceDir), urlPath);
      const targetRelative = relative(basePath, absoluteTarget);

      links.push({
        target_file: targetRelative,
        link_text: linkText,
        section: currentSection,
      });
    }
  }

  return links;
}

export async function indexDocSet(docSetPath: string, docSetName: string): Promise<void> {
  indexingInProgress = true;
  console.error(`[indexer] Starting indexing for doc set: ${docSetName} at ${docSetPath}`);

  try {
    const db = getDb();
    const basePath = resolve(docSetPath);

    const files = await glob('**/*.md', {
      cwd: basePath,
      ignore: ['**/CLAUDE.md', '**/CHANGELOG.md'],
    });

    console.error(`[indexer] Found ${files.length} markdown files`);

    const existingFiles = db
      .prepare('SELECT id, file_path, content_hash FROM files WHERE doc_set = ?')
      .all(docSetName) as Array<{ id: number; file_path: string; content_hash: string }>;

    const existingMap = new Map(existingFiles.map((f) => [f.file_path, f]));
    const currentFilePaths = new Set(files);

    // Delete records for files that no longer exist on disk
    const deletedFiles = existingFiles.filter((f) => !currentFilePaths.has(f.file_path));
    if (deletedFiles.length > 0) {
      console.error(`[indexer] Removing ${deletedFiles.length} deleted files from index`);
      const deleteTransaction = db.transaction(() => {
        for (const file of deletedFiles) {
          db.prepare(
            'DELETE FROM chunk_embeddings WHERE chunk_id IN (SELECT id FROM chunks WHERE file_id = ?)',
          ).run(file.id);
          db.prepare('DELETE FROM links WHERE source_file = ?').run(file.file_path);
          db.prepare('DELETE FROM files WHERE id = ?').run(file.id);
        }
      });
      deleteTransaction();
    }

    let processedCount = 0;
    let skippedCount = 0;

    for (const filePath of files) {
      const absolutePath = join(basePath, filePath);
      const content = await readFile(absolutePath, 'utf-8');
      const hash = computeHash(content);

      const existing = existingMap.get(filePath);
      if (existing && existing.content_hash === hash) {
        skippedCount++;
        continue;
      }

      const title = extractTitle(content);
      const chunks = chunkByHeadings(content);
      const links = extractLinks(content, filePath, basePath);

      // Generate embeddings only when enabled
      const chunkTexts = chunks.map((c) => c.text);
      const embeddings: Float32Array[] = [];
      if (embeddingsEnabled()) {
        for (let i = 0; i < chunkTexts.length; i += 32) {
          const batch = chunkTexts.slice(i, i + 32);
          const batchEmbeddings = await embed(batch);
          embeddings.push(...batchEmbeddings);
        }
      }

      const writeTransaction = db.transaction(() => {
        if (existing) {
          db.prepare(
            'DELETE FROM chunk_embeddings WHERE chunk_id IN (SELECT id FROM chunks WHERE file_id = ?)',
          ).run(existing.id);
          db.prepare('DELETE FROM links WHERE source_file = ?').run(filePath);
          db.prepare('DELETE FROM files WHERE id = ?').run(existing.id);
        }

        const fileResult = db
          .prepare(
            'INSERT INTO files (file_path, doc_set, content_hash, title, last_indexed_at) VALUES (?, ?, ?, ?, ?)',
          )
          .run(filePath, docSetName, hash, title, new Date().toISOString());

        const fileId = Number(fileResult.lastInsertRowid);

        const insertChunk = db.prepare(
          'INSERT INTO chunks (file_id, section_heading, chunk_text, position) VALUES (?, ?, ?, ?)',
        );
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          const chunkResult = insertChunk.run(fileId, chunk.heading, chunk.text, chunk.position);
          const chunkId = Number(chunkResult.lastInsertRowid);

          if (embeddings[i]) {
            const embedding = embeddings[i];
            const buffer = Buffer.from(
              embedding.buffer,
              embedding.byteOffset,
              embedding.byteLength,
            );
            // Use literal PK — sqlite-vec doesn't support bound PK params with better-sqlite3
            db.prepare(`INSERT INTO chunk_embeddings (chunk_id, embedding) VALUES (${chunkId}, ?)`).run(buffer);
          }
        }

        const insertLink = db.prepare(
          'INSERT INTO links (source_file, target_file, link_text, section) VALUES (?, ?, ?, ?)',
        );
        for (const link of links) {
          insertLink.run(filePath, link.target_file, link.link_text, link.section);
        }
      });

      writeTransaction();
      processedCount++;
    }

    console.error(
      `[indexer] Indexing complete: ${processedCount} files processed, ${skippedCount} unchanged`,
    );
  } catch (error) {
    console.error('[indexer] Error during indexing:', error);
    throw error;
  } finally {
    indexingInProgress = false;
  }
}
