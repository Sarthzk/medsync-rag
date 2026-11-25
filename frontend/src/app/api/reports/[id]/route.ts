import { NextResponse } from "next/server";
import { isErrorResponse, jsonError, requireUser } from "@/lib/server/auth";
import { deleteReminders, removeObjects } from "@/lib/server/reports";

/** Processing status of one report; the browser polls this after an upload. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const ctx = await requireUser(request);
  if (isErrorResponse(ctx)) return ctx;
  const { id } = await context.params;

  const { data, error } = await ctx.supabase
    .from("reports")
    .select("id, filename, status, error")
    .eq("id", id)
    .maybeSingle();
  if (error && error.code !== "22P02") {
    console.error("report status failed:", error.message);
    return jsonError(500, "Could not load the report.");
  }
  if (!data) return jsonError(404, "Report not found.");
  return NextResponse.json(data);
}

/** Deletes one report: stored file, row (chunks and lab results cascade) and linked medication reminders. */
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const ctx = await requireUser(request);
  if (isErrorResponse(ctx)) return ctx;
  const { id } = await context.params;

  const { data: report, error } = await ctx.supabase
    .from("reports")
    .select("id, filename, storage_path")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    if (error.code === "22P02") return jsonError(404, "Report not found.");
    console.error("load report failed:", error.message);
    return jsonError(500, "Could not delete the report.");
  }
  if (!report) return jsonError(404, "Report not found.");

  const { error: delError } = await ctx.supabase.from("reports").delete().eq("id", id);
  if (delError) {
    console.error("delete report failed:", delError.message);
    return jsonError(500, "Could not delete the report.");
  }
  await removeObjects(ctx.supabase, [report.storage_path]);
  const reminders = await deleteReminders(ctx.supabase, ctx.user.id, [report.filename]);
  return NextResponse.json({ deleted: report.filename, medication_reminders_cleaned: reminders });
}
