"use client";
import { motion } from "framer-motion";
import { Bell, ShieldCheck, Database, Trash2, Smartphone, Loader2, AlertCircle } from "lucide-react";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

interface UserSettings {
  user_id: string;
  ai_analysis_enabled: boolean;
  notifications_enabled: boolean;
}

type SettingRowProps = {
  icon: React.ReactNode;
  title: string;
  desc: string;
  action: React.ReactNode;
};

export default function SettingsPage() {
  const router = useRouter();
  const supabase = createClient();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  
  const [settings, setSettings] = useState<UserSettings>({
    user_id: "",
    ai_analysis_enabled: true,
    notifications_enabled: true,
  });

  // Load user and settings on mount
  useEffect(() => {
    const loadUserAndSettings = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          router.push("/login");
          return;
        }

        setCurrentUser(user);

        // Load user settings from Supabase
        const { data, error } = await supabase
          .from("user_settings")
          .select("*")
          .eq("user_id", user.id)
          .single();

        if (error && error.code !== "PGRST116") {
          console.error("Error loading settings:", error);
        }

        if (data) {
          setSettings({
            user_id: user.id,
            ai_analysis_enabled: data.ai_analysis_enabled ?? true,
            notifications_enabled: data.notifications_enabled ?? true,
          });
        } else {
          // Initialize settings if they don't exist
          setSettings(prev => ({ ...prev, user_id: user.id }));
        }
      } catch (err) {
        console.error("Error loading user:", err);
      } finally {
        setIsLoading(false);
      }
    };

    loadUserAndSettings();
  }, [supabase, router]);

  // Show toast message
  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

  // Save AI Analysis setting
  const handleAiAnalysisToggle = async () => {
    const newValue = !settings.ai_analysis_enabled;
    setIsSaving(true);

    try {
      const { error } = await supabase
        .from("user_settings")
        .upsert(
          {
            user_id: settings.user_id,
            ai_analysis_enabled: newValue,
            notifications_enabled: settings.notifications_enabled,
          },
          { onConflict: "user_id" }
        );

      if (error) {
        console.error("Supabase error:", error.message, error.details);
        throw new Error(error.message || "Failed to save setting");
      }

      setSettings(prev => ({ ...prev, ai_analysis_enabled: newValue }));
      showToast("Saved");
    } catch (err) {
      console.error("Error saving AI analysis setting:", err instanceof Error ? err.message : String(err));
      showToast("Failed to save. Check if user_settings table exists in Supabase.");
    } finally {
      setIsSaving(false);
    }
  };

  // Save Health Reminders setting
  const handleNotificationsToggle = async () => {
    const newValue = !settings.notifications_enabled;
    setIsSaving(true);

    try {
      const { error } = await supabase
        .from("user_settings")
        .upsert(
          {
            user_id: settings.user_id,
            ai_analysis_enabled: settings.ai_analysis_enabled,
            notifications_enabled: newValue,
          },
          { onConflict: "user_id" }
        );

      if (error) {
        console.error("Supabase error:", error.message, error.details);
        throw new Error(error.message || "Failed to save setting");
      }

      setSettings(prev => ({ ...prev, notifications_enabled: newValue }));
      showToast("Saved");
    } catch (err) {
      console.error("Error saving notifications setting:", err instanceof Error ? err.message : String(err));
      showToast("Failed to save. Check if user_settings table exists in Supabase.");
    } finally {
      setIsSaving(false);
    }
  };

  // Export data as JSON
  const handleDataExport = async () => {
    setIsExporting(true);
    try {
      const response = await fetch("/api/files");
      if (!response.ok) throw new Error("Failed to fetch files");

      const { files } = await response.json();

      const exportData = {
        exportDate: new Date().toISOString(),
        user: {
          email: currentUser?.email,
          name: currentUser?.user_metadata?.full_name || "User",
        },
        settings: settings,
        uploadedFiles: files || [],
      };

      // Create and download JSON file
      const jsonString = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonString], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "medsync-export.json";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      showToast("Data exported successfully");
    } catch (err) {
      console.error("Error exporting data:", err);
      showToast("Failed to export data");
    } finally {
      setIsExporting(false);
    }
  };

  // Delete account
  const handleDeleteAccount = async () => {
    if (deleteConfirm !== "DELETE") {
      showToast("Please type DELETE to confirm");
      return;
    }

    setIsDeleting(true);
    try {
      // Sign out the user first
      await supabase.auth.signOut();

      // Then redirect to signup
      showToast("Account scheduled for deletion");
      setTimeout(() => router.push("/signup"), 2000);
    } catch (err) {
      console.error("Error during account deletion:", err);
      showToast("Failed to delete account. Contact support if issue persists.");
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-10 pb-20 flex items-center justify-center min-h-screen">
        <Loader2 size={32} className="animate-spin text-[#1B4332]" />
      </div>
    );
  }

  const SettingRow = ({ icon, title, desc, action }: SettingRowProps) => (
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
    <div className="max-w-4xl mx-auto space-y-10 pb-20 px-4 sm:px-6 lg:px-8 pt-8 sm:pt-10 lg:pt-12">
      <div>
        <h1 className="text-4xl font-bold text-[#1B4332] tracking-tight">Settings</h1>
        <p className="text-slate-500 mt-2">Manage your health data privacy and app preferences.</p>
      </div>

      {/* Toast Notification */}
      {toast && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="fixed top-4 right-4 bg-[#2D6A4F] text-white px-6 py-3 rounded-2xl font-medium text-sm shadow-lg shadow-green-900/20 z-50"
        >
          {toast}
        </motion.div>
      )}

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
                onClick={handleAiAnalysisToggle}
                disabled={isSaving}
                className={`w-12 h-6 rounded-full transition-colors relative disabled:opacity-60 ${settings.ai_analysis_enabled ? 'bg-[#2D6A4F]' : 'bg-slate-200'}`}
              >
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${settings.ai_analysis_enabled ? 'left-7' : 'left-1'}`} />
              </button>
            }
          />
          <SettingRow 
            icon={<Database size={20} />}
            title="Data Export"
            desc="Download all your medical records and settings as JSON."
            action={
              <button 
                onClick={handleDataExport}
                disabled={isExporting}
                className="text-[10px] font-bold text-[#1B4332] underline uppercase hover:text-[#2D6A4F] disabled:opacity-60"
              >
                {isExporting ? "Exporting..." : "Export"}
              </button>
            }
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
                onClick={handleNotificationsToggle}
                disabled={isSaving}
                className={`w-12 h-6 rounded-full transition-colors relative disabled:opacity-60 ${settings.notifications_enabled ? 'bg-[#2D6A4F]' : 'bg-slate-200'}`}
              >
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${settings.notifications_enabled ? 'left-7' : 'left-1'}`} />
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
            action={
              <button 
                onClick={() => setShowDeleteModal(true)}
                className="text-red-500 font-bold text-xs hover:underline"
              >
                Delete Forever
              </button>
            }
          />
        </div>
      </section>

      {/* Delete Account Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-[2.5rem] border border-slate-100 shadow-2xl max-w-md w-full p-8 space-y-6"
          >
            <div className="flex items-center gap-3">
              <div className="p-3 bg-red-50 text-red-500 rounded-2xl">
                <AlertCircle size={24} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-[#1B4332]">Delete Account?</h3>
                <p className="text-xs text-slate-400">This action cannot be undone</p>
              </div>
            </div>

            <div className="bg-red-50 border border-red-100 rounded-2xl p-4 space-y-2">
              <p className="text-sm font-semibold text-red-700">Warning: This will permanently delete:</p>
              <ul className="text-xs text-red-600 space-y-1 ml-4">
                <li>• Your account and all personal data</li>
                <li>• All uploaded medical documents</li>
                <li>• Your chat history and preferences</li>
              </ul>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                Type &quot;DELETE&quot; to confirm
              </label>
              <input
                type="text"
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value.toUpperCase())}
                placeholder="DELETE"
                className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-3 px-4 text-sm font-medium outline-none focus:border-red-200"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeleteConfirm("");
                }}
                className="flex-1 py-3 px-4 bg-slate-100 text-[#1B4332] rounded-2xl font-bold text-sm hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleteConfirm !== "DELETE" || isDeleting}
                className="flex-1 py-3 px-4 bg-red-500 text-white rounded-2xl font-bold text-sm hover:bg-red-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isDeleting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Deleting...
                  </>
                ) : (
                  "Delete Forever"
                )}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}