import { NextResponse } from "next/server";
import { isErrorResponse, jsonError, requireUser } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

/** Structured JSON of the user's most recent successfully processed report. */
export async function GET(request: Request) {
  const ctx = await requireUser(request);
  if (isErrorResponse(ctx)) return ctx;

  const { data, error } = await ctx.supabase
    .from("reports")
    .select("id, filename, created_at, structured_report")
    .eq("status", "ready")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("latest report failed:", error.message);
    return jsonError(500, "Could not load the latest report.", { structured_report: null });
  }
  if (!data) return jsonError(404, "No reports uploaded yet.", { structured_report: null });

  return NextResponse.json({
    report_id: data.id,
    file: data.filename,
    created_at: data.created_at,
    structured_report: data.structured_report,
  });
}
