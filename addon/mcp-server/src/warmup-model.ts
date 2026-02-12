#!/usr/bin/env node
/**
 * Runtime script: downloads the embedding model to persistent storage.
 * Run as an s6 oneshot when enable_embeddings is true.
 *
 * Usage: ENABLE_EMBEDDINGS=true MODELS_DIR=/data/models node --import tsx src/warmup-model.ts
 */
import { warmup } from './embeddings.js';

async function main() {
  if (process.env.ENABLE_EMBEDDINGS !== 'true') {
    console.error('Embeddings not enabled, skipping model download.');
    return;
  }

  console.error('Downloading embedding model...');
  await warmup();
  console.error('Embedding model ready.');
}

main().catch((err) => {
  console.error('Model warmup failed:', err);
  process.exit(1);
});
