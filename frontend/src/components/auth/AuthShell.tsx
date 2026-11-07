"use client";
import { motion } from "framer-motion";
import { Heart, ShieldCheck } from "lucide-react";

type AuthShellProps = {
  title: string;
  subtitle: string;
  headline: React.ReactNode;
  blurb: string;
  children: React.ReactNode;
};

/** Two-panel layout shared by the auth pages (brand panel left, form right). */
export default function AuthShell({ title, subtitle, headline, blurb, children }: AuthShellProps) {
  return (
    <div className="fixed inset-0 flex bg-[#FDFDFB] z-100">
      <div className="hidden lg:flex w-1/2 bg-[#1B4332] relative overflow-hidden items-center justify-center p-20">
        <div className="relative z-10 max-w-md space-y-6">
          <div className="w-16 h-16 bg-[#FFB4A2]/20 rounded-2xl flex items-center justify-center text-[#FFB4A2] mb-8">
            <Heart size={40} fill="currentColor" />
          </div>
          <h1 className="text-5xl font-bold text-white tracking-tighter leading-tight">{headline}</h1>
          <p className="text-white/60 text-lg leading-relaxed font-medium">{blurb}</p>
        </div>
        <div className="absolute top-[-20%] left-[-10%] w-150 h-150 bg-[#2D6A4F] rounded-full blur-[150px] opacity-30" />
      </div>

      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 md:p-12 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md space-y-8 py-10"
        >
          <div className="space-y-2">
            <h2 className="text-3xl font-bold text-[#1B4332]">{title}</h2>
            <p className="text-slate-400 text-sm font-medium">{subtitle}</p>
          </div>

          {children}

          <div className="flex items-center gap-2 justify-center opacity-40 pt-4">
            <ShieldCheck size={14} className="text-[#1B4332]" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#1B4332]">
              Private to your account
            </span>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
