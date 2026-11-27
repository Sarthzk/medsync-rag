import { NextResponse } from "next/server";
import { isErrorResponse, jsonError, requireUser } from "@/lib/server/auth";
import { BUCKET, deleteAllReports, expireStaleReports } from "@/lib/server/reports";

export const dynamic = "force-dynamic";

/** Lists the user's reports with short-lived signed URLs for preview. */
export async function GET(request: Request) {
  const ctx = await requireUser(request);
  if (isErrorResponse(ctx)) return ctx;

  await expireStaleReports(ctx.supabase);
  const { data, error } = await ctx.supabase
    .from("reports")
    .select("id, filename, storage_path, status, error, created_at")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("list reports failed:", error.message);
    return jsonError(500, "Could not load reports.");
  }

  const paths = (data ?? []).map((r) => r.storage_path);
  const signed = paths.length
    ? await ctx.supabase.storage.from(BUCKET).createSignedUrls(paths, 3600)
    : { data: [], error: null };
  const urlByPath = new Map<string, string | null>(
    (signed.data ?? []).map((s) => [s.path ?? "", s.signedUrl ?? null])
  );

  const reports = (data ?? []).map(({ storage_path, ...rest }) => ({
    ...rest,
    url: urlByPath.get(storage_path) ?? null,
  }));
  return NextResponse.json({ reports });
}

/** Deletes every report of the current user. */
export async function DELETE(request: Request) {
  const ctx = await requireUser(request);
  if (isErrorResponse(ctx)) return ctx;
  try {
    return NextResponse.json(await deleteAllReports(ctx.supabase, ctx.user.id));
  } catch (e) {
    console.error("delete all reports failed:", e);
    return jsonError(500, "Could not delete reports.");
  }
}
