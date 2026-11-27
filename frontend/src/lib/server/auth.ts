import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-server";
import { createClientForToken } from "./userClient";

export type AuthedContext = { supabase: SupabaseClient; user: User };

export const jsonError = (status: number, error: string, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ error, ...extra }, { status });

/**
 * Authenticates a route handler call from the session cookie (or a bearer token, which the
 * browser helper also sends). Returns 401 when signed out and 503, not 401, when Supabase
 * itself is unreachable so a transient outage never looks like a logout.
 */
export async function requireUser(request?: Request): Promise<AuthedContext | NextResponse> {
  const bearer = request?.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  // A bearer token makes every query run as that user; otherwise fall back to the session cookie.
  const supabase = bearer ? createClientForToken(bearer) : await createClient();
  try {
    const { data, error } = await supabase.auth.getUser(bearer || undefined);
    if (data.user) return { supabase, user: data.user };
    if (error && (error.name === "AuthRetryableFetchError" || (error.status ?? 0) >= 500)) {
      return jsonError(503, "Authentication service is unavailable. Please try again.");
    }
  } catch {
    return jsonError(503, "Authentication service is unavailable. Please try again.");
  }
  return jsonError(401, "Please sign in again.");
}

export const isErrorResponse = (value: AuthedContext | NextResponse): value is NextResponse =>
  value instanceof NextResponse;
