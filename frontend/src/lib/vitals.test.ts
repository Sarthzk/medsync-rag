import { describe, expect, it } from "vitest";
import { toVitalLog, vitalLogSchema } from "./vitals";

describe("vitalLogSchema", () => {
  it("accepts a single measurement", () => {
    expect(vitalLogSchema.safeParse({ heart_rate: 72 }).success).toBe(true);
  });
  it("rejects an empty log", () => {
    expect(vitalLogSchema.safeParse({}).success).toBe(false);
    expect(vitalLogSchema.safeParse({ heart_rate: null, daily_steps: null }).success).toBe(false);
  });
  it("enforces bounds", () => {
    expect(vitalLogSchema.safeParse({ heart_rate: 19 }).success).toBe(false);
    expect(vitalLogSchema.safeParse({ heart_rate: 251 }).success).toBe(false);
    expect(vitalLogSchema.safeParse({ sleep_quality: 24.5 }).success).toBe(false);
    expect(vitalLogSchema.safeParse({ daily_steps: 200_001 }).success).toBe(false);
    expect(vitalLogSchema.safeParse({ heart_rate: 72.5 }).success).toBe(false);
  });
});

describe("toVitalLog", () => {
  it("adds legacy date and timestamp, and numeric sleep", () => {
    const log = toVitalLog({
      id: "a",
      heart_rate: 60,
      sleep_quality: "7.5" as unknown as number,
      daily_steps: null,
      logged_at: "2026-11-25T10:00:00.000Z",
    });
    expect(log.date).toBe("2026-11-25");
    expect(log.timestamp).toBe(Date.parse("2026-11-25T10:00:00.000Z"));
    expect(log.sleep_quality).toBe(7.5);
  });
});
