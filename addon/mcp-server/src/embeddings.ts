import { pipeline, env, type FeatureExtractionPipeline } from '@huggingface/transformers';

const MODELS_DIR = process.env.MODELS_DIR || '/data/models';
const ENABLE_EMBEDDINGS = process.env.ENABLE_EMBEDDINGS === 'true';

// Cache models locally
env.cacheDir = MODELS_DIR;

const MODEL_NAME = 'Xenova/all-MiniLM-L6-v2';

let extractor: FeatureExtractionPipeline | null = null;
let loading = false;
let ready = false;

async function getExtractor(): Promise<FeatureExtractionPipeline> {
  if (extractor) return extractor;
  if (loading) {
    while (loading) {
      await new Promise(r => setTimeout(r, 100));
    }
    if (extractor) return extractor;
  }

  loading = true;
  try {
    console.error(`Loading embedding model ${MODEL_NAME}...`);
    extractor = await (pipeline as any)('feature-extraction', MODEL_NAME, {
      dtype: 'fp32',
    }) as FeatureExtractionPipeline;
    ready = true;
    console.error('Embedding model loaded successfully.');
    return extractor;
  } catch (err) {
    console.error('Failed to load embedding model:', err);
    throw err;
  } finally {
    loading = false;
  }
}

export async function embed(texts: string[]): Promise<Float32Array[]> {
  const ext = await getExtractor();
  const output = await ext(texts, { pooling: 'mean', normalize: true });
  const dims = 384;
  const results: Float32Array[] = [];

  for (let i = 0; i < texts.length; i++) {
    const start = i * dims;
    const slice = output.data.slice(start, start + dims);
    results.push(new Float32Array(slice));
  }

  return results;
}

export function isReady(): boolean {
  return ready;
}

export function isEnabled(): boolean {
  return ENABLE_EMBEDDINGS;
}

export async function warmup(): Promise<void> {
  if (!ENABLE_EMBEDDINGS) {
    console.error('Embeddings disabled, skipping model warmup.');
    return;
  }
  await getExtractor();
}
