/**
 * AuthContext.tsx — backed by MySQL API via JWT tokens.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  type CachedProfile,
  clearAuthCache,
  fetchProfile,
  getProfile,
  storeAuthResponse,
} from "./auth-cache";
import { triggerRecommendationPopup, clearPopupThrottle } from "./recommendation-popup";
import { clearViewHistory } from "./view-history";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuthContextValue {
  profile: CachedProfile | null;
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => void;
  /** Call after a successful login/register API response */
  applyAuth: (token: string, user: CachedProfile) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<CachedProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getProfile().then((p) => {
      if (!cancelled) {
        setProfile(p);
        setLoading(false);
        // Fire recommendation popup for already-logged-in customers on page load
        if (p && p.role === "customer") {
          // Small delay so the page renders first before the toast appears
          setTimeout(() => triggerRecommendationPopup(p.id, p.full_name), 1500);
        }
      }
    });
    return () => { cancelled = true; };
  }, []);

  const refresh = useCallback(async () => {
    const fresh = await fetchProfile();
    setProfile(fresh);
  }, []);

  const signOut = useCallback(() => {
    clearAuthCache();
    setProfile(null);
    // Clear popup throttle and view history on sign-out
    try { sessionStorage.removeItem("nivaas_rec_popup_shown"); } catch { /* ignore */ }
    clearViewHistory();
  }, []);

  const applyAuth = useCallback((token: string, user: CachedProfile) => {
    storeAuthResponse(token, user);
    setProfile(user);
    // Fire recommendation popup immediately after login for customers
    if (user.role === "customer") {
      // Clear throttle so the post-login toast ALWAYS fires fresh
      clearPopupThrottle(user.id);
      setTimeout(() => triggerRecommendationPopup(user.id, user.full_name), 800);

      // If customer has no saved requirements yet, flag them for the wizard
      try {
        const hasReq = !!localStorage.getItem("nivaas_customer_requirements");
        const justScrolling = !!localStorage.getItem("nivaas_just_scrolling");
        if (!hasReq && !justScrolling) {
          // Mark as new customer so homepage shows the wizard immediately after redirect
          sessionStorage.setItem("nivaas_show_wizard_for_new_customer", "1");
        }
      } catch { /* ignore */ }
    }
  }, []);

  return (
    <AuthContext.Provider value={{ profile, loading, refresh, signOut, applyAuth }}>
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
