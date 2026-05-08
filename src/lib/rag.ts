import { htmlToText } from "html-to-text";
import { prisma } from "@/lib/prisma";
import { embed, embedBatch, cosineSimilarity } from "./embeddings";

const CHUNK_CHARS = 2000; // ~500 tokens
const CHUNK_OVERLAP = 200;
const MAX_CHUNKS_PER_SNIPPET = 50;

export function stripHtml(html: string): string {
  return htmlToText(html, {
    wordwrap: false,
    selectors: [
      { selector: "a", options: { ignoreHref: true } },
      { selector: "img", format: "skip" },
    ],
  }).trim();
}

export function chunkText(text: string): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  if (clean.length <= CHUNK_CHARS) return [clean];

  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length && chunks.length < MAX_CHUNKS_PER_SNIPPET) {
    const end = Math.min(start + CHUNK_CHARS, clean.length);
    // Prefer to break on sentence/word boundary if we're not at the end.
    let cut = end;
    if (end < clean.length) {
      const slice = clean.slice(start, end);
      const sentenceBreak = Math.max(
        slice.lastIndexOf(". "),
        slice.lastIndexOf("! "),
        slice.lastIndexOf("? "),
      );
      const wordBreak = slice.lastIndexOf(" ");
      cut =
        sentenceBreak > CHUNK_CHARS / 2
          ? start + sentenceBreak + 1
          : wordBreak > CHUNK_CHARS / 2
          ? start + wordBreak
          : end;
    }
    chunks.push(clean.slice(start, cut).trim());
    if (cut >= clean.length) break;
    start = Math.max(cut - CHUNK_OVERLAP, start + 1);
  }
  return chunks;
}

export async function replaceSnippetChunks(
  snippetId: string,
  plainText: string,
): Promise<number> {
  const chunks = chunkText(plainText);
  await prisma.snippetChunk.deleteMany({ where: { snippetId } });
  if (chunks.length === 0) return 0;

  const embeddings = await embedBatch(chunks);
  await prisma.snippetChunk.createMany({
    data: chunks.map((content, ordinal) => ({
      snippetId,
      ordinal,
      content,
      embedding: embeddings[ordinal],
    })),
  });
  return chunks.length;
}

export type Hit = {
  snippetId: string;
  snippetTitle: string;
  content: string;
  similarity: number;
};

/**
 * Cosine-similarity search across all chunks of an org's snippets.
 * In-process (JS) for v0 — swap to pgvector ANN when chunk count exceeds ~10k.
 */
export async function searchSnippets(
  organizationId: string,
  query: string,
  k = 5,
): Promise<Hit[]> {
  const clean = query.trim();
  if (!clean) return [];

  const chunks = await prisma.snippetChunk.findMany({
    where: { snippet: { organizationId } },
    select: {
      content: true,
      embedding: true,
      snippet: { select: { id: true, title: true } },
    },
  });
  if (chunks.length === 0) return [];

  const queryVec = await embed(clean);

  return chunks
    .map((c) => ({
      snippetId: c.snippet.id,
      snippetTitle: c.snippet.title,
      content: c.content,
      similarity: cosineSimilarity(queryVec, c.embedding as unknown as number[]),
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, k);
}

export function formatContext(hits: Hit[]): string {
  if (hits.length === 0) return "";
  return hits
    .map(
      (h, i) =>
        `[${i + 1}] ${h.snippetTitle}\n${h.content}`,
    )
    .join("\n\n---\n\n");
}
