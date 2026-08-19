import { openai } from "@ai-sdk/openai";
import { embed } from "ai";

/**
 * Turns text into a vector.
 *
 * Injected rather than imported, for the same reason the language model is injected into
 * extraction and mapping: the suite has to run the real retrieval query without a network
 * call, and a module that reaches for a provider itself cannot be tested without one.
 */
export type Embedder = (text: string) => Promise<number[]>;

export const EMBEDDING_MODEL = "text-embedding-3-small";

export async function embedWithOpenAI(text: string): Promise<number[]> {
  const { embedding } = await embed({
    model: openai.textEmbeddingModel(EMBEDDING_MODEL),
    value: text,
  });

  return embedding;
}

/**
 * The text a precedent is indexed by, and the text a submitted campaign is matched with.
 *
 * Both sides go through this function so a query vector and a stored vector are always
 * built the same way. Two different concatenations would produce a retrieval that looks
 * like it works and quietly ranks on formatting.
 */
export function embeddableText(campaign: { title: string; story: string }): string {
  return `${campaign.title}\n\n${campaign.story}`;
}
