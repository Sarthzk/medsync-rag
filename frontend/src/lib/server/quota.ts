import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { DAILY_LIMITS } from "@/lib/rag/config";

/**
 * Counts one use against the user's daily limit. Returns a ready 429/503 response when the call
 * must not proceed, or null when it may. Fails closed: if the counter is unreachable the request
 * is refused rather than letting AI spend go unmetered.
 */
export async function consumeQuota(
  supabase: SupabaseClient,
  kind: keyof typeof DAILY_LIMITS
): Promise<NextResponse | null> {
  const limit = DAILY_LIMITS[kind];
  const { data, error } = await supabase.rpc("consume_quota", { p_kind: kind, p_limit: limit });
  if (error) {
    console.error("consume_quota failed:", error.message);
    return NextResponse.json({ error: "Usage limits are temporarily unavailable. Please try again." }, { status: 503 });
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.allowed) {
    const what = kind === "chat" ? "questions" : "uploads";
    return NextResponse.json(
      { error: `You have reached today's limit of ${limit} ${what}. It resets tomorrow.` },
      { status: 429 }
    );
  }
  return null;
}
