import { EMBEDDING_DIMENSIONS } from "../db/schema";
import type { Embedder } from "../lib/embedding";

function fnv1a(token: string): number {
  let hash = 0x811c9dc5;

  for (let index = 0; index < token.length; index += 1) {
    hash = Math.imul(hash ^ token.charCodeAt(index), 0x01000193) >>> 0;
  }

  return hash;
}

/**
 * A deterministic embedder for the suite: words hashed into buckets, then normalised.
 *
 * It is not a language model and does not pretend to be one. What it does have is the one
 * property the retrieval tests need, which is that texts sharing vocabulary come out
 * closer than texts that do not, so an ordering assertion means something. What it does
 * not have is any network call, any key, or any run-to-run variation, so the suite that
 * exercises the shipped SQL exercises it the same way every time.
 */
export function createHashEmbedder(dimensions: number = EMBEDDING_DIMENSIONS): Embedder {
  return async (text: string) => {
    const vector = new Array<number>(dimensions).fill(0);

    for (const token of text.toLowerCase().match(/[a-z0-9']+/g) ?? []) {
      vector[fnv1a(token) % dimensions] += 1;
    }

    const norm = Math.sqrt(vector.reduce((total, value) => total + value * value, 0));

    if (norm === 0) {
      vector[0] = 1;
      return vector;
    }

    return vector.map((value) => value / norm);
  };
}
