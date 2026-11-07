"use client";
import { ArrowRight, Loader2, Mail } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import AuthShell from "@/components/auth/AuthShell";
import { createClient } from "@/lib/supabase";

export default function ForgotPasswordPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const email = new FormData(e.currentTarget).get("email")?.toString().trim();
    if (!email) {
      setError("Enter the email you signed up with.");
      setIsLoading(false);
      return;
    }

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });
    setIsLoading(false);

    // Say the same thing whether or not the account exists, so the form can't be used to probe emails.
    // Only surface failures that are about the request itself (rate limits, outages).
    if (resetError && (resetError.status === 429 || resetError.status === undefined || resetError.status >= 500)) {
      setError(
        resetError.status === 429
          ? "Too many requests. Please wait a few minutes and try again."
          : "We couldn't send the email right now. Please try again shortly."
      );
      return;
    }
    setSent(true);
  };

  return (
    <AuthShell
      title="Reset password"
      subtitle="We'll email you a link to choose a new one."
      headline={
        <>
          Back into <br /> <span className="text-[#FFB4A2]">your vault.</span>
        </>
      }
      blurb="Your reports stay private while you reset access."
    >
      {sent ? (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-sm text-emerald-800">
          If an account exists for that email, a reset link is on its way. It expires after a short while, so use it soon.
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
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
          <button type="submit" disabled={isLoading} className="w-full bg-[#1B4332] text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-all shadow-xl shadow-green-900/10 group disabled:opacity-70 disabled:cursor-not-allowed">
            {isLoading ? (
              <>
                <Loader2 size={18} className="animate-spin" /> Sending...
              </>
            ) : (
              <>
                Send reset link <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
              </>
            )}
          </button>
        </form>
      )}

      <p className="text-center text-sm text-slate-400">
        Remembered it?{" "}
        <Link href="/login" className="text-[#2D6A4F] font-bold hover:underline">
          Sign In
        </Link>
      </p>
    </AuthShell>
  );
}
