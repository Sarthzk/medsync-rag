import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Daily keep-alive: one round trip to Postgres so the free-tier Supabase project is never idle
 * long enough to auto-pause. It only reads the clock, so it is safe to call; if CRON_SECRET is
 * set (Vercel then sends it as a bearer token) it is enforced as well.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const { data, error } = await supabase.rpc("ping");
  if (error) {
    // A non-200 shows up in the schedule's execution history, which is the alarm we want.
    console.error("keepalive failed:", error.message);
    return NextResponse.json({ ok: false }, { status: 503 });
  }
  return NextResponse.json({ ok: true, at: data });
}
