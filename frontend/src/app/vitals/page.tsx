"use client";
import { apiFetch, readApiError } from "@/lib/api";
import { Activity, Heart, Moon, Footprints, ArrowUpRight, Plus, X, Trash2 } from "lucide-react";
import { motion } from "framer-motion";
import { useState, useEffect } from "react";

interface VitalLog {
  id: string;
  heart_rate: number | null;
  sleep_quality: number | null;
  daily_steps: number | null;
  date: string;
  timestamp: number;
}

interface WeeklyActivityPoint {
  dayLabel: string;
  value: number | null;
  displayValue: string;
  unit: string;
  height: number;
}

const isSet = (value: number | null | undefined): value is number => value !== null && value !== undefined;

const formatSleep = (hours: number) => {
  const whole = Math.floor(hours);
  const minutes = Math.round((hours - whole) * 60);
  return `${whole}h ${minutes}m`;
};

const getVitalCards = (vitalLogs: VitalLog[]) => {
  // Most recent logged value for each metric (logs arrive newest first).
  const recentHeartRate = vitalLogs.find((log) => isSet(log.heart_rate))?.heart_rate ?? null;
  const recentSleep = vitalLogs.find((log) => isSet(log.sleep_quality))?.sleep_quality ?? null;
  const recentSteps = vitalLogs.find((log) => isSet(log.daily_steps))?.daily_steps ?? null;

  return [
    {
      title: "Heart Rate",
      value: isSet(recentHeartRate) ? recentHeartRate.toString() : "--",
      unit: "bpm",
      status: !isSet(recentHeartRate)
        ? "No data"
        : recentHeartRate >= 60 && recentHeartRate <= 100
        ? "Typical resting range"
        : "Outside typical resting range",
      icon: <Heart size={24} />,
      color: "bg-[#FFB4A2]/10",
      textColor: "text-[#FFB4A2]",
    },
    {
      title: "Sleep",
      value: isSet(recentSleep) ? formatSleep(recentSleep) : "--",
      unit: "last logged",
      status: !isSet(recentSleep) ? "No data" : recentSleep >= 7 ? "7h or more" : "Under 7h",
      icon: <Moon size={24} />,
      color: "bg-[#2D6A4F]/10",
      textColor: "text-[#2D6A4F]",
    },
    {
      title: "Daily Steps",
      value: isSet(recentSteps) ? recentSteps.toLocaleString() : "--",
      unit: "steps",
      status: !isSet(recentSteps) ? "No data" : recentSteps >= 8000 ? "Active" : "Moderate",
      icon: <Footprints size={24} />,
      color: "bg-[#1B4332]/5",
      textColor: "text-[#1B4332]",
    },
  ];
};

