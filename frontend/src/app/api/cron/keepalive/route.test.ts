import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ rpc }) }));

import { GET } from "./route";

const call = (headers: Record<string, string> = {}) =>
  GET(new Request("http://localhost/api/cron/keepalive", { headers }));

describe("GET /api/cron/keepalive", () => {
  beforeEach(() => {
    rpc.mockReset();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-key");
    vi.stubEnv("CRON_SECRET", "");
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("pings the database and reports the time", async () => {
    rpc.mockResolvedValue({ data: "2026-11-25T03:17:00Z", error: null });
    const res = await call();
    expect(rpc).toHaveBeenCalledWith("ping");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, at: "2026-11-25T03:17:00Z" });
  });

  it("answers 503 when the database is unreachable or paused", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "fetch failed" } });
    const res = await call();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false });
  });

  it("enforces CRON_SECRET when it is set", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret-s3cret-s3cret");
    rpc.mockResolvedValue({ data: "now", error: null });

    expect((await call()).status).toBe(401);
    expect((await call({ authorization: "Bearer wrong" })).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();

    expect((await call({ authorization: "Bearer s3cret-s3cret-s3cret" })).status).toBe(200);
  });
});
