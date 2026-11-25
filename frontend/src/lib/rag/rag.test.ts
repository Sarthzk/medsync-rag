import { describe, expect, it } from "vitest";
import { buildMetadataFilter, previousYearMonth } from "./filters";
import { failedVerdict, parseVerdict, sanitizeVerdict } from "./faithfulness";
import { isPureGreeting, normalizeIntent } from "./intent";
import {
  extractSources,
  formatContext,
  historyToText,
  medicalRagPrompt,
  type RetrievedChunk,
} from "./prompts";

const chunk = (source: string | undefined, content = "text"): RetrievedChunk => ({
  id: 1,
  report_id: "r",
  content,
  metadata: source === undefined ? {} : { source },
  similarity: 0.9,
});

describe("historyToText", () => {
  it("keeps the last five turns and skips empty messages", () => {
    const history = Array.from({ length: 7 }, (_, i) => ({ user: `q${i}`, assistant: i === 6 ? "" : `a${i}` }));
    const text = historyToText(history);
    expect(text).not.toContain("q1");
    expect(text).toContain("Turn 1 User: q2");
    expect(text.trim().endsWith("Turn 5 User: q6")).toBe(true);
  });
  it("is empty without history", () => {
    expect(historyToText(undefined)).toBe("");
    expect(historyToText([])).toBe("");
  });
});

describe("context helpers", () => {
  it("labels chunks with their source", () => {
    expect(formatContext([chunk("a.pdf", "hello"), chunk(undefined, "x")])).toBe(
      "[Source: a.pdf]\nhello\n\n---\n\n[Source: Unknown Source]\nx"
    );
  });
  it("returns unique sorted sources", () => {
    expect(extractSources([chunk("b.pdf"), chunk("a.pdf"), chunk("b.pdf"), chunk(undefined)])).toEqual([
      "a.pdf",
      "b.pdf",
    ]);
  });
  it("builds a grounded prompt", () => {
    const p = medicalRagPrompt("What is my HbA1c?", [chunk("a.pdf", "HbA1c 6.1")], [{ user: "hi", assistant: "hello" }]);
    expect(p.prompt).toContain("Context From Vault:\n[Source: a.pdf]\nHbA1c 6.1");
    expect(p.prompt).toContain("Question: What is my HbA1c?");
    expect(p.system).toContain("only the provided report context");
  });
});

describe("intent", () => {
  it("detects pure greetings only", () => {
    expect(isPureGreeting("Hello")).toBe(true);
    expect(isPureGreeting("  thanks ")).toBe(true);
    expect(isPureGreeting("hello, what is my glucose?")).toBe(false);
  });
  it("normalizes labels", () => {
    expect(normalizeIntent("retrieval")).toBe("RETRIEVAL");
    expect(normalizeIntent("Label: GENERAL_MEDICAL.")).toBe("GENERAL_MEDICAL");
    expect(normalizeIntent("???")).toBe("CONVERSATIONAL");
  });
});

describe("buildMetadataFilter", () => {
  const now = new Date("2026-01-15T00:00:00Z");
  it("handles month scopes across a year boundary", () => {
    expect(previousYearMonth(now)).toBe("2025-12");
    expect(buildMetadataFilter('{"date_scope":"last_month"}', now)).toEqual({ report_year_month: "2025-12" });
    expect(buildMetadataFilter('{"date_scope":"this_month"}', now)).toEqual({ report_year_month: "2026-01" });
  });
  it("normalizes names and validates dates", () => {
    const raw = '{"patient_name":"  Asha   Rao ","report_type":"Blood Test","date_scope":"exact_date","report_date":"05/03/2024"}';
    expect(buildMetadataFilter(raw, now)).toEqual({
      patient_name_norm: "asha rao",
      report_type_norm: "blood test",
      report_date: "2024-03-05",
    });
    expect(buildMetadataFilter('{"date_scope":"exact_month","report_year_month":"March"}', now)).toBeNull();
  });
  it("returns null for empty or garbage output", () => {
    expect(buildMetadataFilter('{"date_scope":"none"}', now)).toBeNull();
    expect(buildMetadataFilter("nothing here", now)).toBeNull();
    expect(buildMetadataFilter('```json\n{"report_type":"MRI"}\n```', now)).toEqual({ report_type_norm: "mri" });
  });
});

describe("faithfulness verdict", () => {
  it("clamps confidence and infers all_supported", () => {
    const v = sanitizeVerdict({ confidence: 4, unsupported_claims: ["x", " "], notes: " n " });
    expect(v).toMatchObject({ confidence: 1, unsupported_claims: ["x"], all_supported: false, notes: "n" });
    expect(sanitizeVerdict({}).all_supported).toBe(true);
    expect(sanitizeVerdict({ confidence: "high" }).confidence).toBeNull();
  });
  it("treats non-JSON as failed", () => {
    expect(parseVerdict("sorry")).toEqual(failedVerdict("Verifier returned non-JSON"));
    expect(parseVerdict('{"confidence":0.5,"all_supported":true}').verification_failed).toBe(false);
  });
});
