import { z } from "zod";

/** Request body for logging a vital; at least one measurement is required (bounds match the DB checks). */
export const vitalLogSchema = z
  .object({
    heart_rate: z.number().int().min(20).max(250).nullish(),
    sleep_quality: z.number().min(0).max(24).nullish(),
    daily_steps: z.number().int().min(0).max(200_000).nullish(),
  })
  .refine((v) => v.heart_rate != null || v.sleep_quality != null || v.daily_steps != null, {
    message: "Provide at least one vital measurement.",
  });

export type VitalRow = {
  id: string;
  heart_rate: number | null;
  sleep_quality: number | null;
  daily_steps: number | null;
  logged_at: string;
};

/** Shape the vitals page already consumes: adds the legacy `date` (UTC day) and `timestamp` (ms) fields. */
export const toVitalLog = (row: VitalRow) => {
  const ms = Date.parse(row.logged_at);
  return {
    id: row.id,
    heart_rate: row.heart_rate,
    sleep_quality: row.sleep_quality === null ? null : Number(row.sleep_quality),
    daily_steps: row.daily_steps,
    date: new Date(ms).toISOString().slice(0, 10),
    timestamp: ms,
  };
};
