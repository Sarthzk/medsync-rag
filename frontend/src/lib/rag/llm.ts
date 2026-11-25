import { embed, embedMany, generateText } from "ai";
import { ragConfig } from "./config";

/** One non-streaming completion, trimmed. */
export async function complete(opts: {
  model: string;
  system: string;
  prompt: string;
  maxOutputTokens: number;
}): Promise<string> {
  const { text } = await generateText({
    model: opts.model,
    system: opts.system,
    prompt: opts.prompt,
    temperature: 0,
    maxOutputTokens: opts.maxOutputTokens,
  });
  return text.trim();
}

export async function embedQuery(value: string): Promise<number[]> {
  const { embedding } = await embed({ model: ragConfig.embeddingModel, value });
  return embedding;
}

export async function embedTexts(values: string[]): Promise<number[][]> {
  const { embeddings } = await embedMany({ model: ragConfig.embeddingModel, values });
  return embeddings;
}
