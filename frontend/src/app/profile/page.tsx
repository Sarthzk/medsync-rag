"use client";
import { useEffect, useState } from "react";
import { 
  User, 
  Droplets, 
  Shield, 
  Calendar, 
  Edit3, 
  Camera,
  Loader2
} from "lucide-react";
import { createClient } from "@/lib/supabase";

interface Profile {
  name: string;
  email: string;
  bloodType: string;
  isLoading: boolean;
  error: string | null;
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile>({
    name: "Loading...",
    email: "Loading...",
    bloodType: "...",
    isLoading: true,
    error: null,
  });

  const supabase = createClient();

  // Fetch user data from Supabase Auth
  useEffect(() => {
    const fetchUserProfile = async () => {
      try {
        const { data: { user }, error: userError } = await supabase.auth.getUser();

        if (userError || !user) {
          setProfile(prev => ({
            ...prev,
            isLoading: false,
            error: "Unable to load profile",
          }));
          return;
        }

        setProfile({
          name: user.user_metadata?.full_name || user.email?.split("@")[0] || "User",
          email: user.email || "No email provided",
          bloodType: user.user_metadata?.blood_type || "O+",
          isLoading: false,
          error: null,
        });
      } catch (err) {
        console.error("Error fetching profile:", err);
        setProfile(prev => ({
          ...prev,
          isLoading: false,
          error: "Failed to load profile",
        }));
      }
    };

    fetchUserProfile();
  }, [supabase]);

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-20 px-4 sm:px-6 lg:px-8 pt-8 sm:pt-10 lg:pt-12">
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
        <div className="flex flex-col md:flex-row items-center gap-8">
          {/* AVATAR */}
          <div className="relative group">
            <div className="w-32 h-32 rounded-3xl bg-[#FFB4A2]/10 border-4 border-white shadow-xl flex items-center justify-center text-4xl font-bold text-[#1B4332]">
              {profile.isLoading ? (
                <Loader2 size={32} className="animate-spin text-[#1B4332]" />
              ) : (
                profile.name.charAt(0).toUpperCase()
              )}
            </div>
            <button className="absolute -bottom-2 -right-2 p-2.5 bg-white rounded-xl shadow-lg border border-slate-100 text-[#1B4332] hover:scale-110 transition-transform">
              <Camera size={18} />
            </button>
          </div>

          <div className="text-center md:text-left space-y-2">
            <h1 className="text-4xl font-bold text-[#1B4332] tracking-tighter">
              {profile.isLoading ? "Loading..." : profile.name}
            </h1>
            <div className="flex flex-wrap justify-center md:justify-start gap-3">
              <span className="px-4 py-1.5 bg-[#1B4332]/5 text-[#1B4332] rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-2">
                <Shield size={12} /> Verified Patient
              </span>
              <span className="px-4 py-1.5 bg-[#FFB4A2]/10 text-[#FFB4A2] rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-2">
                <Droplets size={12} /> Blood Group: {profile.bloodType}
              </span>
            </div>
          </div>
        </div>

        <button className="flex items-center gap-2 px-6 py-3 bg-[#1B4332] text-white rounded-2xl font-bold text-sm hover:opacity-90 transition-all shadow-lg shadow-green-900/20 active:scale-95">
          <Edit3 size={18} /> Edit Profile
        </button>
      </div>

      {/* INFORMATION GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* PERSONAL DETAILS */}
        <div className="lg:col-span-2 space-y-8">
          <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-8">
            <h3 className="text-xl font-bold text-[#1B4332] flex items-center gap-3">
              <User size={20} className="text-[#FFB4A2]" /> Personal Information
            </h3>
            
            {profile.error && (
              <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
                <p className="text-red-700 text-sm font-medium">{profile.error}</p>
              </div>
            )}
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Full Name</p>
                <p className="text-lg font-semibold text-[#1B4332]">{profile.isLoading ? "Loading..." : profile.name}</p>
              </div>
              
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Email Address</p>
                <p className="text-lg font-semibold text-[#1B4332]">{profile.isLoading ? "Loading..." : profile.email}</p>
              </div>

              <div className="space-y-1">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Phone Number</p>
                <p className="text-lg font-semibold text-[#1B4332]">+91 ••••• ••••</p>
              </div>

              <div className="space-y-1">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Location</p>
                <p className="text-lg font-semibold text-[#1B4332]">Maharashtra, India</p>
              </div>
            </div>
          </div>
        </div>

        {/* STATS / QUICK INFO */}
        <div className="space-y-8">
          <div className="bg-[#1B4332] p-8 rounded-[2.5rem] text-white shadow-xl shadow-green-900/10 space-y-6">
            <h3 className="text-lg font-bold flex items-center gap-3">
              <Calendar size={20} className="text-[#FFB4A2]" /> Recent Activity
            </h3>
            <div className="space-y-4">
              <div className="flex items-center gap-4 bg-white/10 p-4 rounded-2xl">
                <div className="w-2 h-2 rounded-full bg-[#FFB4A2]" />
                <div className="flex-1">
                  <p className="text-sm font-bold">Account Created</p>
                  <p className="text-[10px] text-white/60">Successfully joined MedSync</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-4">
            <p className="text-sm font-medium text-slate-400">
              Your data is encrypted using 256-bit AES technology and is HIPAA compliant.
            </p>
            <div className="flex items-center gap-2 text-[#2D6A4F] font-bold text-xs uppercase tracking-tighter">
              <Shield size={14} /> Secured by MedSync
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}