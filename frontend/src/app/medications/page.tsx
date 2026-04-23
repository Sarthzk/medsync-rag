"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, Bell, Loader2, Pill, RefreshCw, ShieldCheck } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase";

type LabResult = {
  name: string;
  value: string;
  unit: string;
  reference_range: string;
  flag: string;
};

type StructuredReport = {
  patient_name: string;
  report_date: string;
  report_type: string;
  diagnoses: string[];
  medications: string[];
  lab_results: LabResult[];
  doctor_notes: string;
};

type LatestReportResponse = {
  error?: string;
  file?: string;
  modified_at?: number;
  structured_report: StructuredReport | null;
};

type MedicationReminderRow = {
  medication_key: string;
  medication_name: string;
  report_file: string | null;
  reminder_enabled: boolean;
};

type MedicationCard = {
  medicationKey: string;
  medicationName: string;
  reminderEnabled: boolean;
  sourceLabel: string;
  reportFile: string | null;
};

const normalizeMedicationKey = (value: string) =>
  (value || "").trim().toLowerCase().replace(/\s+/g, " ");

const dedupeMedications = (medications: string[]) => {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const medication of medications) {
    const name = (medication || "").trim().replace(/\s+/g, " ");
    const key = normalizeMedicationKey(name);
    if (!name || seen.has(key)) continue;
    seen.add(key);
    result.push(name);
  }

  return result;
};

