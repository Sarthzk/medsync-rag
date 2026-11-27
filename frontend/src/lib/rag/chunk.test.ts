import { describe, expect, it } from "vitest";
import { CHUNK_OVERLAP, CHUNK_SIZE, splitText } from "./chunk";

const words = (text: string) => new Set(text.split(/\s+/).filter(Boolean));

describe("splitText", () => {
  it("returns nothing for blank input", () => {
    expect(splitText("")).toEqual([]);
    expect(splitText("  \n\n  ")).toEqual([]);
  });

  it("keeps short text as a single chunk", () => {
    expect(splitText("## Diagnoses\n- Anaemia")).toEqual(["## Diagnoses\n- Anaemia"]);
  });

  it("never exceeds the chunk size and loses no words", () => {
    const paragraph = Array.from({ length: 30 }, (_, i) => `Finding ${i} was noted on review.`).join(" ");
    const text = Array.from({ length: 12 }, (_, i) => `## Section ${i}\n\n${paragraph}`).join("\n\n");

    const chunks = splitText(text);
    expect(chunks.length).toBeGreaterThan(5);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(CHUNK_SIZE);

    const covered = words(chunks.join(" "));
    for (const word of words(text)) expect(covered.has(word)).toBe(true);
  });

  it("overlaps consecutive chunks without exceeding the overlap budget", () => {
    const text = Array.from({ length: 400 }, (_, i) => `w${i}`).join(" ");
    const chunks = splitText(text);
    expect(chunks.length).toBeGreaterThan(2);

    for (let i = 1; i < chunks.length; i++) {
      const prevWords = chunks[i - 1].split(" ");
      const firstWord = chunks[i].split(" ")[0];
      const at = prevWords.lastIndexOf(firstWord);
      expect(at).toBeGreaterThanOrEqual(0); // the next chunk starts inside the previous one
      expect(prevWords.slice(at).join(" ").length).toBeLessThanOrEqual(CHUNK_OVERLAP);
    }
  });

  it("falls back to characters for text with no separators", () => {
    const chunks = splitText("x".repeat(2500));
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(CHUNK_SIZE);
  });

  it("splits at paragraph breaks before mid-sentence", () => {
    const a = "A".repeat(500);
    const b = "B".repeat(500);
    expect(splitText(`${a}\n\n${b}`)).toEqual([a, b]);
  });

  it("rejects an overlap that is not smaller than the chunk size", () => {
    expect(() => splitText("abc", { chunkSize: 10, chunkOverlap: 10 })).toThrow();
  });
});
