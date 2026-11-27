import { NextResponse } from "next/server";
import { isErrorResponse, jsonError, requireUser } from "@/lib/server/auth";
import { toVitalLog, vitalLogSchema, type VitalRow } from "@/lib/vitals";

export const dynamic = "force-dynamic";

const COLUMNS = "id, heart_rate, sleep_quality, daily_steps, logged_at";

export async function GET(request: Request) {
  const ctx = await requireUser(request);
  if (isErrorResponse(ctx)) return ctx;

  const { data, error } = await ctx.supabase
    .from("vitals")
    .select(COLUMNS)
    .order("logged_at", { ascending: false })
    .limit(500);
  if (error) {
    console.error("vitals list failed:", error.message);
    return jsonError(500, "Could not load vitals.", { logs: [] });
  }
  return NextResponse.json({ logs: (data as VitalRow[]).map(toVitalLog) });
}

export async function POST(request: Request) {
  const ctx = await requireUser(request);
  if (isErrorResponse(ctx)) return ctx;

  const parsed = vitalLogSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(422, parsed.error.issues[0]?.message ?? "Invalid vital measurement.");
  }

  const { data, error } = await ctx.supabase
    .from("vitals")
    .insert({ user_id: ctx.user.id, ...parsed.data })
    .select(COLUMNS)
    .single();
  if (error) {
    console.error("vitals insert failed:", error.message);
    return jsonError(500, "Could not save the vital log.");
  }
  return NextResponse.json(toVitalLog(data as VitalRow));
}
