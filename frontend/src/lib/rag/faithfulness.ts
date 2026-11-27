import { extractJsonObject } from "./report";

export type FaithfulnessVerdict = {
  confidence: number | null;
  unsupported_claims: string[];
  all_supported: boolean;
  notes: string;
  verification_failed: boolean;
};

export const FAITHFULNESS_SYSTEM_PROMPT = [
  "You verify assistant answers against ONLY the RETRIEVED CONTEXT. No outside medical knowledge.",
  "Tasks:",
  "1. List factual claims in the ASSISTANT ANSWER about this patient (diagnoses, medications, doses, lab values, dates, names, instructions).",
  "2. A claim is supported only if the context states it or is a direct paraphrase without new numbers or details.",
  "3. Educational generalities not framed as this patient's facts are not claims.",
  "4. If the answer refuses or says context is insufficient, unsupported_claims may be empty.",
  'Return ONLY JSON: {"confidence": number 0-1, "all_supported": boolean, "unsupported_claims": string[], "notes": string}',
].join("\n");

export const failedVerdict = (notes: string): FaithfulnessVerdict => ({
  verification_failed: true,
  confidence: null,
  unsupported_claims: [],
  all_supported: false,
  notes,
});

/** Normalizes verifier JSON into a stable shape for the API and UI. */
export function sanitizeVerdict(parsed: Record<string, unknown>): FaithfulnessVerdict {
  const unsupported = Array.isArray(parsed.unsupported_claims)
    ? parsed.unsupported_claims.map((x) => String(x ?? "").trim()).filter(Boolean)
    : [];

  const confidence =
    typeof parsed.confidence === "number" && Number.isFinite(parsed.confidence)
      ? Math.max(0, Math.min(1, parsed.confidence))
      : null;

  return {
    confidence,
    unsupported_claims: unsupported,
    all_supported: typeof parsed.all_supported === "boolean" ? parsed.all_supported : unsupported.length === 0,
    notes: typeof parsed.notes === "string" ? parsed.notes.trim() : "",
    verification_failed: false,
  };
}

/** Parses raw verifier output into a verdict; non-JSON output counts as a failed verification. */
export function parseVerdict(raw: string): FaithfulnessVerdict {
  const parsed = extractJsonObject(raw);
  return Object.keys(parsed).length ? sanitizeVerdict(parsed) : failedVerdict("Verifier returned non-JSON");
}
