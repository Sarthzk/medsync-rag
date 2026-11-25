import { NextResponse } from "next/server";
import { isErrorResponse, jsonError, requireUser } from "@/lib/server/auth";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const ctx = await requireUser(request);
  if (isErrorResponse(ctx)) return ctx;
  const { id } = await context.params;

  const { data, error } = await ctx.supabase.from("vitals").delete().eq("id", id).select("id");
  if (error) {
    // 22P02: not a uuid, so it cannot be one of the user's logs.
    if (error.code === "22P02") return jsonError(404, "Vital log not found.");
    console.error("vitals delete failed:", error.message);
    return jsonError(500, "Could not delete the vital log.");
  }
  if (!data?.length) return jsonError(404, "Vital log not found.");
  return NextResponse.json({ message: "Vital log deleted" });
}
