import { describe, expect, it } from "vitest";
import {
  defaultStructuredReport,
  extractJsonObject,
  mergeStructuredReports,
  normalizeReportDate,
  sanitizeStructuredReport,
  structuredReportMetadata,
  structuredReportToMarkdown,
  toNormToken,
} from "./report";

describe("normalizeReportDate", () => {
  it.each([
    ["2024-03-05", "2024-03-05"],
    ["2024-3-5", "2024-03-05"],
    ["05-03-2024", "2024-03-05"],
    ["05/03/2024", "2024-03-05"], // day first wins
    ["13/04/2024", "2024-04-13"],
    ["04/13/2024", "2024-04-13"], // not a valid day/month, falls back to month first
    ["5 Mar 2024", "2024-03-05"],
    ["5 march 2024", "2024-03-05"],
    ["12 DECEMBER 2023", "2023-12-12"],
  ])("%s -> %s", (input, expected) => {
    expect(normalizeReportDate(input)).toBe(expected);
  });

  it.each(["", "   ", "31/02/2024", "2024-13-01", "yesterday", "5 Smarch 2024", "05.03.2024"])(
    "rejects %j",
    (input) => {
      expect(normalizeReportDate(input)).toBe("");
    }
  );
});

describe("extractJsonObject", () => {
  it("parses plain JSON", () => {
    expect(extractJsonObject('{"a": 1}')).toEqual({ a: 1 });
  });

  it("finds the object inside code fences or prose", () => {
    expect(extractJsonObject('Here you go:\n```json\n{"a": {"b": 2}}\n```')).toEqual({ a: { b: 2 } });
  });

  it("returns {} for empty input, arrays and garbage", () => {
    expect(extractJsonObject("")).toEqual({});
    expect(extractJsonObject("[1, 2]")).toEqual({});
    expect(extractJsonObject("no json here")).toEqual({});
    expect(extractJsonObject("{broken")).toEqual({});
  });
});

describe("sanitizeStructuredReport", () => {
  it("returns the default for non-objects", () => {
    expect(sanitizeStructuredReport(null)).toEqual(defaultStructuredReport());
    expect(sanitizeStructuredReport("x")).toEqual(defaultStructuredReport());
    expect(sanitizeStructuredReport([])).toEqual(defaultStructuredReport());
  });

  it("trims, normalizes the date and drops junk entries", () => {
    const report = sanitizeStructuredReport({
      patient_name: "  Asha Rao ",
      report_date: "05/03/2024",
      report_type: " CBC ",
      diagnoses: ["Anaemia ", "", null, { nested: true }, 42],
      medications: "not a list",
      lab_results: [
        { name: " Hb ", value: 0, unit: "g/dL", reference_range: "12-16", flag: "L" },
        { name: "", value: "", unit: "", reference_range: "", flag: "" },
        "junk",
      ],
      doctor_notes: " rest ",
      raw_text: null,
    });

    expect(report.patient_name).toBe("Asha Rao");
    expect(report.report_date).toBe("2024-03-05");
    expect(report.report_type).toBe("CBC");
    expect(report.diagnoses).toEqual(["Anaemia", "42"]);
    expect(report.medications).toEqual([]);
    expect(report.lab_results).toEqual([
      { name: "Hb", value: "0", unit: "g/dL", reference_range: "12-16", flag: "L" },
    ]);
    expect(report.doctor_notes).toBe("rest");
    expect(report.raw_text).toBe("");
  });
});

describe("structuredReportMetadata", () => {
  it("builds normalized, filterable fields", () => {
    const meta = structuredReportMetadata({
      ...defaultStructuredReport(),
      patient_name: "Asha  Rao",
      report_date: "2024-03-05",
      report_type: "Blood  Test",
      diagnoses: ["Anaemia"],
    });
    expect(meta.patient_name_norm).toBe("asha rao");
    expect(meta.report_year_month).toBe("2024-03");
    expect(meta.report_type_norm).toBe("blood test");
    expect(JSON.parse(meta.diagnoses_json)).toEqual(["Anaemia"]);
  });

  it("leaves the month empty without a date", () => {
    expect(structuredReportMetadata(defaultStructuredReport()).report_year_month).toBe("");
  });
});

describe("mergeStructuredReports", () => {
  it("combines pages, keeping first-seen header fields and de-duplicating lists", () => {
    const page1 = sanitizeStructuredReport({
      patient_name: "Asha Rao",
      diagnoses: ["Anaemia"],
      medications: ["Iron"],
      lab_results: [{ name: "Hb", value: "10", unit: "g/dL", reference_range: "12-16", flag: "L" }],
      doctor_notes: "Rest.",
      raw_text: "page one",
    });
    const page2 = sanitizeStructuredReport({
      patient_name: "Someone Else",
      report_date: "2024-03-05",
      diagnoses: ["Anaemia", "Vitamin D deficiency"],
      medications: ["Iron", "Vitamin D"],
      lab_results: [{ name: "Hb", value: "10", unit: "g/dL", reference_range: "12-16", flag: "L" }],
      doctor_notes: "Recheck in 6 weeks.",
      raw_text: "page two",
    });

    const merged = mergeStructuredReports([page1, page2]);
    expect(merged.patient_name).toBe("Asha Rao");
    expect(merged.report_date).toBe("2024-03-05");
    expect(merged.diagnoses).toEqual(["Anaemia", "Vitamin D deficiency"]);
    expect(merged.medications).toEqual(["Iron", "Vitamin D"]);
    expect(merged.lab_results).toHaveLength(1);
    expect(merged.doctor_notes).toBe("Rest.\n\nRecheck in 6 weeks.");
    expect(merged.raw_text).toBe("page one\n\npage two");
  });

  it("returns the empty report for no pages", () => {
    expect(mergeStructuredReports([])).toEqual(defaultStructuredReport());
  });
});

describe("structuredReportToMarkdown", () => {
  it("renders sections only when they have content", () => {
    const md = structuredReportToMarkdown(
      sanitizeStructuredReport({
        patient_name: "Asha Rao",
        diagnoses: ["Anaemia"],
        lab_results: [{ name: "Hb", value: "10", unit: "g/dL", reference_range: "12-16", flag: "L" }],
        raw_text: "short",
      }),
      "cbc.pdf"
    );
    expect(md).toContain("# Medical report (cbc.pdf)");
    expect(md).toContain("- **Patient:** Asha Rao");
    expect(md).toContain("## Diagnoses\n- Anaemia");
    expect(md).toContain("| Hb | 10 | g/dL | 12-16 | L |");
    expect(md).not.toContain("## Medications");
    expect(md).not.toContain("Raw extracted text"); // <= 20 chars is skipped
  });

  it("includes long raw text", () => {
    const md = structuredReportToMarkdown(
      { ...defaultStructuredReport(), raw_text: "x".repeat(40) },
      "a.png"
    );
    expect(md).toContain("## Raw extracted text");
  });
});

describe("toNormToken", () => {
  it("lowercases and collapses whitespace", () => {
    expect(toNormToken("  Blood   TEST ")).toBe("blood test");
    expect(toNormToken("")).toBe("");
  });
});
