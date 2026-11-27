import { describe, expect, it } from "vitest";
import { ownedStoragePath } from "./reports";

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
