/** Prompt builders for the three answer paths. Pure functions; wording is carried over from the Python pipeline. */

export type HistoryTurn = { user?: string | null; assistant?: string | null };

export type RetrievedChunk = {
  id: number;
  report_id: string;
  content: string;
  metadata: Record<string, unknown>;
  similarity: number;
};

export type Prompt = { system: string; prompt: string };

/** Recent conversation turns as text for routing and prompting. */
export function historyToText(history: HistoryTurn[] | null | undefined, maxTurns = 5): string {
  if (!history?.length) return "";
  const lines: string[] = [];
  history.slice(-maxTurns).forEach((turn, i) => {
    const user = (turn?.user ?? "").trim();
    const assistant = (turn?.assistant ?? "").trim();
    if (user) lines.push(`Turn ${i + 1} User: ${user}`);
    if (assistant) lines.push(`Turn ${i + 1} Assistant: ${assistant}`);
  });
  return lines.join("\n").trim();
}

const sourceOf = (chunk: RetrievedChunk): string => {
  const source = chunk.metadata?.source;
  return typeof source === "string" && source ? source : "Unknown Source";
};

/** Retrieved chunks labelled with their source filename. */
export const formatContext = (chunks: RetrievedChunk[]): string =>
  chunks.map((c) => `[Source: ${sourceOf(c)}]\n${c.content}`).join("\n\n---\n\n");

/** Unique, sorted source filenames. */
export const extractSources = (chunks: RetrievedChunk[]): string[] =>
  [...new Set(chunks.map((c) => sourceOf(c)).filter((s) => s !== "Unknown Source"))].sort();

export function medicalRagPrompt(question: string, chunks: RetrievedChunk[], history?: HistoryTurn[]): Prompt {
  return {
    system: [
      "You are MedSync-RAG, a medical report assistant.",
      "- Answer using only the provided report context.",
      "- When giving a medical answer, explicitly mention source filename(s).",
      "- If the user asks a broad question about their report (for example, 'how is my report?'), summarize the key findings, diagnoses, medications, lab values, and relevant details from the retrieved context.",
      "- Give complete answers (medications, diagnoses, labs) with important caveats and uncertainties when relevant; do not skip caveats to be shorter.",
      "- If the context is insufficient for a medical question, clearly say you don't know based on uploaded reports and suggest consulting a doctor.",
      "- Do not invent facts not present in context.",
    ].join("\n"),
    prompt:
      `Conversation History:\n${historyToText(history) || "[none]"}\n\n` +
      `Context From Vault:\n${formatContext(chunks)}\n\nQuestion: ${question}`,
  };
}

export function conversationalPrompt(question: string, history?: HistoryTurn[]): Prompt {
  return {
    system: [
      "You are MedSync assistant. Be friendly, concise, and helpful for normal conversation.",
      "Do not give medical advice unless user asks about their uploaded reports.",
    ].join("\n"),
    prompt: `Conversation History:\n${historyToText(history) || "[none]"}\n\nQuestion: ${question}`,
  };
}

export function generalMedicalPrompt(question: string, history?: HistoryTurn[]): Prompt {
  return {
    system: [
      "You are a general medical information assistant.",
      "Provide concise educational information, not diagnosis.",
      "Encourage consulting a qualified clinician for personal medical decisions.",
    ].join("\n"),
    prompt: `Conversation History:\n${historyToText(history) || "[none]"}\n\nQuestion: ${question}`,
  };
}

export const NO_REPORT_CONTENT_MESSAGE =
  "I could not locate any uploaded report content related to your question. " +
  "Please make sure your report is uploaded and indexed, then try again.";
