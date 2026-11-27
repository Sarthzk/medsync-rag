import { streamText } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ragConfig } from "./config";
import { FAITHFULNESS_SYSTEM_PROMPT, failedVerdict, parseVerdict, type FaithfulnessVerdict } from "./faithfulness";
import { buildMetadataFilter, HYDE_SYSTEM_PROMPT, METADATA_FILTER_SYSTEM_PROMPT } from "./filters";
import { INTENT_SYSTEM_PROMPT, isPureGreeting, normalizeIntent, type Intent } from "./intent";
import { complete, embedQuery } from "./llm";
import {
  conversationalPrompt,
  extractSources,
  formatContext,
  generalMedicalPrompt,
  historyToText,
  medicalRagPrompt,
  NO_REPORT_CONTENT_MESSAGE,
  type HistoryTurn,
  type Prompt,
  type RetrievedChunk,
} from "./prompts";

/** Server-sent events of a chat answer, in the order the client already understands. */
export type ChatEvent =
  | { t: string }
  | { sources: string[] }
  | { faithfulness: FaithfulnessVerdict };

const historyBlock = (history: HistoryTurn[]) => `Conversation history:\n${historyToText(history) || "[none]"}\n\n`;

async function classifyIntent(question: string, history: HistoryTurn[]): Promise<Intent> {
  if (isPureGreeting(question)) return "CONVERSATIONAL";
  try {
    const raw = await complete({
      model: ragConfig.routerModel,
      system: INTENT_SYSTEM_PROMPT,
      prompt: `${historyBlock(history)}Current user query:\n${question.trim()}`,
      maxOutputTokens: 8,
    });
    return normalizeIntent(raw);
  } catch (e) {
    // Retrieval is the safe default: it grounds answers in the user's own reports.
    console.warn("intent classification failed; defaulting to RETRIEVAL:", e);
    return "RETRIEVAL";
  }
}

async function buildFilter(question: string, history: HistoryTurn[]) {
  try {
    const raw = await complete({
      model: ragConfig.routerModel,
      system: METADATA_FILTER_SYSTEM_PROMPT,
      prompt: `${historyBlock(history)}Current user query:\n${question}`,
      maxOutputTokens: 120,
    });
    return buildMetadataFilter(raw);
  } catch (e) {
    console.warn("metadata filter extraction failed; skipping pre-filter:", e);
    return null;
  }
}

/** HyDE: embed a plausible report excerpt that would answer the question instead of the question itself. */
async function buildHydeQuery(question: string, history: HistoryTurn[]): Promise<string> {
  try {
    const text = await complete({
      model: ragConfig.routerModel,
      system: HYDE_SYSTEM_PROMPT,
      prompt: `${historyBlock(history)}User query: ${question}`,
      maxOutputTokens: 220,
    });
    return text || question;
  } catch (e) {
    console.warn("HyDE generation failed; using the raw query:", e);
    return question;
  }
}

async function matchChunks(
  supabase: SupabaseClient,
  embedding: number[],
  filter: Record<string, string> | null
): Promise<RetrievedChunk[]> {
  const { data, error } = await supabase.rpc("match_report_chunks", {
    query_embedding: embedding,
    match_count: 5,
    p_filter: filter ?? {},
  });
  if (error) throw new Error(`Retrieval failed: ${error.message}`);
  return (data ?? []) as RetrievedChunk[];
}

async function retrieve(
  supabase: SupabaseClient,
  filterPromise: Promise<Record<string, string> | null>,
  queryPromise: Promise<string>
): Promise<RetrievedChunk[]> {
  const [filter, query] = await Promise.all([filterPromise, queryPromise]);
  const embedding = await embedQuery(query);
  const chunks = await matchChunks(supabase, embedding, filter);
  if (!chunks.length && filter) {
    // An over-specific filter (a name spelled differently) should not hide everything.
    return matchChunks(supabase, embedding, null);
  }
  return chunks;
}

async function verifyFaithfulness(question: string, context: string, answer: string) {
  if (!answer.trim()) return null;
  try {
    const raw = await complete({
      model: ragConfig.chatModel,
      system: FAITHFULNESS_SYSTEM_PROMPT,
      prompt:
        `USER QUESTION:\n${question.trim().slice(0, 4000)}\n\n` +
        `RETRIEVED CONTEXT:\n${context.slice(0, 14000)}\n\nASSISTANT ANSWER:\n${answer.trim()}`,
      maxOutputTokens: 900,
    });
    return parseVerdict(raw);
  } catch (e) {
    console.warn("faithfulness verification failed:", e);
    return failedVerdict("Verifier error");
  }
}

async function* streamAnswer(prompt: Prompt, maxOutputTokens: number): AsyncGenerator<string> {
  const result = streamText({
    model: ragConfig.chatModel,
    system: prompt.system,
    prompt: prompt.prompt,
    temperature: ragConfig.temperature,
    maxOutputTokens,
  });
  for await (const delta of result.textStream) {
    if (delta) yield delta;
  }
}

/**
 * Routes a question to a conversational, general-medical or report-grounded answer and streams
 * the result. Retrieval prep (metadata filter + HyDE) starts before the intent classifier returns
 * so its latency overlaps; its result is dropped for non-retrieval intents.
 */
export async function* chatEvents(
  supabase: SupabaseClient,
  question: string,
  history: HistoryTurn[],
  skipFaithfulness: boolean
): AsyncGenerator<ChatEvent> {
  if (!question.trim()) {
    yield { t: "Please ask a question." };
    return;
  }

  const filterPromise = buildFilter(question, history);
  const queryPromise = buildHydeQuery(question, history);
  // Never leave a rejected prep promise unobserved if the intent turns out not to need it.
  filterPromise.catch(() => {});
  queryPromise.catch(() => {});

  const intent = await classifyIntent(question, history);

  if (intent !== "RETRIEVAL") {
    const prompt =
      intent === "CONVERSATIONAL"
        ? conversationalPrompt(question, history)
        : generalMedicalPrompt(question, history);
    for await (const t of streamAnswer(prompt, ragConfig.maxConversationalTokens)) yield { t };
    return;
  }

  const chunks = await retrieve(supabase, filterPromise, queryPromise);
  if (!chunks.length) {
    yield { t: NO_REPORT_CONTENT_MESSAGE };
    return;
  }
  yield { sources: extractSources(chunks) };

  let answer = "";
  for await (const t of streamAnswer(medicalRagPrompt(question, chunks, history), ragConfig.maxMedicalRagTokens)) {
    answer += t;
    yield { t };
  }

  if (skipFaithfulness || ragConfig.faithfulnessDisabled) return;
  const verdict = await verifyFaithfulness(question, formatContext(chunks), answer);
  if (verdict) yield { faithfulness: verdict };
}