const localDayKey = (date: Date) =>
  `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;

/** Steps for each of the last 7 calendar days (today last); latest entry per day wins. */
const getWeeklyActivityData = (vitalLogs: VitalLog[]): WeeklyActivityPoint[] => {
  const stepsByDay = new Map<string, number>();
  // Logs are newest first, so the first value seen for a day is its latest entry.
  for (const log of vitalLogs) {
    if (!isSet(log.daily_steps)) continue;
    const key = localDayKey(new Date(log.timestamp));
    if (!stepsByDay.has(key)) stepsByDay.set(key, log.daily_steps);
  }

  const days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (6 - i));
    return date;
  });
  const values = days.map((day) => stepsByDay.get(localDayKey(day)) ?? null);
  const maxValue = Math.max(0, ...values.filter(isSet));

  return days.map((day, i) => {
    const value = values[i];
    const dayLabel = day.toLocaleDateString([], { weekday: "short" });
    if (!isSet(value)) {
      return { dayLabel, value: null, displayValue: "No data", unit: "", height: 8 };
    }
    return {
      dayLabel,
      value,
      displayValue: value.toLocaleString(),
      unit: "steps",
      height: maxValue > 0 ? Math.max(12, (value / maxValue) * 100) : 12,
    };
  });
};

const average = (values: number[]) =>
  values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null;

/** Averages over entries logged in the last 7 days. */
const getWeeklyAverages = (vitalLogs: VitalLog[]) => {
  const since = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recent = vitalLogs.filter((log) => log.timestamp >= since);
  const heartRate = average(recent.map((l) => l.heart_rate).filter(isSet));
  const sleep = average(recent.map((l) => l.sleep_quality).filter(isSet));
  const steps = average(recent.map((l) => l.daily_steps).filter(isSet));
  return [
    { label: "Heart rate", value: isSet(heartRate) ? `${Math.round(heartRate)} bpm` : "—" },
    { label: "Sleep", value: isSet(sleep) ? formatSleep(sleep) : "—" },
    { label: "Steps", value: isSet(steps) ? Math.round(steps).toLocaleString() : "—" },
  ];
};

export default function VitalsPage() {
  const [showLogModal, setShowLogModal] = useState(false);
  const [vitalLogs, setVitalLogs] = useState<VitalLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    heart_rate: "",
    sleep_quality: "",
    daily_steps: "",
  });

  // Fetch vital logs on mount
  useEffect(() => {
    fetchVitalLogs();
  }, []);

  const fetchVitalLogs = async () => {
    try {
      const res = await apiFetch("/api/vitals");
      if (res.ok) {
        const data = await res.json();
        setVitalLogs(data.logs || []);
      }
    } catch (err) {
      console.error("Failed to fetch vital logs:", err);
    }
  };

  const handleLogVital = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const payload = {
        heart_rate: formData.heart_rate ? parseInt(formData.heart_rate) : null,
        sleep_quality: formData.sleep_quality ? parseFloat(formData.sleep_quality) : null,
        daily_steps: formData.daily_steps ? parseInt(formData.daily_steps) : null,
      };

      // Ensure at least one value is provided
      if (!isSet(payload.heart_rate) && !isSet(payload.sleep_quality) && !isSet(payload.daily_steps)) {
        alert("Please enter at least one vital measurement");
        setLoading(false);
        return;
      }

      const res = await apiFetch("/api/vitals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error(await readApiError(res, "Failed to log vital"));

      // Refetch vitals to get them in correct order from backend
      await fetchVitalLogs();
      
      setFormData({ heart_rate: "", sleep_quality: "", daily_steps: "" });
      setShowLogModal(false);
    } catch (err) {
      console.error("Error logging vital:", err);
      alert(err instanceof Error ? err.message : "Failed to log vital");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteLog = async (id: string) => {
    try {
      const res = await apiFetch(`/api/vitals/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error("Failed to delete log");

      setVitalLogs(vitalLogs.filter((log) => log.id !== id));
    } catch (err) {
      console.error("Error deleting log:", err);
      alert("Failed to delete log");
    }
  };

  const weeklyActivityData = getWeeklyActivityData(vitalLogs);
  const hasWeeklyActivity = weeklyActivityData.some((point) => point.value !== null);
  const weeklyAverages = getWeeklyAverages(vitalLogs);

  return (
    <div className="max-w-6xl mx-auto space-y-8 sm:space-y-10 px-4 sm:px-6 lg:px-8 pt-4 sm:pt-8 lg:pt-12 pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-[#1B4332] tracking-tight">Your Vitals</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-2">Log your daily vitals and see how they trend over the week.</p>
        </div>
        <button 
          onClick={() => setShowLogModal(true)}
          className="w-full sm:w-auto bg-white border border-slate-200 text-[#1B4332] px-4 sm:px-6 py-3 rounded-full flex items-center justify-center sm:justify-start gap-2 font-bold hover:bg-slate-50 transition-all shadow-sm text-sm sm:text-base"
        >
          <Plus size={18} /> Log Data
        </button>
      </div>

      {/* Log Modal */}
      {showLogModal && (
        <div className="fixed inset-0 bg-black/50 z-200 flex items-end sm:items-center justify-center p-4">
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            className="bg-white rounded-t-4xl sm:rounded-[2.5rem] p-6 sm:p-8 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto"
          >
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl sm:text-2xl font-bold text-[#1B4332]">Log Your Vitals</h2>
              <button
                onClick={() => setShowLogModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleLogVital} className="space-y-4 sm:space-y-5">
              {/* Heart Rate Input */}
              <div>
                <label className="block text-xs sm:text-sm font-semibold text-[#1B4332] mb-2">
                  <Heart size={14} className="inline mr-2" />
                  Heart Rate (bpm)
                </label>
                <input
                  type="number"
                  min="20"
                  max="250"
                  value={formData.heart_rate}
                  onChange={(e) => setFormData({ ...formData, heart_rate: e.target.value })}
                  placeholder="e.g., 72"
                  className="w-full px-3 sm:px-4 py-3 text-base border border-slate-200 rounded-lg sm:rounded-xl focus:outline-none focus:border-[#FFB4A2] focus:ring-2 focus:ring-[#FFB4A2]/20"
                />
              </div>

              {/* Sleep Quality Input */}
              <div>
                <label className="block text-xs sm:text-sm font-semibold text-[#1B4332] mb-2">
                  <Moon size={14} className="inline mr-2" />
                  Sleep (hours)
                </label>
                <input
                  type="number"
                  min="0"
                  max="24"
                  step="0.5"
                  value={formData.sleep_quality}
                  onChange={(e) => setFormData({ ...formData, sleep_quality: e.target.value })}
                  placeholder="e.g., 7.5"
                  className="w-full px-3 sm:px-4 py-3 text-base border border-slate-200 rounded-lg sm:rounded-xl focus:outline-none focus:border-[#2D6A4F] focus:ring-2 focus:ring-[#2D6A4F]/20"
                />
              </div>

              {/* Daily Steps Input */}
              <div>
                <label className="block text-xs sm:text-sm font-semibold text-[#1B4332] mb-2">
                  <Footprints size={14} className="inline mr-2" />
                  Daily Steps
                </label>
                <input
                  type="number"
                  min="0"
                  max="100000"
                  value={formData.daily_steps}
                  onChange={(e) => setFormData({ ...formData, daily_steps: e.target.value })}
                  placeholder="e.g., 8432"
                  className="w-full px-3 sm:px-4 py-3 text-base border border-slate-200 rounded-lg sm:rounded-xl focus:outline-none focus:border-[#1B4332] focus:ring-2 focus:ring-[#1B4332]/20"
                />
              </div>

              <div className="flex gap-3 pt-2 sm:pt-4">
                <button
                  type="button"
                  onClick={() => setShowLogModal(false)}
                  className="flex-1 py-3 bg-slate-100 text-[#1B4332] rounded-lg sm:rounded-xl font-bold text-sm sm:text-base hover:bg-slate-200 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 py-3 bg-[#1B4332] text-white rounded-lg sm:rounded-xl font-bold text-sm sm:text-base hover:opacity-90 disabled:opacity-50 transition-all"
                >
                  {loading ? "Logging..." : "Log Vital"}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        {getVitalCards(vitalLogs).map((card, index) => (
          <motion.div 
            key={card.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="bg-white p-4 sm:p-6 lg:p-8 rounded-2xl sm:rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-md transition-shadow"
          >
            <div className={`w-10 sm:w-12 lg:w-14 h-10 sm:h-12 lg:h-14 ${card.color} ${card.textColor} rounded-xl sm:rounded-2xl flex items-center justify-center mb-4 sm:mb-6`}>
              {card.icon}
            </div>
            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">{card.title}</p>
            <div className="flex items-baseline gap-2 mt-2">
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-[#1B4332]">{card.value}</h2>
              <span className="text-slate-400 font-medium text-xs sm:text-sm">{card.unit}</span>
            </div>
            <div className="mt-6 flex items-center gap-2 text-[11px] font-bold text-[#2D6A4F] bg-[#2D6A4F]/5 w-fit px-3 py-1 rounded-full">
              <ArrowUpRight size={12} /> {card.status}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Secondary Row: Activity Chart Placeholder */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <div className="bg-[#1B4332] text-white p-6 sm:p-8 lg:p-10 rounded-2xl sm:rounded-[2.5rem] lg:rounded-[3rem] relative overflow-hidden">
          <div className="relative z-10">
            <h3 className="text-lg sm:text-2xl font-bold mb-2">Weekly Activity</h3>
            <p className="text-white/60 text-xs sm:text-sm mb-4 sm:mb-8">
              {hasWeeklyActivity
                ? "Daily steps over the last 7 days."
                : "No steps logged in the last 7 days. Log vitals to populate this chart."}
            </p>
            <div className="flex items-end gap-3 h-36">
              {weeklyActivityData.map((point) => (
                <div key={point.dayLabel} className="flex-1 flex flex-col items-center gap-2 min-w-0">
                  <div className="h-28 w-full flex items-end">
                    <div
                      className={`w-full rounded-t-lg transition-all ${point.value !== null ? "bg-white/20 hover:bg-[#FFB4A2]" : "bg-white/10"}`}
                      style={{ height: `${point.height}%` }}
                      title={point.value !== null ? `${point.dayLabel}: ${point.displayValue} ${point.unit}` : `${point.dayLabel}: No data`}
                    />
                  </div>
                  <div className="text-center">
                    <div className="text-[10px] font-bold text-white/40 uppercase tracking-widest">{point.dayLabel}</div>
                    <div className="text-[10px] text-white/70 mt-1">
                      {point.value !== null ? `${point.displayValue} ${point.unit}` : point.displayValue}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          {/* Decorative Pattern */}
          <div className="absolute top-[-20%] right-[-10%] w-64 h-64 bg-white/5 rounded-full blur-3xl" />
        </div>

        <div className="bg-white border border-slate-100 p-6 sm:p-8 lg:p-10 rounded-2xl sm:rounded-[2.5rem] lg:rounded-[3rem] flex flex-col justify-center text-center space-y-4">
          <div className="w-14 h-14 sm:w-16 sm:h-16 lg:w-20 lg:h-20 bg-[#FFB4A2]/10 text-[#FFB4A2] rounded-full flex items-center justify-center mx-auto">
            <Activity size={24} />
          </div>
          <h3 className="text-base sm:text-lg lg:text-xl font-bold text-[#1B4332]">7-Day Averages</h3>
          <div className="grid grid-cols-3 gap-3">
            {weeklyAverages.map((item) => (
              <div key={item.label} className="bg-slate-50 rounded-2xl p-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{item.label}</p>
                <p className="text-sm sm:text-base font-bold text-[#1B4332] mt-1">{item.value}</p>
              </div>
            ))}
          </div>
          <p className="text-[10px] sm:text-xs text-slate-400">Based on entries you logged in the last 7 days.</p>
        </div>
      </div>

      {/* Vital Logs History */}
      <div className="bg-white border border-slate-100 rounded-2xl sm:rounded-[2.5rem] p-4 sm:p-6 lg:p-8">
        <h2 className="text-lg sm:text-2xl font-bold text-[#1B4332] mb-4 sm:mb-6">Logged Vitals History</h2>
        
        {vitalLogs.length > 0 ? (
          <div className="space-y-2 sm:space-y-3">
            {vitalLogs.map((log) => {
              const date = new Date(log.timestamp);
              const dateStr = date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
              const timeStr = date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
              
              return (
                <motion.div
                  key={log.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="p-3 sm:p-4 bg-slate-50 rounded-lg sm:rounded-xl border border-slate-100 hover:border-slate-200 transition-all flex items-center justify-between group"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs sm:text-sm font-semibold text-[#1B4332]">{dateStr} at {timeStr}</p>
                    <div className="flex flex-wrap gap-2 sm:gap-3 mt-2 sm:mt-3">
                      {isSet(log.heart_rate) && (
                        <span className="text-[10px] sm:text-xs bg-[#FFB4A2]/20 text-[#FF6B35] px-2 sm:px-3 py-1 rounded-full font-medium flex items-center gap-1 sm:gap-2 whitespace-nowrap">
                          <Heart size={10} /> {log.heart_rate} bpm
                        </span>
                      )}
                      {isSet(log.sleep_quality) && (
                        <span className="text-[10px] sm:text-xs bg-[#2D6A4F]/20 text-[#2D6A4F] px-2 sm:px-3 py-1 rounded-full font-medium flex items-center gap-1 sm:gap-2 whitespace-nowrap">
                          <Moon size={10} /> {log.sleep_quality}h
                        </span>
                      )}
                      {isSet(log.daily_steps) && (
                        <span className="text-[10px] sm:text-xs bg-[#1B4332]/20 text-[#1B4332] px-2 sm:px-3 py-1 rounded-full font-medium flex items-center gap-1 sm:gap-2 whitespace-nowrap">
                          <Footprints size={10} /> {log.daily_steps.toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteLog(log.id)}
                    className="ml-2 sm:ml-4 text-slate-400 hover:text-red-500 opacity-70 sm:opacity-0 sm:group-hover:opacity-100 transition-all shrink-0 p-1"
                    title="Delete log"
                  >
                    <Trash2 size={16} />
                  </button>
                </motion.div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8 sm:py-12">
            <div className="w-12 sm:w-16 h-12 sm:h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Activity size={20} className="text-slate-400" />
            </div>
            <p className="text-xs sm:text-sm text-slate-500">No logged vitals yet. Start by clicking &quot;Log Data&quot; above.</p>
          </div>
        )}
      </div>
    </div>
  );
}
