import { createHash } from "node:crypto";
import { generateText } from "ai";
import { extractText, getDocumentProxy } from "unpdf";
import { ragConfig } from "./config";
import { extensionOf, IMAGE_MEDIA_TYPES, isTextDensePdf, pdfPagesToMarkdown } from "./documents";
import {
  extractJsonObject,
  sanitizeStructuredReport,
  structuredReportToMarkdown,
  type StructuredReport,
} from "./report";

export const sha256 = (data: Uint8Array): string => createHash("sha256").update(data).digest("hex");

const SCHEMA_LINES = [
  "{",
  '  "patient_name": string,',
  '  "report_date": string,  // YYYY-MM-DD when possible, else ""',
  '  "report_type": string,',
  '  "diagnoses": string[],',
  '  "medications": string[],',
  '  "lab_results": [{"name": string, "value": string, "unit": string, "reference_range": string, "flag": string}],',
  '  "doctor_notes": string,',
  '  "raw_text": string',
  "}",
];

const TEXT_SYSTEM = [
  "Transform medical report text into strict JSON.",
  "Return ONLY a JSON object with this exact schema:",
  ...SCHEMA_LINES.filter((l) => !l.includes("raw_text")).map((l) =>
    l.includes("doctor_notes") ? '  "doctor_notes": string' : l
  ),
  "Rules:",
  "- Use empty string/empty array for unknown values.",
  "- report_date should be YYYY-MM-DD when possible.",
  "- Do not include extra keys.",
].join("\n");

const VISION_PROMPT = [
  "Extract report details as strict JSON.",
  "Return ONLY a JSON object with this exact schema:",
  ...SCHEMA_LINES,
  "Rules:",
  "- Use empty string/empty array for missing fields.",
  "- raw_text should contain the full plain text content of the report when available, or empty string if unavailable.",
  "- Do not add extra keys.",
  "- Keep values concise and faithful to the report.",
].join("\n");

const hasContent = (r: StructuredReport) =>
  Boolean(
    r.patient_name || r.report_date || r.report_type || r.diagnoses.length ||
      r.medications.length || r.lab_results.length || r.doctor_notes
  );

/** Machine text of a PDF, page by page. */
export async function extractPdfPages(data: Uint8Array): Promise<string[]> {
  // unpdf transfers the buffer to its worker, so hand it a copy and keep ours usable.
  const pdf = await getDocumentProxy(new Uint8Array(data));
  const { text } = await extractText(pdf, { mergePages: false });
  return text;
}

async function structureText(text: string, source: string): Promise<StructuredReport> {
  const { text: raw } = await generateText({
    model: ragConfig.chatModel,
    system: TEXT_SYSTEM,
    prompt: `Source: ${source}\n\nReport text:\n${text.slice(0, 12000)}`,
    temperature: 0,
    maxOutputTokens: 2000,
  });
  // The source text is already known; don't spend output tokens having the model echo it.
  return { ...sanitizeStructuredReport(extractJsonObject(raw)), raw_text: text };
}

/** Vision extraction for images and scanned PDFs (the model reads the file itself). */
async function structureWithVision(data: Uint8Array, mediaType: string): Promise<StructuredReport> {
  const { text: raw } = await generateText({
    model: ragConfig.chatModel,
    temperature: 0,
    maxOutputTokens: 4000,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: VISION_PROMPT },
          {
            type: "file",
            mediaType,
            data,
            ...(mediaType.startsWith("image/") ? { providerOptions: { openai: { imageDetail: "high" } } } : {}),
          },
        ],
      },
    ],
  });
  return sanitizeStructuredReport(extractJsonObject(raw));
}

export type ExtractedReport = { structured: StructuredReport; markdown: string };

/**
 * Document extraction entrypoint.
 * - Images: vision extraction; the embedded text is the structured fields as markdown.
 * - Text PDFs: page text is structured by the model; the embedded text is the page text itself.
 * - Scanned PDFs (or when the text path finds nothing): vision extraction on the PDF.
 * `cached` skips the model call when an identical file was already extracted.
 */
export async function extractReport(
  data: Uint8Array,
  filename: string,
  cached?: StructuredReport | null
): Promise<ExtractedReport> {
  const ext = extensionOf(filename);
  const imageType = IMAGE_MEDIA_TYPES[ext];

  if (imageType) {
    const structured = cached ?? (await structureWithVision(data, imageType));
    return { structured, markdown: structuredReportToMarkdown(structured, filename) };
  }
  if (ext !== ".pdf") throw new Error(`Unsupported report extension: ${ext}`);

  let pages: string[];
  try {
    pages = await extractPdfPages(data);
  } catch {
    throw new Error(`Uploaded file ${filename} is not a readable PDF.`);
  }

  const textDense = isTextDensePdf(pages.join("\n\n"), pages.length);
  let structured = cached ?? null;
  if (!structured && textDense) {
    structured = await structureText(pages.join("\n\n").trim(), filename);
    if (!hasContent(structured)) structured = null; // fall back to vision
  }
  structured ??= await structureWithVision(data, "application/pdf");

  return {
    structured,
    markdown: textDense ? pdfPagesToMarkdown(filename, pages) : structuredReportToMarkdown(structured, filename),
  };
}
