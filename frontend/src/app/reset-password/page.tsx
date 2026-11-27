"use client";
import { ArrowRight, Loader2, Lock } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import AuthShell from "@/components/auth/AuthShell";
import { createClient } from "@/lib/supabase";

const MIN_PASSWORD_LENGTH = 8;

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = createClient();
  // null = checking; the email link signs the user in (via /auth/callback) before landing here.
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setHasSession(Boolean(data.user)));
  }, [supabase]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    const form = new FormData(e.currentTarget);
    const password = form.get("password")?.toString() ?? "";
    const confirm = form.get("confirm")?.toString() ?? "";

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError("The two passwords don't match.");
      return;
    }

    setIsLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setError(updateError.message);
      setIsLoading(false);
      return;
    }
    router.replace("/");
    router.refresh();
  };

  return (
    <AuthShell
      title="Choose a new password"
      subtitle="Pick something you don't use anywhere else."
      headline={
        <>
          Almost <br /> <span className="text-[#FFB4A2]">there.</span>
        </>
      }
      blurb="Once saved, you're signed in and your vault is right where you left it."
    >
      {hasSession === false ? (
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-800">
            This reset link is invalid or has expired. Request a new one to continue.
          </div>
          <Link href="/forgot-password" className="block w-full text-center bg-[#1B4332] text-white py-4 rounded-2xl font-bold hover:opacity-90 transition-all">
            Request a new link
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
              <p className="text-red-700 text-sm font-medium">{error}</p>
            </div>
          )}
          {(["password", "confirm"] as const).map((name) => (
            <div key={name} className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">
                {name === "password" ? "New password" : "Confirm password"}
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                <input required type="password" name={name} minLength={MIN_PASSWORD_LENGTH} autoComplete="new-password" placeholder="••••••••" className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 pl-12 pr-4 outline-none focus:border-[#FFB4A2] text-sm font-medium" />
              </div>
            </div>
          ))}
          <button type="submit" disabled={isLoading || hasSession === null} className="w-full bg-[#1B4332] text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-all shadow-xl shadow-green-900/10 group disabled:opacity-70 disabled:cursor-not-allowed">
            {isLoading ? (
              <>
                <Loader2 size={18} className="animate-spin" /> Saving...
              </>
            ) : (
              <>
                Save password <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
              </>
            )}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
