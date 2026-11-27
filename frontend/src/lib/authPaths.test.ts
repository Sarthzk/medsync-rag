import { describe, expect, it } from "vitest";
import { isGuestOnlyPath, isPublicPath, safeNext } from "./authPaths";

describe("safeNext", () => {
  it("keeps same-site paths, including query strings", () => {
    expect(safeNext("/vault")).toBe("/vault");
    expect(safeNext("/chat?q=1&x=2")).toBe("/chat?q=1&x=2");
  });

  it("falls back for missing values", () => {
    expect(safeNext(null)).toBe("/");
    expect(safeNext(undefined)).toBe("/");
    expect(safeNext("")).toBe("/");
    expect(safeNext("", "/home")).toBe("/home");
  });

  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "javascript:alert(1)",
    "vault",
    "/ok\nSet-Cookie: a=b",
  ])("rejects %j", (value) => {
    expect(safeNext(value)).toBe("/");
  });
});

describe("isPublicPath", () => {
  it("allows the auth pages and the callback", () => {
    for (const p of ["/login", "/signup", "/forgot-password", "/reset-password", "/auth/callback"]) {
      expect(isPublicPath(p)).toBe(true);
    }
  });

  it("protects everything else", () => {
    for (const p of ["/", "/vault", "/chat", "/profile", "/login/extra", "/authors"]) {
      expect(isPublicPath(p)).toBe(false);
    }
  });
});

describe("isGuestOnlyPath", () => {
  it("only covers login and signup", () => {
    expect(isGuestOnlyPath("/login")).toBe(true);
    expect(isGuestOnlyPath("/signup")).toBe(true);
    expect(isGuestOnlyPath("/reset-password")).toBe(false);
  });
});
