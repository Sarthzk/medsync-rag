import { z } from "zod";

const turn = z.object({
  user: z.string().max(12_000).nullish(),
  assistant: z.string().max(12_000).nullish(),
});

/** Request body shared by the chat endpoints; sizes are capped to bound model cost. */
export const chatBodySchema = z.object({
  question: z.string().max(4000).default(""),
  session_id: z.string().max(200).nullish(),
  history: z.array(turn).max(20).nullish(),
  skip_faithfulness: z.boolean().default(false),
});