const formatDateLabel = (value?: string | number | null) => {
  if (value === null || value === undefined || value === "") return "Unknown";
  const date = typeof value === "number" ? new Date(value * 1000) : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

export default function MedicationsPage() {
  const router = useRouter();
  const supabase = createClient();

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSavingKey, setIsSavingKey] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const [latestReport, setLatestReport] = useState<LatestReportResponse | null>(null);
  const [reportFile, setReportFile] = useState<string | null>(null);
  const [cards, setCards] = useState<MedicationCard[]>([]);

  const loadData = useCallback(async () => {
    setPageError(null);
    setStorageWarning(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }

      setCurrentUser(user);

      const [reportResponse, remindersResponse] = await Promise.all([
        fetch("/api/reports/latest"),
        supabase
          .from("medication_reminders")
          .select("medication_key, medication_name, report_file, reminder_enabled")
          .eq("user_id", user.id),
      ]);

      const reportJson = (await reportResponse.json()) as LatestReportResponse;
      setLatestReport(reportJson);
      setReportFile(reportJson.file ?? null);

      const reportMedications = dedupeMedications(reportJson.structured_report?.medications ?? []);
      const reminderRows = (remindersResponse.data ?? []) as MedicationReminderRow[];

      if (remindersResponse.error) {
        setStorageWarning(
          "Reminder storage is unavailable. Create a medication_reminders table in Supabase to persist toggles."
        );
      }

      const reminderMap = new Map(
        reminderRows.map((row) => [normalizeMedicationKey(row.medication_key), row])
      );

      const mergedKeys = new Set<string>([
        ...reportMedications.map(normalizeMedicationKey),
        ...reminderRows.map((row) => normalizeMedicationKey(row.medication_key)),
      ]);

      const nextCards = Array.from(mergedKeys).map((medicationKey) => {
        const savedReminder = reminderMap.get(medicationKey);
        const reportMedication = reportMedications.find(
          (medication) => normalizeMedicationKey(medication) === medicationKey
        );

        return {
          medicationKey,
          medicationName:
            reportMedication || savedReminder?.medication_name || medicationKey,
          reminderEnabled: savedReminder?.reminder_enabled ?? false,
          sourceLabel: reportMedication ? "Latest report" : "Saved reminder",
          reportFile: savedReminder?.report_file ?? reportJson.file ?? null,
        };
      });

      setCards(
        nextCards.sort((a, b) => a.medicationName.localeCompare(b.medicationName))
      );
    } catch (error) {
      console.error("Failed to load medications:", error);
      setPageError("Failed to load medications from Supabase or the latest report.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [router, supabase]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const enabledCount = useMemo(
    () => cards.filter((card) => card.reminderEnabled).length,
    [cards]
  );

  const handleToggleReminder = async (card: MedicationCard) => {
    if (!currentUser) return;

    const nextValue = !card.reminderEnabled;
    const previousCards = cards;

    setCards((prev) =>
      prev.map((item) =>
        item.medicationKey === card.medicationKey
          ? { ...item, reminderEnabled: nextValue }
          : item
      )
    );
    setIsSavingKey(card.medicationKey);
    setPageError(null);

    try {
      const { error } = await supabase.from("medication_reminders").upsert(
        {
          user_id: currentUser.id,
          medication_key: card.medicationKey,
          medication_name: card.medicationName,
          report_file: reportFile ?? card.reportFile,
          reminder_enabled: nextValue,
        },
        { onConflict: "user_id,medication_key" }
      );

      if (error) {
        throw new Error(error.message || "Failed to save reminder");
      }
    } catch (error) {
      console.error("Failed to save medication reminder:", error);
      setCards(previousCards);
      setPageError(
        "Failed to save reminder. Create the medication_reminders table in Supabase if it does not exist yet."
      );
    } finally {
      setIsSavingKey(null);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 sm:pt-10 lg:pt-12 pb-20 flex items-center justify-center min-h-[60vh]">
        <div className="bg-white border border-slate-100 rounded-[2.5rem] p-8 flex items-center gap-3 text-slate-500 shadow-sm">
          <Loader2 className="animate-spin" size={18} />
          Loading medications…
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-20 px-4 sm:px-6 lg:px-8 pt-8 sm:pt-10 lg:pt-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold text-[#1B4332] tracking-tight">Medications</h1>
          <p className="text-slate-500 max-w-2xl">
            Review medications extracted from your latest report and turn on reminders to store them in Supabase.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setIsRefreshing(true);
            loadData();
          }}
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-[#1B4332] shadow-sm transition-colors hover:bg-slate-50"
        >
          <RefreshCw size={14} className={isRefreshing ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-[2.5rem] border border-slate-100 p-6 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Latest report</p>
          <p className="text-lg font-bold text-[#1B4332] mt-2 truncate">{reportFile || "Unknown"}</p>
        </div>
        <div className="bg-white rounded-[2.5rem] border border-slate-100 p-6 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Medications found</p>
          <p className="text-lg font-bold text-[#1B4332] mt-2">{cards.length || 0}</p>
        </div>
        <div className="bg-white rounded-[2.5rem] border border-slate-100 p-6 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Reminder toggles on</p>
          <p className="text-lg font-bold text-[#1B4332] mt-2">{enabledCount}</p>
        </div>
      </div>

      <AnimatePresence>
        {(pageError || storageWarning) && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="bg-amber-50 border border-amber-200 rounded-4xl p-4 text-amber-900"
          >
            <div className="flex gap-3 items-start">
              <AlertCircle size={18} className="mt-0.5 shrink-0" />
              <div className="space-y-1 text-sm">
                {pageError ? <p className="font-semibold">{pageError}</p> : null}
                {storageWarning ? <p>{storageWarning}</p> : null}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {cards.length > 0 ? (
        <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-6 sm:px-8 py-6 border-b border-slate-100 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl font-bold text-[#1B4332]">
                {latestReport?.structured_report ? "Extracted medications" : "Saved medication reminders"}
              </h2>
              <p className="text-sm text-slate-500 mt-1">
                {latestReport?.structured_report
                  ? `From report date ${formatDateLabel(latestReport.structured_report.report_date)} · ${latestReport.structured_report.report_type || "Latest report"}`
                  : "These reminders were previously saved in Supabase and remain available even without a fresh report."}
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
              <ShieldCheck size={14} />
              Stored per user in Supabase
            </div>
          </div>

          <div className="divide-y divide-slate-100">
            {cards.length > 0 ? (
              cards.map((card) => (
                <motion.div
                  key={card.medicationKey}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-6 sm:p-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-[#1B4332]/10 text-[#1B4332] flex items-center justify-center shrink-0">
                      <Pill size={20} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-bold text-[#1B4332] truncate">{card.medicationName}</h3>
                        <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full bg-slate-50 text-slate-500 border border-slate-100">
                          {card.sourceLabel}
                        </span>
                      </div>
                      <p className="text-sm text-slate-500 mt-1">
                        {card.reportFile ? `Source file: ${card.reportFile}` : "Saved reminder will persist with your account."}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 self-start sm:self-center">
                    <div className={`text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full ${card.reminderEnabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                      {card.reminderEnabled ? "Reminder on" : "Reminder off"}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleToggleReminder(card)}
                      disabled={isSavingKey === card.medicationKey}
                      className={`relative w-14 h-8 rounded-full transition-colors disabled:opacity-60 ${card.reminderEnabled ? "bg-[#2D6A4F]" : "bg-slate-200"}`}
                      aria-label={`Toggle reminder for ${card.medicationName}`}
                    >
                      <span
                        className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow-md transition-all ${card.reminderEnabled ? "left-7" : "left-1"}`}
                      />
                    </button>
                  </div>
                </motion.div>
              ))
            ) : (
              <div className="p-8 sm:p-10 text-center">
                <div className="w-14 h-14 rounded-3xl bg-[#FFB4A2]/10 text-[#FFB4A2] flex items-center justify-center mx-auto mb-4">
                  <Bell size={22} />
                </div>
                <h3 className="text-lg font-bold text-[#1B4332]">No medications found yet</h3>
                <p className="text-sm text-slate-500 mt-2 max-w-xl mx-auto">
                  Upload a report in the Vault so MedSync can extract medications and let you enable reminders here.
                </p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-[2.5rem] border border-slate-100 p-10 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-500 flex items-center justify-center shrink-0">
              <AlertCircle size={18} />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-bold text-[#1B4332]">No report data available</p>
              <p className="text-sm text-slate-500">
                Upload a report first. This page shows medication reminders from the latest extracted report.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}