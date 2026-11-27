import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/authPaths";
import { createClient } from "@/lib/supabase-server";

/**
 * Landing point for links in Supabase emails (confirm signup, reset password).
 * Handles both the PKCE `code` flow and the `token_hash` flow, then continues to `next`.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeNext(searchParams.get("next"));

  const supabase = await createClient();
  let failed = true;

  if (code) {
    failed = Boolean((await supabase.auth.exchangeCodeForSession(code)).error);
  } else if (tokenHash && type) {
    failed = Boolean((await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error);
  }

  if (failed) {
    return NextResponse.redirect(`${origin}/login?error=link_expired`);
  }
  return NextResponse.redirect(`${origin}${next}`);
}
