/** Pure helpers for turning extracted PDF text into the markdown that gets embedded. */

/** Heuristic: does this PDF carry real machine text, or is it a scan that needs vision? */
export function isTextDensePdf(text: string, pageCount: number): boolean {
  if (pageCount <= 0) return false;
  const nonWhitespace = (text ?? "").replace(/\s+/g, "").length;
  const words = ((text ?? "").match(/\b\w+\b/g) ?? []).length;
  return nonWhitespace / pageCount >= 30 && words >= 10;
}

/** Page-by-page markdown for embedding a text PDF. */
export function pdfPagesToMarkdown(filename: string, pages: string[]): string {
  const parts = [`# Medical report (${filename})`, ""];
  pages.forEach((page, i) => {
    parts.push(`## Page ${i + 1}`, "", page.trim() || "[No extractable text on this page.]", "");
  });
  return parts.join("\n").trim();
}

export const extensionOf = (filename: string): string => {
  const dot = filename.lastIndexOf(".");
  return dot >= 0 ? filename.slice(dot).toLowerCase() : "";
};

/** Last path segment of a client-supplied display name, trimmed. */
export const baseName = (filename: string): string =>
  (filename ?? "").replace(/\\/g, "/").split("/").pop()?.trim() ?? "";

export const IMAGE_MEDIA_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};
