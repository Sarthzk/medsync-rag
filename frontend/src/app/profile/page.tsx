"use client";
import { useEffect, useMemo, useState } from "react";
import { Calendar, Check, Droplets, KeyRound, Loader2, Shield, User } from "lucide-react";
import { createClient } from "@/lib/supabase";

const BLOOD_TYPES = ["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"];
const MIN_PASSWORD_LENGTH = 8;
const inputClass =
  "w-full bg-slate-50 border border-slate-100 rounded-2xl py-3 px-4 outline-none focus:border-[#FFB4A2] text-sm font-medium";
const labelClass = "text-[10px] font-bold text-slate-400 uppercase tracking-widest";

type Notice = { kind: "ok" | "error"; text: string } | null;

function NoticeBanner({ notice }: { notice: Notice }) {
  if (!notice) return null;
  const tone =
    notice.kind === "ok"
      ? "bg-emerald-50 border-emerald-200 text-emerald-800"
      : "bg-red-50 border-red-200 text-red-700";
  return <div className={`border rounded-2xl p-4 text-sm font-medium ${tone}`}>{notice.text}</div>;
}

export default function ProfilePage() {
  const supabase = useMemo(() => createClient(), []);
  const timeZones = useMemo(() => {
    const zones = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
    return zones.length ? zones : ["Asia/Kolkata", "UTC"];
  }, []);

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [memberSince, setMemberSince] = useState("");
  const [fullName, setFullName] = useState("");
  const [bloodType, setBloodType] = useState("");
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [userId, setUserId] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [profileNotice, setProfileNotice] = useState<Notice>(null);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordNotice, setPasswordNotice] = useState<Notice>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (!active) return;
      if (userError || !user) {
        setLoadError("Unable to load your profile. Please sign in again.");
        setIsLoading(false);
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("full_name, blood_type, timezone")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!active) return;

      if (profileError) {
        setLoadError("Could not load your profile details.");
      }
      setUserId(user.id);
      setEmail(user.email ?? "");
      setMemberSince(
        user.created_at
          ? new Date(user.created_at).toLocaleDateString([], { year: "numeric", month: "long", day: "numeric" })
          : ""
      );
      setFullName(profile?.full_name ?? (user.user_metadata?.full_name as string | undefined) ?? "");
      setBloodType(profile?.blood_type ?? "");
      setTimezone(profile?.timezone ?? "Asia/Kolkata");
      setIsLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [supabase]);

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;
    const name = fullName.trim();
    if (!name) {
      setProfileNotice({ kind: "error", text: "Name can't be empty." });
      return;
    }

    setSaving(true);
    setProfileNotice(null);
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: name, blood_type: bloodType, timezone })
      .eq("user_id", userId);
    if (error) {
      setProfileNotice({ kind: "error", text: "Could not save your changes. Please try again." });
      setSaving(false);
      return;
    }
    // Keep the name shown in the sidebar (read from the auth user) in step with the profile.
    await supabase.auth.updateUser({ data: { full_name: name, blood_type: bloodType } });
    setFullName(name);
    setProfileNotice({ kind: "ok", text: "Profile saved." });
    setSaving(false);
  };

  const changePassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const password = data.get("password")?.toString() ?? "";
    const confirm = data.get("confirm")?.toString() ?? "";

    if (password.length < MIN_PASSWORD_LENGTH) {
      setPasswordNotice({ kind: "error", text: `Use at least ${MIN_PASSWORD_LENGTH} characters.` });
      return;
    }
    if (password !== confirm) {
      setPasswordNotice({ kind: "error", text: "The two passwords don't match." });
      return;
    }

    setPasswordSaving(true);
    setPasswordNotice(null);
    const { error } = await supabase.auth.updateUser({ password });
    setPasswordSaving(false);
    if (error) {
      setPasswordNotice({ kind: "error", text: error.message });
      return;
    }
    form.reset();
    setPasswordNotice({ kind: "ok", text: "Password updated." });
  };

  const initial = (fullName || email || "U").charAt(0).toUpperCase();

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-20 px-4 sm:px-6 lg:px-8 pt-8 sm:pt-10 lg:pt-12">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
        <div className="flex flex-col md:flex-row items-center gap-8">
          <div className="w-32 h-32 rounded-3xl bg-[#FFB4A2]/10 border-4 border-white shadow-xl flex items-center justify-center text-4xl font-bold text-[#1B4332]">
            {isLoading ? <Loader2 size={32} className="animate-spin text-[#1B4332]" /> : initial}
          </div>
          <div className="text-center md:text-left space-y-2">
            <h1 className="text-4xl font-bold text-[#1B4332] tracking-tighter">
              {isLoading ? "Loading..." : fullName || email.split("@")[0]}
            </h1>
            {bloodType && (
              <span className="px-4 py-1.5 bg-[#FFB4A2]/10 text-[#FFB4A2] rounded-full text-xs font-bold uppercase tracking-wider inline-flex items-center gap-2">
                <Droplets size={12} /> Blood Group: {bloodType}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <form onSubmit={saveProfile} className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-6">
            <h3 className="text-xl font-bold text-[#1B4332] flex items-center gap-3">
              <User size={20} className="text-[#FFB4A2]" /> Personal Information
            </h3>

            {loadError && <NoticeBanner notice={{ kind: "error", text: loadError }} />}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-1">
                <label htmlFor="full_name" className={labelClass}>Full Name</label>
                <input id="full_name" value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={200} disabled={isLoading} className={inputClass} />
              </div>
              <div className="space-y-1">
                <label htmlFor="email" className={labelClass}>Email Address</label>
                <input id="email" value={email} readOnly disabled className={`${inputClass} opacity-70`} />
              </div>
              <div className="space-y-1">
                <label htmlFor="blood_type" className={labelClass}>Blood Group</label>
                <select id="blood_type" value={bloodType} onChange={(e) => setBloodType(e.target.value)} disabled={isLoading} className={inputClass}>
                  <option value="">Not set</option>
                  {BLOOD_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label htmlFor="timezone" className={labelClass}>Time Zone</label>
                <select id="timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)} disabled={isLoading} className={inputClass}>
                  {!timeZones.includes(timezone) && <option value={timezone}>{timezone}</option>}
                  {timeZones.map((z) => (
                    <option key={z} value={z}>{z}</option>
                  ))}
                </select>
              </div>
            </div>

            <NoticeBanner notice={profileNotice} />
            <button type="submit" disabled={saving || isLoading} className="bg-[#1B4332] text-white px-6 py-3 rounded-2xl font-bold text-sm flex items-center gap-2 hover:opacity-90 transition-all disabled:opacity-60 disabled:cursor-not-allowed">
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Save changes
            </button>
          </form>

          <form onSubmit={changePassword} className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-6">
            <h3 className="text-xl font-bold text-[#1B4332] flex items-center gap-3">
              <KeyRound size={20} className="text-[#FFB4A2]" /> Change Password
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-1">
                <label htmlFor="password" className={labelClass}>New password</label>
                <input id="password" name="password" type="password" minLength={MIN_PASSWORD_LENGTH} autoComplete="new-password" className={inputClass} />
              </div>
              <div className="space-y-1">
                <label htmlFor="confirm" className={labelClass}>Confirm password</label>
                <input id="confirm" name="confirm" type="password" minLength={MIN_PASSWORD_LENGTH} autoComplete="new-password" className={inputClass} />
              </div>
            </div>
            <NoticeBanner notice={passwordNotice} />
            <button type="submit" disabled={passwordSaving} className="bg-[#1B4332] text-white px-6 py-3 rounded-2xl font-bold text-sm flex items-center gap-2 hover:opacity-90 transition-all disabled:opacity-60 disabled:cursor-not-allowed">
              {passwordSaving && <Loader2 size={16} className="animate-spin" />} Update password
            </button>
          </form>
        </div>

        <div className="space-y-8">
          <div className="bg-[#1B4332] p-8 rounded-[2.5rem] text-white shadow-xl shadow-green-900/10 space-y-6">
            <h3 className="text-lg font-bold flex items-center gap-3">
              <Calendar size={20} className="text-[#FFB4A2]" /> Recent Activity
            </h3>
            <div className="flex items-center gap-4 bg-white/10 p-4 rounded-2xl">
              <div className="w-2 h-2 rounded-full bg-[#FFB4A2]" />
              <div className="flex-1">
                <p className="text-sm font-bold">Account Created</p>
                <p className="text-[10px] text-white/60">{memberSince || "..."}</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-4">
            <p className="text-sm font-medium text-slate-400">
              Your reports are stored in a private folder that only your account can access, and every request is checked against your sign-in.
            </p>
            <div className="flex items-center gap-2 text-[#2D6A4F] font-bold text-xs uppercase tracking-tighter">
              <Shield size={14} /> Private to your account
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
