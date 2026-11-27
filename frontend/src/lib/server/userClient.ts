import { createClient } from "@supabase/supabase-js";

/** Supabase client acting as the user via their access token; safe to use after the response was sent. */
export const createClientForToken = (accessToken: string) =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
