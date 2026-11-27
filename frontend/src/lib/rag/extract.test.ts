import { jsPDF } from "jspdf";
import { describe, expect, it } from "vitest";
import { isTextDensePdf } from "./documents";
import { extractPdfPages, sha256 } from "./extract";

const makePdf = (pages: string[]): Uint8Array => {
  const doc = new jsPDF();
  pages.forEach((text, i) => {
    if (i > 0) doc.addPage();
    doc.text(text, 10, 20);
  });
  return new Uint8Array(doc.output("arraybuffer"));
};

describe("extractPdfPages", () => {
  it("reads text page by page and keeps the input usable", async () => {
    const data = makePdf([
      "Haemoglobin 13.5 g/dL. Fasting glucose 92 mg/dL. Diagnosis: none. Medication: none prescribed.",
      "Page two: follow up in six months with the family physician for review.",
    ]);
    const before = sha256(data);
    const pages = await extractPdfPages(data);
    expect(pages).toHaveLength(2);
    expect(pages[0]).toContain("Haemoglobin 13.5");
    expect(pages[1]).toContain("follow up");
    expect(isTextDensePdf(pages.join("\n\n"), pages.length)).toBe(true);
    expect(sha256(data)).toBe(before); // buffer not detached
  });

  it("rejects bytes that are not a PDF", async () => {
    await expect(extractPdfPages(new TextEncoder().encode("not a pdf"))).rejects.toThrow();
  });
});
