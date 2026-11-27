import { openai } from "@ai-sdk/openai";

/** OpenAI direct (OPENAI_API_KEY); gpt-4o-mini keeps cost to cents per day at the quotas below. */
export const ragConfig = {
  chatModel: openai(process.env.MEDSYNC_CHAT_MODEL || "gpt-4o-mini"),
  /** Small, fast model for the intent classifier, metadata filter and HyDE. */
  routerModel: openai(process.env.MEDSYNC_ROUTER_MODEL || "gpt-4o-mini"),
  /** Must produce 1536 dimensions to match report_chunks.embedding. */
  embeddingModel: openai.embedding("text-embedding-3-small"),
  temperature: 0,
  maxConversationalTokens: 400,
  maxMedicalRagTokens: 1200,
  faithfulnessDisabled: process.env.MEDSYNC_FAITHFULNESS_DISABLED === "true",
} as const;

/** Per-user daily limits (enforced by the consume_quota RPC). Kept low: signup is open, so total spend is limit x accounts. */
export const DAILY_LIMITS = { chat: 30, ingest: 5 } as const;

export const ALLOWED_EXTENSIONS = [".png", ".jpg", ".jpeg", ".pdf"] as const;
