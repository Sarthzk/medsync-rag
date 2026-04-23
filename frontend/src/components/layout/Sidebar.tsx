"use client";
import { 
  MessageSquare, 
  Home, 
  FolderHeart, 
  LineChart, 
  Settings, 
  Heart, 
  Activity,
  Pill,
  ChevronRight,
  LogOut,
  Loader2 
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";

const navItems = [
  { name: "Home", icon: <Home size={20} />, href: "/" },
  { name: "Health Overview", icon: <LineChart size={20} />, href: "/analytics" }, 
  { name: "Medications", icon: <Pill size={20} />, href: "/medications" },
  { name: "MedSync AI", icon: <MessageSquare size={20} />, href: "/chat" },
  { name: "Health Vault", icon: <FolderHeart size={20} />, href: "/vault" },
  { name: "Vitals", icon: <Activity size={20} />, href: "/vitals" },
];

export default function Sidebar({ onClose }: { onClose?: () => void }) {
  const pathname = usePathname();
  const router = useRouter(); 
  const [userName, setUserName] = useState("Guest User");
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    const fetchUserName = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.user_metadata?.full_name) {
          setUserName(user.user_metadata.full_name);
        } else if (user?.email) {
          setUserName(user.email.split("@")[0]);
        }
      } catch (err) {
        console.error("Error fetching username:", err);
      }
    };

    fetchUserName();
  }, [supabase]);

  // Logout handler using Supabase
  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await supabase.auth.signOut();
      router.push("/login");
      if (onClose) onClose();
    } catch (err) {
      console.error("Logout error:", err);
      setIsLoggingOut(false);
    }
  };

  return (
    <aside className="w-72 h-screen bg-[#FDFDFB] border-r border-slate-100 flex flex-col p-8 z-20">
      <div className="flex items-center gap-3 mb-12">
        <div className="w-10 h-10 bg-[#FFB4A2]/20 rounded-2xl flex items-center justify-center text-[#FFB4A2]">
          <Heart size={24} fill="currentColor" />
        </div>
        <h1 className="text-xl font-bold tracking-tighter text-[#1B4332]">MEDSYNC</h1>
      </div>

      <nav className="flex-1 space-y-2 overflow-y-auto pr-2">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link 
              key={item.href} 
              href={item.href}
              onClick={onClose}
              className={`flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-all font-semibold text-sm group ${
                isActive 
                ? "bg-[#1B4332] text-white shadow-lg shadow-green-900/20" 
                : "text-[#1B4332]/60 hover:bg-[#2D6A4F]/5 hover:text-[#1B4332]"
              }`}
            >
              <span className={`${isActive ? "text-[#FFB4A2]" : "text-[#FFB4A2] opacity-70 group-hover:opacity-100"}`}>
                {item.icon}
              </span>
              {item.name}
            </Link>
          );
        })}
      </nav>

      <div className="pt-6 border-t border-slate-100 space-y-4">
        <Link 
          href="/settings" 
          onClick={onClose}
          className={`flex items-center gap-4 px-4 py-2 text-sm font-medium transition-colors ${pathname === '/settings' ? 'text-[#1B4332]' : 'text-slate-400 hover:text-[#1B4332]'}`}
        >
          <Settings size={18} />
          Settings
        </Link>

       
        <button 
          onClick={handleLogout}
          disabled={isLoggingOut}
          className="flex items-center gap-4 px-4 py-2 text-sm font-medium text-rose-500 hover:text-rose-700 transition-colors w-full text-left group disabled:opacity-70 disabled:cursor-not-allowed"
        >
          {isLoggingOut ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <LogOut size={18} className="group-hover:-translate-x-1 transition-transform" />
          )}
          {isLoggingOut ? "Logging out..." : "Logout"}
        </button>

        <Link href="/profile" onClick={onClose} className="group block">
          <div className="flex items-center gap-3 p-4 rounded-3xl bg-white border border-slate-100 hover:border-[#FFB4A2]/30 transition-all hover:shadow-sm">
            <div className="relative">
              <div className="w-10 h-10 rounded-xl bg-[#FFB4A2]/10 flex items-center justify-center text-[#1B4332] font-bold text-xs border border-[#FFB4A2]/20">
                {userName.charAt(0).toUpperCase()}
              </div>
              <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-[#2D6A4F] border-2 border-white rounded-full" />
            </div>
            
            <div className="flex-1 min-w-0 text-left">
              <p className="text-xs font-bold text-[#1B4332] truncate uppercase tracking-tight">
                {userName}
              </p>
              <p className="text-[10px] text-slate-400 font-medium tracking-wide">Patient Account</p>
            </div>
            
            <ChevronRight size={14} className="text-slate-300 group-hover:text-[#FFB4A2] transition-colors translate-x-1" />
          </div>
        </Link>
      </div>
    </aside>
  );
}