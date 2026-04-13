"use client";
import { motion } from "framer-motion";
import { Bell, ShieldCheck, Eye, Moon, Globe, Database, Trash2, Smartphone } from "lucide-react";
import { useState } from "react";

export default function SettingsPage() {
  const [notifications, setNotifications] = useState(true);
  const [aiAnalysis, setAiAnalysis] = useState(true);

  const SettingRow = ({ icon, title, desc, action }: any) => (
    <div className="flex items-center justify-between p-6 hover:bg-[#FDFDFB] transition-colors group">
      <div className="flex items-center gap-5">
        <div className="p-3 bg-[#FFB4A2]/10 text-[#FFB4A2] rounded-2xl group-hover:scale-110 transition-transform">
          {icon}
        </div>
        <div>
          <h4 className="text-sm font-bold text-[#1B4332]">{title}</h4>
          <p className="text-xs text-slate-400">{desc}</p>
        </div>
      </div>
      {action}
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto space-y-10 pb-20">
      <div>
        <h1 className="text-4xl font-bold text-[#1B4332] tracking-tight">Settings</h1>
        <p className="text-slate-500 mt-2">Manage your health data privacy and app preferences.</p>
      </div>

      {/* 1. AI & Privacy Section (The RAG Core) */}
      <section className="space-y-4">
        <h3 className="text-xs font-bold text-[#1B4332] uppercase tracking-[0.2em] ml-4">AI & Data Privacy</h3>
        <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
          <SettingRow 
            icon={<ShieldCheck size={20} />}
            title="AI Document Analysis"
            desc="Allow MedSync AI to index your Health Vault for RAG responses."
            action={
              <button 
                onClick={() => setAiAnalysis(!aiAnalysis)}
                className={`w-12 h-6 rounded-full transition-colors relative ${aiAnalysis ? 'bg-[#2D6A4F]' : 'bg-slate-200'}`}
              >
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${aiAnalysis ? 'left-7' : 'left-1'}`} />
              </button>
            }
          />
          <SettingRow 
            icon={<Eye size={20} />}
            title="Privacy Mode"
            desc="Hide sensitive vitals from the Overview dashboard."
            action={<button className="text-[10px] font-bold text-[#1B4332] underline uppercase">Manage</button>}
          />
          <SettingRow 
            icon={<Database size={20} />}
            title="Data Export"
            desc="Download all your medical records and AI insights as a ZIP."
            action={<button className="text-[10px] font-bold text-[#1B4332] underline uppercase">Export</button>}
          />
        </div>
      </section>

      {/* 2. App Preferences */}
      <section className="space-y-4">
        <h3 className="text-xs font-bold text-[#1B4332] uppercase tracking-[0.2em] ml-4">App Preferences</h3>
        <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
          <SettingRow 
            icon={<Bell size={20} />}
            title="Health Reminders"
            desc="Get notified about upcoming checkups and medicine times."
            action={
              <button 
                onClick={() => setNotifications(!notifications)}
                className={`w-12 h-6 rounded-full transition-colors relative ${notifications ? 'bg-[#2D6A4F]' : 'bg-slate-200'}`}
              >
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${notifications ? 'left-7' : 'left-1'}`} />
              </button>
            }
          />
          <SettingRow 
            icon={<Smartphone size={20} />}
            title="Sync Wearables"
            desc="Connect Apple Health, Google Fit, or Oura Ring."
            action={<button className="bg-[#1B4332] text-white px-4 py-1.5 rounded-full text-[10px] font-bold uppercase">Connect</button>}
          />
        </div>
      </section>

      {/* 3. Danger Zone */}
      <section className="space-y-4">
        <h3 className="text-xs font-bold text-red-500 uppercase tracking-[0.2em] ml-4">Danger Zone</h3>
        <div className="bg-red-50 rounded-[2.5rem] border border-red-100 p-2 overflow-hidden">
          <SettingRow 
            icon={<Trash2 size={20} className="text-red-500" />}
            title="Delete Account"
            desc="Permanently remove your data and medical history from MedSync."
            action={<button className="text-red-500 font-bold text-xs hover:underline">Delete Forever</button>}
          />
        </div>
      </section>
    </div>
  );
}