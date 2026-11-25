import { describe, expect, it } from "vitest";
import { chatBodySchema } from "./chatRequest";

describe("chatBodySchema", () => {
  it("defaults an empty body", () => {
    expect(chatBodySchema.parse({})).toMatchObject({ question: "", skip_faithfulness: false });
  });
  it("caps question and history size", () => {
    expect(chatBodySchema.safeParse({ question: "x".repeat(4001) }).success).toBe(false);
    expect(chatBodySchema.safeParse({ history: Array(21).fill({ user: "a" }) }).success).toBe(false);
    expect(chatBodySchema.safeParse({ history: Array(20).fill({ user: "a", assistant: null }) }).success).toBe(true);
  });
});
