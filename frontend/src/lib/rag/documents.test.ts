import { describe, expect, it } from "vitest";
import { baseName, extensionOf, isTextDensePdf, pdfPagesToMarkdown } from "./documents";

describe("isTextDensePdf", () => {
  it("accepts real text and rejects scans", () => {
    const text = "Haemoglobin 13.5 g/dL within the normal reference range for adult patients today.";
    expect(isTextDensePdf(text, 1)).toBe(true);
    expect(isTextDensePdf("  \n ", 3)).toBe(false);
    expect(isTextDensePdf(text, 20)).toBe(false);
    expect(isTextDensePdf(text, 0)).toBe(false);
  });
});

describe("pdfPagesToMarkdown", () => {
  it("numbers pages and flags empty ones", () => {
    expect(pdfPagesToMarkdown("a.pdf", ["one", "  "])).toBe(
      "# Medical report (a.pdf)\n\n## Page 1\n\none\n\n## Page 2\n\n[No extractable text on this page.]"
    );
  });
});

describe("filename helpers", () => {
  it("handles extensions and paths", () => {
    expect(extensionOf("Report.PDF")).toBe(".pdf");
    expect(extensionOf("noext")).toBe("");
    expect(baseName("C:\\scans\\lab.png")).toBe("lab.png");
    expect(baseName("../../x.pdf")).toBe("x.pdf");
  });
});
