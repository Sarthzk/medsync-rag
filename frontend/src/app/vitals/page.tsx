"use client";
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

const getVitalCards = (vitalLogs: VitalLog[]) => {
  // Get the most recent valid values for each metric
  const recentHeartRate = vitalLogs.find(log => log.heart_rate !== null)?.heart_rate || 72;
  const recentSleepQuality = vitalLogs.find(log => log.sleep_quality !== null)?.sleep_quality || 7.33;
  const recentSteps = vitalLogs.find(log => log.daily_steps !== null)?.daily_steps || 8432;
  
  // Format sleep quality
  const sleepHours = Math.floor(recentSleepQuality);
  const sleepMinutes = Math.round((recentSleepQuality - sleepHours) * 60);
  const sleepFormatted = `${sleepHours}h ${sleepMinutes}m`;

  return [
    { 
      title: "Heart Rate", 
      value: recentHeartRate.toString(), 
      unit: "bpm", 
      status: recentHeartRate < 100 ? "Normal" : "Elevated", 
      icon: <Heart size={24} />, 
      color: "bg-[#FFB4A2]/10", 
      textColor: "text-[#FFB4A2]" 
    },
    { 
      title: "Sleep Quality", 
      value: sleepFormatted, 
      unit: "Restorative", 
      status: recentSleepQuality >= 7 ? "Good" : "Fair", 
      icon: <Moon size={24} />, 
      color: "bg-[#2D6A4F]/10", 
      textColor: "text-[#2D6A4F]" 
    },
    { 
      title: "Daily Steps", 
      value: recentSteps.toLocaleString(), 
      unit: "steps", 
      status: recentSteps >= 8000 ? "Active" : "Moderate", 
      icon: <Footprints size={24} />, 
      color: "bg-[#1B4332]/5", 
      textColor: "text-[#1B4332]" 
    },
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
      const res = await fetch("/api/vitals");
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
      if (!payload.heart_rate && !payload.sleep_quality && !payload.daily_steps) {
        alert("Please enter at least one vital measurement");
        setLoading(false);
        return;
      }

      const res = await fetch("/api/vitals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("Failed to log vital");

      // Refetch vitals to get them in correct order from backend
      await fetchVitalLogs();
      
      setFormData({ heart_rate: "", sleep_quality: "", daily_steps: "" });
      setShowLogModal(false);
    } catch (err) {
      console.error("Error logging vital:", err);
      alert("Failed to log vital");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteLog = async (id: string) => {
    try {
      const res = await fetch(`/api/vitals?id=${id}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error("Failed to delete log");

      setVitalLogs(vitalLogs.filter((log) => log.id !== id));
    } catch (err) {
      console.error("Error deleting log:", err);
      alert("Failed to delete log");
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 sm:space-y-10 px-4 sm:px-6 lg:px-8 pt-4 sm:pt-8 lg:pt-12 pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-[#1B4332] tracking-tight">Your Vitals</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-2">Real-time health insights synced from your devices.</p>
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
            className="bg-white rounded-t-[2rem] sm:rounded-[2.5rem] p-6 sm:p-8 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto"
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
                  min="40"
                  max="200"
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
                  Sleep Quality (hours)
                </label>
                <input
                  type="number"
                  min="0"
                  max="12"
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
            <p className="text-white/60 text-xs sm:text-sm mb-4 sm:mb-8">You've hit your movement goal 5 days this week.</p>
            <div className="flex items-end gap-3 h-32">
              {[40, 70, 45, 90, 65, 80, 50].map((height, i) => (
                <div 
                  key={i} 
                  className="flex-1 bg-white/20 rounded-t-lg hover:bg-[#FFB4A2] transition-all cursor-pointer" 
                  style={{ height: `${height}%` }}
                />
              ))}
            </div>
            <div className="flex justify-between mt-4 text-[10px] font-bold text-white/40 uppercase tracking-widest">
              <span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span>
            </div>
          </div>
          {/* Decorative Pattern */}
          <div className="absolute top-[-20%] right-[-10%] w-64 h-64 bg-white/5 rounded-full blur-3xl" />
        </div>

        <div className="bg-white border border-slate-100 p-6 sm:p-8 lg:p-10 rounded-2xl sm:rounded-[2.5rem] lg:rounded-[3rem] flex flex-col justify-center text-center space-y-4">
          <div className="w-14 h-14 sm:w-16 sm:h-16 lg:w-20 lg:h-20 bg-[#FFB4A2]/10 text-[#FFB4A2] rounded-full flex items-center justify-center mx-auto">
            <Activity size={24} />
          </div>
          <h3 className="text-base sm:text-lg lg:text-xl font-bold text-[#1B4332]">AI Health Suggestion</h3>
          <p className="text-slate-500 text-xs sm:text-sm leading-relaxed italic">
            "Your resting heart rate has been 5% lower this week. This suggests improved cardiovascular recovery. Keep up the 20-minute morning walks!"
          </p>
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
                      {log.heart_rate && (
                        <span className="text-[10px] sm:text-xs bg-[#FFB4A2]/20 text-[#FF6B35] px-2 sm:px-3 py-1 rounded-full font-medium flex items-center gap-1 sm:gap-2 whitespace-nowrap">
                          <Heart size={10} /> {log.heart_rate} bpm
                        </span>
                      )}
                      {log.sleep_quality && (
                        <span className="text-[10px] sm:text-xs bg-[#2D6A4F]/20 text-[#2D6A4F] px-2 sm:px-3 py-1 rounded-full font-medium flex items-center gap-1 sm:gap-2 whitespace-nowrap">
                          <Moon size={10} /> {log.sleep_quality}h
                        </span>
                      )}
                      {log.daily_steps && (
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
            <p className="text-xs sm:text-sm text-slate-500">No logged vitals yet. Start by clicking "Log Data" above.</p>
          </div>
        )}
      </div>
    </div>
  );
}