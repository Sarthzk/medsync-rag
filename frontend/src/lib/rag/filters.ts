import { extractJsonObject, normalizeReportDate, toNormToken } from "./report";

export const METADATA_FILTER_SYSTEM_PROMPT = [
  "Extract optional retrieval filters from the query.",
  "Return strict JSON with keys: patient_name, report_type, date_scope, report_year_month, report_date.",
  "- date_scope must be one of: none | last_month | this_month | exact_date | exact_month.",
  "- report_year_month must be YYYY-MM for exact_month.",
  "- report_date must be YYYY-MM-DD for exact_date.",
  "Use empty strings when absent. Output JSON only.",
].join("\n");

export const HYDE_SYSTEM_PROMPT = [
  "Write a concise hypothetical medical report excerpt that would answer the user query.",
  "Do not mention uncertainty or missing context.",
  "Use clinically meaningful terms likely to appear in lab reports, diagnoses, medications, and assessments.",
  "Return plain text only.",
].join("\n");

export const yearMonth = (date: Date): string =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;

export function previousYearMonth(now: Date): string {
  return yearMonth(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)));
}

const text = (value: unknown): string => (typeof value === "string" ? value : "");

/**
 * Turns the model's filter JSON into a flat {key: value} object matched by JSONB containment
 * against chunk metadata. Returns null when nothing usable was asked for.
 */
export function buildMetadataFilter(raw: string, now: Date = new Date()): Record<string, string> | null {
  const parsed = extractJsonObject(raw);
  const filters: Record<string, string> = {};

  const patient = toNormToken(text(parsed.patient_name));
  if (patient) filters.patient_name_norm = patient;

  const reportType = toNormToken(text(parsed.report_type));
  if (reportType) filters.report_type_norm = reportType;

  const scope = (text(parsed.date_scope) || "none").trim().toLowerCase();
  if (scope === "last_month") {
    filters.report_year_month = previousYearMonth(now);
  } else if (scope === "this_month") {
    filters.report_year_month = yearMonth(now);
  } else if (scope === "exact_month") {
    const ym = text(parsed.report_year_month).trim();
    if (/^\d{4}-\d{2}$/.test(ym)) filters.report_year_month = ym;
  } else if (scope === "exact_date") {
    const date = normalizeReportDate(text(parsed.report_date).trim());
    if (date) filters.report_date = date;
  }

  return Object.keys(filters).length ? filters : null;
}
