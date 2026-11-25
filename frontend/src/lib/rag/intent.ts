export type Intent = "RETRIEVAL" | "GENERAL_MEDICAL" | "CONVERSATIONAL";

const PURE_GREETING = [
  /^hello$/, /^hi$/, /^hey$/, /^good morning$/, /^good afternoon$/, /^good evening$/,
  /^how are you/, /^how's it going/, /^what's up/, /^yo$/, /^sup$/,
  /^thanks$/, /^thank you$/, /^bye$/, /^goodbye$/, /^see you/,
];

/** True for bare greetings and thanks, which never need the classifier call. */
export const isPureGreeting = (question: string): boolean => {
  const q = question.trim().toLowerCase();
  return PURE_GREETING.some((pattern) => pattern.test(q));
};

/** Maps raw classifier output to a label; anything unrecognised is conversational. */
export function normalizeIntent(raw: string): Intent {
  const token = (raw ?? "").trim().toUpperCase();
  if (token === "RETRIEVAL" || token === "GENERAL_MEDICAL" || token === "CONVERSATIONAL") return token;
  if (token.includes("RETRIEVAL")) return "RETRIEVAL";
  if (token.includes("GENERAL_MEDICAL")) return "GENERAL_MEDICAL";
  return "CONVERSATIONAL";
}

export const INTENT_SYSTEM_PROMPT = [
  "Classify the user query intent for a medical assistant.",
  "Return exactly one token from this set only:",
  "RETRIEVAL | GENERAL_MEDICAL | CONVERSATIONAL",
  "",
  "Definitions:",
  "- RETRIEVAL: user asks about uploaded reports, their personal diagnosis/results/medications, or asks to extract/compare/report-specific facts.",
  "- GENERAL_MEDICAL: general health/medical knowledge question not tied to uploaded reports.",
  "- CONVERSATIONAL: pure greetings, chitchat, non-medical/general assistant talk (with NO substantive question).",
  "Output only the label.",
].join("\n");
