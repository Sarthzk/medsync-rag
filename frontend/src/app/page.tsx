"use client";
import { motion } from "framer-motion";
import { MessageSquare, FolderHeart, Activity, ShieldCheck, ArrowRight } from "lucide-react";
import Link from "next/link";
import QuickScan from "@/components/layout/QuickScan"; // Import the new component

export default function HomePage() {
  return (
    <div className="max-w-6xl mx-auto space-y-10 pb-20 px-4 sm:px-6 lg:px-8">
      
      {/* 1. Top Section: Hero + Quick Scan */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 lg:gap-8">
        {/* Welcome Hero (Takes 3 columns) */}
        <section className="lg:col-span-3 flex flex-col justify-center gap-6 bg-[#FDFDFB] p-8 sm:p-10 lg:p-12 rounded-[3.5rem] border border-slate-100 shadow-sm relative overflow-hidden">
          <div className="relative z-10 space-y-4">
            <h1 className="text-5xl font-bold text-[#1B4332] tracking-tight leading-tight">
              Your Health, <br /> <span className="text-[#2D6A4F]">Simplified.</span>
            </h1>
            <p className="text-slate-500 max-w-xs text-sm leading-relaxed">
              Analyze records, track vitals, and consult your private medical AI.
            </p>
          </div>
         <div className="absolute right-[-10%] bottom-[-10%] opacity-10 rotate-12">
  <ShieldCheck size={280} className="text-[#1B4332]" />
</div>
        </section>

        {/* Quick Scan (Takes 2 columns) */}
        <div className="lg:col-span-2">
          <QuickScan />
        </div>
      </div>

      {/* 2. Main Navigation Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5 lg:gap-6">
        {[
          { title: "MedSync AI", desc: "Instant RAG-based medical consultation.", icon: <MessageSquare size={28} />, href: "/chat", color: "bg-[#1B4332] text-white" },
          { title: "Health Vault", desc: "Your encrypted document library.", icon: <FolderHeart size={28} />, href: "/vault", color: "bg-white text-[#1B4332]" },
          { title: "Analytics", desc: "Deep health trends & issue clusters.", icon: <Activity size={28} />, href: "/analytics", color: "bg-[#FFB4A2]/20 text-[#1B4332]" },
        ].map((action, i) => (
          <Link href={action.href} key={i}>
            <motion.div whileHover={{ y: -8 }} className={`${action.color} p-8 sm:p-9 lg:p-10 rounded-[3rem] h-full flex flex-col justify-between border border-slate-100 shadow-sm hover:shadow-2xl transition-all`}>
              <div className="space-y-6">
                <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center">{action.icon}</div>
                <div>
                  <h3 className="text-2xl font-bold mb-2">{action.title}</h3>
                  <p className="text-xs opacity-60 leading-relaxed font-medium">{action.desc}</p>
                </div>
              </div>
              <div className="mt-8 flex items-center gap-2 font-bold text-[10px] uppercase tracking-widest">
                Launch <ArrowRight size={14} />
              </div>
            </motion.div>
          </Link>
        ))}
      </div>
    </div>
  );
}