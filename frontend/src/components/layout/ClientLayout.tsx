"use client";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Menu, X } from "lucide-react";
import Sidebar from "./Sidebar";
import { createClient } from "@/lib/supabase";
import Footer from "./Footer";

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userName, setUserName] = useState("Guest User");
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);
  const userRef = useRef<unknown>(null);
  const isAuthPageRef = useRef(false);
  if (!supabaseRef.current) {
    supabaseRef.current = createClient();
  }
  const supabase = supabaseRef.current;

  const deriveUserName = (user: { user_metadata?: { full_name?: string }; email?: string } | null) => {
    if (user?.user_metadata?.full_name) {
      return user.user_metadata.full_name;
    }
    if (user?.email) {
      return user.email.split("@")[0];
    }
    return "Guest User";
  };
  
  // Hide sidebar on Login and Signup pages
  const isAuthPage = pathname === "/login" || pathname === "/signup";
  isAuthPageRef.current = isAuthPage;
  
  // Close sidebar on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && sidebarOpen) {
        setSidebarOpen(false);
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [sidebarOpen]);

  // Check if user is authenticated
  useEffect(() => {
    let isMounted = true;

    const initializeAuth = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        userRef.current = user;
        setUserName(deriveUserName(user));

        if (!isMounted) return;

        if (!user && !isAuthPageRef.current) {
          router.push("/login");
        }
      } catch (err) {
        console.error("Auth check error:", err);
        userRef.current = null;
        if (!isAuthPageRef.current) {
          router.push("/login");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      userRef.current = session?.user ?? null;
      setUserName(deriveUserName(session?.user ?? null));

      if (!session?.user && !isAuthPageRef.current) {
        router.push("/login");
      }

      setIsLoading(false);
    });

    initializeAuth();

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [router, supabase]);

  // Re-check route access on navigation using cached auth state.
  useEffect(() => {
    if (isLoading) return;

    if (!userRef.current && !isAuthPage) {
      router.push("/login");
    }
  }, [isLoading, isAuthPage, router]);

  // If loading and not on auth page, show nothing (prevents flash of content)
  if (isLoading && !isAuthPage) {
    return <div className="min-h-screen bg-[#FDFDFB]" />;
  }

  return (
    <div className="min-h-screen bg-[#FDFDFB]">
      {/* Mobile Hamburger Button */}
      {!isAuthPage && (
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="lg:hidden fixed top-4 left-4 z-50 w-10 h-10 flex items-center justify-center rounded-lg bg-[#1B4332] hover:bg-[#2D6A4F] transition-colors text-white"
          title="Toggle navigation"
        >
          {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      )}

      {/* Mobile Sidebar Overlay */}
      {!isAuthPage && sidebarOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
        />
      )}

      {/* Mobile Sidebar - Animated */}
      {!isAuthPage && (
        <motion.div
          initial={{ x: "-100%" }}
          animate={{
            x: sidebarOpen ? 0 : "-100%",
          }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          onClick={(e) => e.stopPropagation()}
          className="lg:hidden fixed left-0 top-0 bottom-0 w-72 z-40"
        >
          <Sidebar onClose={() => setSidebarOpen(false)} userName={userName} />
        </motion.div>
      )}

      {/* Desktop Sidebar - Always Visible */}
      {!isAuthPage && (
        <div className="hidden lg:block fixed left-0 top-0 bottom-0 w-72 z-40">
          <Sidebar onClose={() => setSidebarOpen(false)} userName={userName} />
        </div>
      )}
      
      <div className={`min-h-screen flex flex-col ${!isAuthPage ? "lg:pl-72" : ""}`}>
        <main className="flex-1 w-full">
          {children}
        </main>
        <Footer />
      </div>
    </div>
  );
}