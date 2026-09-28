import { createClient } from "@/lib/supabase";

/** Current Supabase access token (refreshed by the client if expired), or null when signed out. */
export async function getAccessToken(): Promise<string | null> {
  const { data } = await createClient().auth.getSession();
  return data.session?.access_token ?? null;
}

/** `fetch` for the app's own `/api/*` routes, authenticated as the signed-in user. */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = await getAccessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(path, { ...init, headers });
}

/** POST/DELETE helper that sends a JSON body. */
export function apiJson(path: string, method: "POST" | "DELETE", body?: unknown): Promise<Response> {
  return apiFetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** Reads `{error}` / `{detail}` from an error response without assuming it is JSON. */
export async function readApiError(res: Response, fallback: string): Promise<string> {
  const text = await res.text().catch(() => "");
  try {
    const data = JSON.parse(text) as { error?: unknown; detail?: unknown };
    if (typeof data.error === "string") return data.error;
    if (typeof data.detail === "string") return data.detail;
  } catch {
    // Not JSON; fall through.
  }
  return fallback;
}
