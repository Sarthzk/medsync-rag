import type { SupabaseClient } from "@supabase/supabase-js";
import { splitText } from "@/lib/rag/chunk";
import { embedTexts } from "@/lib/rag/llm";
import { extractReport, sha256 } from "@/lib/rag/extract";
import { sanitizeStructuredReport, structuredReportMetadata } from "@/lib/rag/report";
import { BUCKET } from "./reports";

const INSERT_BATCH = 100;
const EMBED_BATCH = 64;

/**
 * Extracts, embeds and indexes an uploaded report, then marks the row `ready` (or `failed` with a
 * reason). Runs after the 202 response, so it never throws: the outcome lives on the report row.
 */
export async function processReport(
  supabase: SupabaseClient,
  userId: string,
  report: { id: string; filename: string; storage_path: string }
): Promise<void> {
  try {
    const { data: blob, error: downloadError } = await supabase.storage.from(BUCKET).download(report.storage_path);
    if (downloadError || !blob) throw new Error("Could not read the uploaded file.");
    const data = new Uint8Array(await blob.arrayBuffer());
    if (!data.length) throw new Error("Uploaded file is empty.");

    const hash = sha256(data);

    // Identical content already extracted for this user: reuse it instead of paying for the model again.
    const { data: cachedRow } = await supabase
      .from("reports")
      .select("structured_report")
      .eq("user_id", userId)
      .eq("sha256", hash)
      .eq("status", "ready")
      .not("structured_report", "is", null)
      .neq("id", report.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const cached = cachedRow?.structured_report ? sanitizeStructuredReport(cachedRow.structured_report) : null;

    const { structured, markdown } = await extractReport(data, report.filename, cached);
    if (!markdown.trim()) throw new Error("Could not build content for indexing.");

    const metadata = {
      source: report.filename,
      sha256: hash,
      type: "medical_report",
      ...structuredReportMetadata(structured),
    };
    const pieces = splitText(markdown);
    const embeddings: number[][] = [];
    for (let i = 0; i < pieces.length; i += EMBED_BATCH) {
      embeddings.push(...(await embedTexts(pieces.slice(i, i + EMBED_BATCH))));
    }

    const rows = pieces.map((content, i) => ({
      report_id: report.id,
      user_id: userId,
      chunk_index: i,
      content,
      metadata,
      embedding: embeddings[i],
    }));
    // Upsert on (report_id, chunk_index) first, then drop leftovers, so a repeated ingest converges.
    for (let i = 0; i < rows.length; i += INSERT_BATCH) {
      const { error } = await supabase
        .from("report_chunks")
        .upsert(rows.slice(i, i + INSERT_BATCH), { onConflict: "report_id,chunk_index" });
      if (error) throw new Error(`Saving chunks failed: ${error.message}`);
    }
    const { error: trimError } = await supabase
      .from("report_chunks")
      .delete()
      .eq("report_id", report.id)
      .gte("chunk_index", rows.length);
    if (trimError) throw new Error(`Saving chunks failed: ${trimError.message}`);

    const { error: readyError } = await supabase
      .from("reports")
      .update({ status: "ready", structured_report: structured, sha256: hash, error: null })
      .eq("id", report.id);
    if (readyError) throw new Error(readyError.message);
  } catch (e) {
    console.error(`ingest of report ${report.id} failed:`, e);
    const message = e instanceof Error ? e.message : "Report processing failed.";
    await supabase
      .from("reports")
      .update({ status: "failed", error: message.slice(0, 500) })
      .eq("id", report.id);
  }
}
