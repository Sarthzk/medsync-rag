import { after, NextResponse } from "next/server";
import { z } from "zod";
import { ALLOWED_EXTENSIONS } from "@/lib/rag/config";
import { baseName, extensionOf } from "@/lib/rag/documents";
import { isErrorResponse, jsonError, requireUser } from "@/lib/server/auth";
import { processReport } from "@/lib/server/ingest";
import { consumeQuota } from "@/lib/server/quota";
import { ownedStoragePath } from "@/lib/server/reports";
import { createClientForToken } from "@/lib/server/userClient";

export const dynamic = "force-dynamic";
// Extraction of multi-page scanned PDFs runs after the response and can take a while.
export const maxDuration = 300;

const bodySchema = z.object({
  storage_path: z.string().min(1).max(512),
  filename: z.string().min(1).max(255),
});

/**
 * Registers a report the browser already uploaded to Storage and processes it in the background.
 * Answers 202 immediately; poll GET /api/reports/:id until status is `ready` or `failed`.
 */
export async function POST(request: Request) {
  const ctx = await requireUser(request);
  if (isErrorResponse(ctx)) return ctx;
  const { supabase, user } = ctx;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "Invalid request.");

  const filename = baseName(parsed.data.filename);
  if (!filename || !(ALLOWED_EXTENSIONS as readonly string[]).includes(extensionOf(filename))) {
    return jsonError(400, `Unsupported file type. Allowed: ${ALLOWED_EXTENSIONS.join(", ")}`);
  }
  const storagePath = ownedStoragePath(user.id, parsed.data.storage_path);
  if (!storagePath) return jsonError(400, "Invalid storage path.");

  const respond = (r: { id: string; status: string }) =>
    NextResponse.json(
      { status: r.status, report_id: r.id, file: filename },
      { status: r.status === "ready" ? 200 : 202 }
    );
  const find = () =>
    supabase
      .from("reports")
      .select("id, filename, storage_path, status")
      .eq("user_id", user.id)
      .eq("storage_path", storagePath)
      .maybeSingle();

  // A repeated POST for the same upload must not start a second run.
  const { data: existing } = await find();
  if (existing && existing.status !== "failed") return respond(existing);

  const blocked = await consumeQuota(supabase, "ingest");
  if (blocked) return blocked;

  const columns = "id, filename, storage_path, status";
  const { data: report, error } = existing
    ? // Retry of a failed run; only one of two simultaneous retries can flip it back to processing.
      await supabase
        .from("reports")
        .update({ status: "processing", error: null })
        .eq("id", existing.id)
        .eq("status", "failed")
        .select(columns)
        .maybeSingle()
    : await supabase
        .from("reports")
        .insert({ user_id: user.id, filename, storage_path: storagePath, status: "processing" })
        .select(columns)
        .single();

  if (!report) {
    // Lost a race to a simultaneous request for the same upload (unique violation or already retried): it owns the run.
    const { data: winner } = await find();
    if (winner && (!error || error.code === "23505")) return respond(winner);
    console.error("could not register report:", error?.message);
    return jsonError(500, "Report processing failed. Please try again.");
  }

  // The cookie-bound client is not usable once the response is sent; keep a token-bound one.
  const { data: session } = await supabase.auth.getSession();
  const token =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() || session.session?.access_token;
  if (!token) return jsonError(401, "Please sign in again.");
  const worker = createClientForToken(token);

  after(() => processReport(worker, user.id, report));

  return NextResponse.json({ status: "processing", report_id: report.id, file: filename }, { status: 202 });
}
