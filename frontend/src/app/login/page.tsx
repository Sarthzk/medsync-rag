"use client";
import { motion } from "framer-motion";
import { Mail, Lock, ArrowRight, ShieldCheck, Heart, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const formDataObj = new FormData(e.currentTarget);
    const email = formDataObj.get("email")?.toString();
    const password = formDataObj.get("password")?.toString();

    if (!email || !password) {
      setError("Email and password are required");
      setIsLoading(false);
      return;
    }

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError(signInError.message);
        setIsLoading(false);
        return;
      }

      // Success - redirect to home page
      router.push("/");
    } catch (err) {
      console.error("Login error:", err);
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 flex bg-[#FDFDFB] z-100">
      {/* LEFT SIDE: Brand Identity */}
      <div className="hidden lg:flex w-1/2 bg-[#1B4332] relative overflow-hidden items-center justify-center p-20">
        <div className="relative z-10 max-w-md space-y-6">
          <div className="w-16 h-16 bg-[#FFB4A2]/20 rounded-2xl flex items-center justify-center text-[#FFB4A2] mb-8">
            <Heart size={40} fill="currentColor" />
          </div>
          <h1 className="text-5xl font-bold text-white tracking-tighter leading-tight">
            Welcome Back <br /> <span className="text-[#FFB4A2]">to MedSync.</span>
          </h1>
          <p className="text-white/60 text-lg leading-relaxed font-medium">
            Access your secure medical vault and health insights.
          </p>
        </div>
        <div className="absolute top-[-20%] left-[-10%] w-150 h-150 bg-[#2D6A4F] rounded-full blur-[150px] opacity-30" />
      </div>

      {/* RIGHT SIDE: Login Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 md:p-12 overflow-y-auto">
        <motion.div 
          initial={{ opacity: 0, y: 20 }} 
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md space-y-8 py-10"
        >
          <div className="space-y-2">
            <h2 className="text-3xl font-bold text-[#1B4332]">Sign In</h2>
            <p className="text-slate-400 text-sm font-medium">Access your medical records.</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
                <p className="text-red-700 text-sm font-medium">{error}</p>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Email</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                <input required name="email" type="email" placeholder="name@example.com" className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 pl-12 pr-4 outline-none focus:border-[#FFB4A2] text-sm font-medium" />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Password</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                <input required type="password" name="password" placeholder="••••••••" className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 pl-12 pr-4 outline-none focus:border-[#FFB4A2] text-sm font-medium" />
              </div>
            </div>

            <button type="submit" disabled={isLoading} className="w-full bg-[#1B4332] text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-all shadow-xl shadow-green-900/10 group disabled:opacity-70 disabled:cursor-not-allowed">
              {isLoading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  Sign In <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>

          <p className="text-center text-sm text-slate-400">
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="text-[#2D6A4F] font-bold hover:underline">
              Sign Up
            </Link>
          </p>

          <div className="flex items-center gap-2 justify-center opacity-40 pt-4">
            <ShieldCheck size={14} className="text-[#1B4332]" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#1B4332]">HIPAA Compliant Security</span>
          </div>
        </motion.div>
      </div>
    </div>
  );
}