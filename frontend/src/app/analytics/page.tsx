"use client";
import { motion, AnimatePresence } from "framer-motion";
import { FileText, AlertCircle, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

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

export default function AnalyticsPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [data, setData] = useState<LatestReportResponse | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/reports/latest");
        const json = (await res.json()) as LatestReportResponse;
        setData(json);
      } catch {
        setData({ error: "Failed to load latest report.", structured_report: null });
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  const report = data?.structured_report ?? null;

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-20 px-4 sm:px-6 lg:px-8 pt-8 sm:pt-10 lg:pt-12">
      <AnimatePresence mode="wait">
        <motion.div
          key="overview"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="space-y-8"
        >
          <h1 className="text-4xl font-bold text-[#1B4332]">Health Overview</h1>

          {isLoading ? (
            <div className="bg-white rounded-[2.5rem] border border-slate-100 p-10 flex items-center gap-3 text-slate-500">
              <Loader2 className="animate-spin" size={18} />
              Loading latest report…
            </div>
          ) : data?.structured_report ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white rounded-[2.5rem] border border-slate-100 p-6">
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Patient</p>
                  <p className="text-lg font-bold text-[#1B4332] mt-2">{report?.patient_name || "Unknown"}</p>
                </div>
                <div className="bg-white rounded-[2.5rem] border border-slate-100 p-6">
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Report date</p>
                  <p className="text-lg font-bold text-[#1B4332] mt-2">{report?.report_date || "Unknown"}</p>
                </div>
                <div className="bg-white rounded-[2.5rem] border border-slate-100 p-6">
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Report type</p>
                  <p className="text-lg font-bold text-[#1B4332] mt-2">{report?.report_type || "Unknown"}</p>
                </div>
              </div>

              <div className="bg-white rounded-[2.5rem] border border-slate-100 p-8 space-y-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-[#FFB4A2]/20 text-[#1B4332] flex items-center justify-center">
                    <FileText size={18} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-[#1B4332] truncate">{data.file || "Latest report"}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <section className="space-y-3">
                    <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400">Diagnoses</h2>
                    {report?.diagnoses?.length ? (
                      <ul className="space-y-2">
                        {report.diagnoses.map((d) => (
                          <li key={d} className="text-sm text-slate-700 font-medium bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3">
                            {d}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-slate-500 italic">No diagnoses found in the latest report.</p>
                    )}
                  </section>

                  <section className="space-y-3">
                    <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400">Medications</h2>
                    {report?.medications?.length ? (
                      <ul className="space-y-2">
                        {report.medications.map((m) => (
                          <li key={m} className="text-sm text-slate-700 font-medium bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3">
                            {m}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-slate-500 italic">No medications found in the latest report.</p>
                    )}
                  </section>

                  <section className="space-y-3">
                    <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400">Labs</h2>
                    {report?.lab_results?.length ? (
                      <div className="space-y-2">
                        {report.lab_results.slice(0, 12).map((lab, idx) => (
                          <div key={`${lab.name}-${idx}`} className="bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3">
                            <div className="flex items-start justify-between gap-3">
                              <p className="text-sm font-bold text-[#1B4332]">{lab.name || "Lab"}</p>
                              {lab.flag ? (
                                <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full bg-white border border-slate-200 text-slate-600">
                                  {lab.flag}
                                </span>
                              ) : null}
                            </div>
                            <p className="text-sm text-slate-700 mt-1">
                              {lab.value || "—"} {lab.unit || ""}
                            </p>
                            {lab.reference_range ? (
                              <p className="text-xs text-slate-400 mt-1">Ref: {lab.reference_range}</p>
                            ) : null}
                          </div>
                        ))}
                        {report.lab_results.length > 12 ? (
                          <p className="text-xs text-slate-400">Showing 12 of {report.lab_results.length} lab results.</p>
                        ) : null}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500 italic">No lab results found in the latest report.</p>
                    )}
                  </section>
                </div>

                {report?.doctor_notes ? (
                  <section className="pt-2">
                    <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">Clinical notes</h2>
                    <div className="bg-[#1B4332] text-white rounded-[2.5rem] p-6">
                      <p className="text-sm leading-relaxed text-white/80 whitespace-pre-wrap">{report.doctor_notes}</p>
                    </div>
                  </section>
                ) : null}
              </div>
            </>
          ) : (
            <div className="bg-white rounded-[2.5rem] border border-slate-100 p-10">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-2xl bg-red-50 text-red-500 flex items-center justify-center">
                  <AlertCircle size={18} />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-bold text-[#1B4332]">No recent report data</p>
                  <p className="text-sm text-slate-500">
                    Upload a report in the Vault first. This page shows only extracted data from your latest report.
                  </p>
                  {data?.error ? <p className="text-xs text-slate-400">Details: {data.error}</p> : null}
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}