"use client";
import { motion } from "framer-motion";
import { User, Mail, Lock, Droplets, ArrowRight, ShieldCheck, Heart, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase";

export default function SignUpPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  const handleSignUp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    
    const formDataObj = new FormData(e.currentTarget);
    const name = formDataObj.get("name")?.toString();
    const email = formDataObj.get("email")?.toString();
    const password = formDataObj.get("password")?.toString();
    const blood_type = formDataObj.get("blood_type")?.toString();

    if (!email || !password || !name) {
      setError("Please fill in all required fields");
      setIsLoading(false);
      return;
    }

    try {
      // Sign up the user with Supabase
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: name,
            blood_type: blood_type || "O+",
          },
        },
      });

      if (signUpError) {
        setError(signUpError.message);
        setIsLoading(false);
        return;
      }

      // Success - redirect to login
      router.push("/login");
    } catch (err) {
      console.error("Sign up error:", err);
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 flex bg-[#FDFDFB] z-100">
      <div className="hidden lg:flex w-1/2 bg-[#1B4332] relative overflow-hidden items-center justify-center p-20">
        <div className="relative z-10 max-w-md space-y-6">
          <div className="w-16 h-16 bg-[#FFB4A2]/20 rounded-2xl flex items-center justify-center text-[#FFB4A2] mb-8">
            <Heart size={40} fill="currentColor" />
          </div>
          <h1 className="text-5xl font-bold text-white tracking-tighter leading-tight">
            Start your <br /> <span className="text-[#FFB4A2]">Health Journey.</span>
          </h1>
          <p className="text-white/60 text-lg leading-relaxed font-medium">
            Join MedSync to centralize your medical records and unlock RAG-powered health insights.
          </p>
        </div>
        <div className="absolute top-[-20%] left-[-10%] w-150 h-150 bg-[#2D6A4F] rounded-full blur-[150px] opacity-30" />
      </div>

      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 md:p-12 overflow-y-auto">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md space-y-8 py-10">
          <div className="space-y-2">
            <h2 className="text-3xl font-bold text-[#1B4332]">Create Account</h2>
            <p className="text-slate-400 text-sm font-medium">Build your encrypted medical identity.</p>
          </div>

          <form onSubmit={handleSignUp} className="space-y-5">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
                <p className="text-red-700 text-sm font-medium">{error}</p>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Full Name</label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                <input required name="name" type="text" placeholder="Enter your name here" className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 pl-12 pr-4 outline-none focus:border-[#FFB4A2] text-sm font-medium" />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Email</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                <input required name="email" type="email" placeholder="name@example.com" className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 pl-12 pr-4 outline-none focus:border-[#FFB4A2] text-sm font-medium" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
               <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Blood Type</label>
                  <div className="relative">
                    <Droplets className="absolute left-4 top-1/2 -translate-y-1/2 text-[#FFB4A2]" size={18} />
                    <select name="blood_type" className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 pl-12 pr-4 outline-none focus:border-[#FFB4A2] appearance-none text-sm font-medium">
                        <option>O+</option><option>A+</option><option>B+</option><option>AB+</option>
                    </select>
                  </div>
               </div>
               <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                    <input required type="password" name="password" placeholder="••••••••" className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 pl-12 pr-4 outline-none focus:border-[#FFB4A2] text-sm font-medium" />
                  </div>
               </div>
            </div>

            <button type="submit" disabled={isLoading} className="w-full bg-[#1B4332] text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-all shadow-xl shadow-green-900/10 group disabled:opacity-70 disabled:cursor-not-allowed">
              {isLoading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Creating Account...
                </>
              ) : (
                <>
                  Create My Vault <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>

          <p className="text-center text-sm text-slate-400">
            Already have an account? <Link href="/login" className="text-[#2D6A4F] font-bold hover:underline">Sign In</Link>
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