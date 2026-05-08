import { openai } from "./openai";

// Fixed on OpenAI text-embedding-3-small (1536d) regardless of AI_PROVIDER.
// Swapping to Gemini/others later is easy — just match the vector dimension.
export const EMBEDDING_DIM = 1536;
export const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";

export async function embed(text: string): Promise<number[]> {
  const clean = text.trim();
  if (!clean) return new Array(EMBEDDING_DIM).fill(0);
  const res = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: clean,
  });
  const vec = res.data[0]?.embedding;
  if (!vec || vec.length !== EMBEDDING_DIM) {
    throw new Error(
      `Embedding returned unexpected shape (len=${vec?.length ?? 0})`,
    );
  }
  return vec;
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const res = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts.map((t) => t.trim() || " "),
  });
  return res.data.map((d) => d.embedding);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}
