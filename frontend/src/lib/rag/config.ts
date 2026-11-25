/** Model ids go through the Vercel AI Gateway as "provider/model" strings; override per environment if needed. */
export const ragConfig = {
  chatModel: process.env.MEDSYNC_CHAT_MODEL || "openai/gpt-4o-mini",
  /** Small, fast model for the intent classifier, metadata filter and HyDE. */
  routerModel: process.env.MEDSYNC_ROUTER_MODEL || "openai/gpt-4o-mini",
  /** Must produce 1536 dimensions to match report_chunks.embedding. */
  embeddingModel: process.env.MEDSYNC_EMBED_MODEL || "openai/text-embedding-3-small",
  temperature: 0,
  maxConversationalTokens: 400,
  maxMedicalRagTokens: 1200,
  faithfulnessDisabled: process.env.MEDSYNC_FAITHFULNESS_DISABLED === "true",
} as const;

/** Per-user daily limits (enforced by the consume_quota RPC). */
export const DAILY_LIMITS = { chat: 100, ingest: 20 } as const;

export const ALLOWED_EXTENSIONS = [".png", ".jpg", ".jpeg", ".pdf"] as const;
