import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ownedStoragePath, removeObjects } from "./reports";

const uid = "11111111-1111-1111-1111-111111111111";

describe("ownedStoragePath", () => {
  it("accepts a file in the user's folder", () => {
    expect(ownedStoragePath(uid, `${uid}/123-report.pdf`)).toBe(`${uid}/123-report.pdf`);
  });
  it("rejects other folders, traversal, backslashes and bare folders", () => {
    expect(ownedStoragePath(uid, "22222222-2222-2222-2222-222222222222/a.pdf")).toBeNull();
    expect(ownedStoragePath(uid, `${uid}/../x.pdf`)).toBeNull();
    expect(ownedStoragePath(uid, `${uid}//x.pdf`)).toBeNull();
    expect(ownedStoragePath(uid, `${uid}\\x.pdf`)).toBeNull();
    expect(ownedStoragePath(uid, uid)).toBeNull();
    expect(ownedStoragePath(uid, "")).toBeNull();
  });
});

describe("removeObjects", () => {
  const client = (error: { message: string } | null) =>
    ({ storage: { from: () => ({ remove: async () => ({ error }) }) } }) as unknown as SupabaseClient;

  it("throws when storage fails, so the caller keeps the row", async () => {
    await expect(removeObjects(client({ message: "boom" }), ["a/b.pdf"])).rejects.toThrow("boom");
  });
  it("is a no-op without paths and succeeds otherwise", async () => {
    await expect(removeObjects(client({ message: "unused" }), [])).resolves.toBeUndefined();
    await expect(removeObjects(client(null), ["a/b.pdf"])).resolves.toBeUndefined();
  });
});
