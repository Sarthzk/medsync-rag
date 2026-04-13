"use client";
import { Activity, Heart, Moon, Footprints, ArrowUpRight, Plus } from "lucide-react";
import { motion } from "framer-motion";

const vitalCards = [
  { 
    title: "Heart Rate", 
    value: "72", 
    unit: "bpm", 
    status: "Normal", 
    icon: <Heart size={24} />, 
    color: "bg-[#FFB4A2]/10", 
    textColor: "text-[#FFB4A2]" 
  },
  { 
    title: "Sleep Quality", 
    value: "7h 20m", 
    unit: "Restorative", 
    status: "Good", 
    icon: <Moon size={24} />, 
    color: "bg-[#2D6A4F]/10", 
    textColor: "text-[#2D6A4F]" 
  },
  { 
    title: "Daily Steps", 
    value: "8,432", 
    unit: "steps", 
    status: "+12% vs yesterday", 
    icon: <Footprints size={24} />, 
    color: "bg-[#1B4332]/5", 
    textColor: "text-[#1B4332]" 
  },
];

export default function VitalsPage() {
  return (
    <div className="max-w-6xl mx-auto space-y-10">
      {/* Header */}
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-bold text-[#1B4332] tracking-tight">Your Vitals</h1>
          <p className="text-slate-500 mt-2">Real-time health insights synced from your devices.</p>
        </div>
        <button className="bg-white border border-slate-200 text-[#1B4332] px-6 py-3 rounded-full flex items-center gap-2 font-bold hover:bg-slate-50 transition-all shadow-sm">
          <Plus size={18} /> Log Data
        </button>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {vitalCards.map((card, index) => (
          <motion.div 
            key={card.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-md transition-shadow"
          >
            <div className={`w-14 h-14 ${card.color} ${card.textColor} rounded-2xl flex items-center justify-center mb-6`}>
              {card.icon}
            </div>
            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">{card.title}</p>
            <div className="flex items-baseline gap-2 mt-2">
              <h2 className="text-4xl font-bold text-[#1B4332]">{card.value}</h2>
              <span className="text-slate-400 font-medium text-sm">{card.unit}</span>
            </div>
            <div className="mt-6 flex items-center gap-2 text-[11px] font-bold text-[#2D6A4F] bg-[#2D6A4F]/5 w-fit px-3 py-1 rounded-full">
              <ArrowUpRight size={12} /> {card.status}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Secondary Row: Activity Chart Placeholder */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[#1B4332] text-white p-10 rounded-[3rem] relative overflow-hidden">
          <div className="relative z-10">
            <h3 className="text-2xl font-bold mb-2">Weekly Activity</h3>
            <p className="text-white/60 text-sm mb-8">You've hit your movement goal 5 days this week.</p>
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

        <div className="bg-white border border-slate-100 p-10 rounded-[3rem] flex flex-col justify-center text-center space-y-4">
          <div className="w-20 h-20 bg-[#FFB4A2]/10 text-[#FFB4A2] rounded-full flex items-center justify-center mx-auto">
            <Activity size={32} />
          </div>
          <h3 className="text-xl font-bold text-[#1B4332]">AI Health Suggestion</h3>
          <p className="text-slate-500 text-sm leading-relaxed italic">
            "Your resting heart rate has been 5% lower this week. This suggests improved cardiovascular recovery. Keep up the 20-minute morning walks!"
          </p>
        </div>
      </div>
    </div>
  );
}