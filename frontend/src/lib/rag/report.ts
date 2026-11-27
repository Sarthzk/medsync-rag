/**
 * Structured medical report: schema, sanitising, merging and markdown rendering.
 * Pure functions only (no I/O), ported from medsync_rag.py.
 */

export type LabResult = {
  name: string;
  value: string;
  unit: string;
  reference_range: string;
  flag: string;
};

export type StructuredReport = {
  patient_name: string;
  report_date: string;
  report_type: string;
  diagnoses: string[];
  medications: string[];
  lab_results: LabResult[];
  doctor_notes: string;
  raw_text: string;
};

export const defaultStructuredReport = (): StructuredReport => ({
  patient_name: "",
  report_date: "",
  report_type: "",
  diagnoses: [],
  medications: [],
  lab_results: [],
  doctor_notes: "",
  raw_text: "",
});

/** Text of a scalar model output; objects, arrays and null become "" instead of junk like "[object Object]". */
const toText = (value: unknown): string => {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
};

const toTextList = (value: unknown): string[] =>
  Array.isArray(value) ? value.map(toText).filter(Boolean) : [];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const toNormToken = (value: string): string => (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

/** "YYYY-MM-DD" for a real calendar date, else "". */
const ymd = (y: number, m: number, d: number): string => {
  const date = new Date(Date.UTC(y, m - 1, d));
  const real =
    date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
  return real && y >= 1 ? `${pad(y, 4)}-${pad(m)}-${pad(d)}` : "";
};

/**
 * Converts common report date formats to YYYY-MM-DD, or "" when it can't:
 * 2024-03-05, 05-03-2024, 05/03/2024 (day first, then month first), 5 Mar 2024, 5 March 2024.
 */
export function normalizeReportDate(raw: string): string {
  const text = (raw ?? "").trim();
  if (!text) return "";

  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  if (m) return ymd(+m[1], +m[2], +m[3]);

  m = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(text);
  if (m) return ymd(+m[3], +m[2], +m[1]);

  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  if (m) return ymd(+m[3], +m[2], +m[1]) || ymd(+m[3], +m[1], +m[2]);

  m = /^(\d{1,2}) ([A-Za-z]+) (\d{4})$/.exec(text);
  if (m) {
    const name = m[2].toLowerCase();
    const index = MONTHS.findIndex((full) => full === name || full.slice(0, 3) === name);
    return index >= 0 ? ymd(+m[3], index + 1, +m[1]) : "";
  }
  return "";
}

/** Best-effort JSON object from model output (plain JSON, or the outermost {...} inside prose or code fences). */
export function extractJsonObject(raw: string): Record<string, unknown> {
  const text = (raw ?? "").trim();
  if (!text) return {};

  const tryParse = (candidate: string): Record<string, unknown> | null => {
    try {
      const parsed: unknown = JSON.parse(candidate);
      return isRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  };

  const direct = tryParse(text);
  if (direct) return direct;

  const match = /\{[\s\S]*\}/.exec(text);
  return (match && tryParse(match[0])) || {};
}

/** Coerces untrusted model output into the fixed schema. */
export function sanitizeStructuredReport(parsed: unknown): StructuredReport {
  if (!isRecord(parsed)) return defaultStructuredReport();

  const labs: LabResult[] = [];
  if (Array.isArray(parsed.lab_results)) {
    for (const item of parsed.lab_results) {
      if (!isRecord(item)) continue;
      const lab: LabResult = {
        name: toText(item.name),
        value: toText(item.value),
        unit: toText(item.unit),
        reference_range: toText(item.reference_range),
        flag: toText(item.flag),
      };
      if (Object.values(lab).some(Boolean)) labs.push(lab);
    }
  }

  return {
    patient_name: toText(parsed.patient_name),
    report_date: normalizeReportDate(toText(parsed.report_date)),
    report_type: toText(parsed.report_type),
    diagnoses: toTextList(parsed.diagnoses),
    medications: toTextList(parsed.medications),
    lab_results: labs,
    doctor_notes: toText(parsed.doctor_notes),
    raw_text: toText(parsed.raw_text),
  };
}

/** Metadata stored on every chunk; only what the retrieval filters match on (patient, date, type). */
export function structuredReportMetadata(report: StructuredReport): Record<string, string> {
  const patientName = (report.patient_name ?? "").trim();
  const reportDate = normalizeReportDate((report.report_date ?? "").trim());
  const reportType = (report.report_type ?? "").trim();

  return {
    patient_name: patientName,
    patient_name_norm: toNormToken(patientName),
    report_date: reportDate,
    report_year_month: reportDate ? reportDate.slice(0, 7) : "",
    report_type: reportType,
    report_type_norm: toNormToken(reportType),
  };
}

/** Readable markdown of the structured fields, used as the embedding text for images and scanned PDFs. */
export function structuredReportToMarkdown(report: StructuredReport, source: string): string {
  const lines: string[] = [`# Medical report (${source})`, ""];

  const patientName = (report.patient_name ?? "").trim();
  const reportDate = (report.report_date ?? "").trim();
  const reportType = (report.report_type ?? "").trim();
  if (patientName || reportDate || reportType) {
    lines.push("## Patient & report");
    if (patientName) lines.push(`- **Patient:** ${patientName}`);
    if (reportDate) lines.push(`- **Report date:** ${reportDate}`);
    if (reportType) lines.push(`- **Report type:** ${reportType}`);
    lines.push("");
  }

  const bulletSection = (title: string, items: string[]) => {
    const clean = (items ?? []).filter((item) => item.trim());
    if (!clean.length) return;
    lines.push(`## ${title}`, ...clean.map((item) => `- ${item}`), "");
  };
  bulletSection("Diagnoses", report.diagnoses);
  bulletSection("Medications", report.medications);

  if (report.lab_results?.length) {
    lines.push(
      "## Lab results",
      "| Test | Value | Unit | Reference | Flag |",
      "| --- | --- | --- | --- | --- |",
      ...report.lab_results.map(
        (lab) => `| ${lab.name} | ${lab.value} | ${lab.unit} | ${lab.reference_range} | ${lab.flag} |`
      ),
      ""
    );
  }

  const notes = (report.doctor_notes ?? "").trim();
  if (notes) lines.push("## Clinical notes", notes, "");

  const rawText = (report.raw_text ?? "").trim();
  if (rawText.length > 20) lines.push("## Raw extracted text", rawText, "");

  return lines.join("\n").trim();
}
