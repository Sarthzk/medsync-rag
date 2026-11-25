/**
 * Recursive character splitter (the behaviour of LangChain's RecursiveCharacterTextSplitter, which the
 * Python pipeline used with chunk_size=900, chunk_overlap=120): prefer paragraph breaks, then lines, then
 * words, then characters; separators stay at the start of the piece that follows them.
 */

export const CHUNK_SIZE = 900;
export const CHUNK_OVERLAP = 120;

const SEPARATORS = ["\n\n", "\n", " ", ""];

/** Splits on `separator`, attaching each separator to the start of the piece after it. */
function splitKeepingSeparator(text: string, separator: string): string[] {
  const parts = text.split(new RegExp(`(${separator.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`));
  const pieces = [parts[0]];
  for (let i = 1; i < parts.length; i += 2) pieces.push(parts[i] + (parts[i + 1] ?? ""));
  return pieces.filter((piece) => piece !== "");
}

/** Joins small pieces into chunks of at most `chunkSize`, carrying up to `chunkOverlap` into the next chunk. */
function mergeSplits(splits: string[], chunkSize: number, chunkOverlap: number): string[] {
  const chunks: string[] = [];
  const current: string[] = [];
  let total = 0;

  const flush = () => {
    const chunk = current.join("").trim();
    if (chunk) chunks.push(chunk);
  };

  for (const piece of splits) {
    if (total + piece.length > chunkSize && current.length > 0) {
      flush();
      while (current.length > 0 && (total > chunkOverlap || total + piece.length > chunkSize)) {
        total -= current[0].length;
        current.shift();
      }
    }
    current.push(piece);
    total += piece.length;
  }
  flush();
  return chunks;
}

function splitRecursive(
  text: string,
  separators: string[],
  chunkSize: number,
  chunkOverlap: number
): string[] {
  let separator = separators[separators.length - 1];
  let rest: string[] = [];
  for (let i = 0; i < separators.length; i++) {
    if (separators[i] === "") {
      separator = "";
      break;
    }
    if (text.includes(separators[i])) {
      separator = separators[i];
      rest = separators.slice(i + 1);
      break;
    }
  }

  const splits = separator ? splitKeepingSeparator(text, separator) : Array.from(text);
  const chunks: string[] = [];
  let small: string[] = [];

  for (const piece of splits) {
    if (piece.length < chunkSize) {
      small.push(piece);
      continue;
    }
    if (small.length) {
      chunks.push(...mergeSplits(small, chunkSize, chunkOverlap));
      small = [];
    }
    if (rest.length) chunks.push(...splitRecursive(piece, rest, chunkSize, chunkOverlap));
    else chunks.push(piece);
  }
  if (small.length) chunks.push(...mergeSplits(small, chunkSize, chunkOverlap));
  return chunks;
}

export function splitText(
  text: string,
  { chunkSize = CHUNK_SIZE, chunkOverlap = CHUNK_OVERLAP }: { chunkSize?: number; chunkOverlap?: number } = {}
): string[] {
  if (chunkOverlap >= chunkSize) throw new Error("chunkOverlap must be smaller than chunkSize");
  return splitRecursive(text, SEPARATORS, chunkSize, chunkOverlap)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
}
