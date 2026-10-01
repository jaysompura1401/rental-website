import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { LogOut, LayoutDashboard, UserCircle2, AlignJustify, Map, Heart, X } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/lib/AuthContext";
import { saved as savedApi } from "@/lib/api";
import { useState, useEffect } from "react";

const GOLD = "#C9921A";
const BG   = "#FAF6EE";

type NavTab = {
  label: string;
  homeLink?: boolean;
  mapLink?: boolean;
  property_type?: string;
  listing_type?: string;
};

const NAV_TABS: NavTab[] = [
  { label: "Homes",          homeLink: true                          },
  { label: "Buy",            listing_type:  "sale"                   },
  { label: "Rent",           listing_type:  "rent"                   },
  { label: "Commercial",     property_type: "Office Space"           },
  { label: "PG / Co-living", listing_type:  "pg"                     },
  { label: "Short-Term",     listing_type:  "short_term"             },
  { label: "Map",            mapLink: true                           },
];

export function Navbar() {
  const { profile, signOut } = useAuth();
  const navigate   = useNavigate();
  const routerState = useRouterState();
  const pathname    = routerState.location.pathname;
  const searchStr   = routerState.location.searchStr ?? String(routerState.location.search ?? "");

  const [mobileOpen, setMobileOpen] = useState(false);
  const [savedCount, setSavedCount] = useState(0);

  // Fetch real saved properties count for logged in user
  useEffect(() => {
    const fetchSavedCount = () => {
      if (!profile) {
        setSavedCount(0);
        return;
      }
      savedApi.list()
        .then(res => setSavedCount(Array.isArray(res) ? res.length : 0))
        .catch(() => setSavedCount(0));
    };

    fetchSavedCount();
    window.addEventListener("nivaas_saved_changed", fetchSavedCount);
    return () => window.removeEventListener("nivaas_saved_changed", fetchSavedCount);
  }, [profile]);

  // Close drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname, searchStr]);

  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  const handleSignOut = () => { signOut(); navigate({ to: "/" }); };

  const isTabActive = (tab: NavTab) => {
    if (tab.homeLink) return pathname === "/";
    if (tab.mapLink)  return pathname === "/properties/map";
    if (pathname !== "/properties") return false;
    if (tab.property_type) return searchStr.includes(`property_type=${encodeURIComponent(tab.property_type)}`);
    if (tab.listing_type)  return searchStr.includes(`listing_type=${encodeURIComponent(tab.listing_type)}`);
    return false;
  };

  const handleTabClick = (tab: NavTab) => {
    setMobileOpen(false);
    if (tab.homeLink) { window.location.href = "/"; return; }
    if (tab.mapLink)  { window.location.href = "/properties/map"; return; }
    let url = "/properties";
    if (tab.property_type) url += `?property_type=${encodeURIComponent(tab.property_type)}`;
    else if (tab.listing_type) url += `?listing_type=${encodeURIComponent(tab.listing_type)}`;
    window.location.href = url;
  };

  return (
    <>
      <header className="sticky top-0 z-50 w-full border-b backdrop-blur-md bg-[#FAF6EE]/95 transition-shadow duration-200" style={{ borderColor: "#e8d9c0" }}>
        <nav className="mx-auto flex h-14 sm:h-16 max-w-[1536px] items-center justify-between px-4 sm:px-6 lg:px-10 xl:px-12 gap-3">

          {/* Logo */}
          <div className="flex items-center shrink-0">
            <Link to="/" className="flex items-center min-h-[40px] group py-0.5">
              <span className="text-xl sm:text-2xl font-extrabold tracking-tight transition-transform duration-200 group-hover:scale-[1.02]" style={{ color: GOLD, fontFamily: "'Sora',sans-serif", letterSpacing: "-0.02em" }}>
                Nivaas.
              </span>
            </Link>
          </div>

          {/* Center Category Navigation Links — Desktop */}
          <div
            className="hidden lg:flex items-center p-1 divide-x divide-[#e8d9c0]/80 shadow-2xs"
            style={{ border: "1px solid #e8d9c0", borderRadius: 999, backgroundColor: "#fff" }}
          >
            {NAV_TABS.map((tab) => {
              const active = isTabActive(tab);
              return (
                <button
                  key={tab.label}
                  type="button"
                  onClick={() => handleTabClick(tab)}
                  className="flex items-center gap-1.5 px-3.5 lg:px-4 py-1.5 min-h-[36px] text-xs xl:text-sm font-semibold transition-all duration-200 rounded-full"
                  style={
                    active
                      ? { color: GOLD, backgroundColor: "#fef3d4", fontWeight: 700 }
                      : { color: "#836737", backgroundColor: "transparent" }
                  }
                >
                  {tab.mapLink && <Map className="h-3.5 w-3.5 shrink-0" />}
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Right Header Buttons */}
          <div className="flex items-center justify-end gap-2.5 shrink-0">
            {/* Shortlist Badge Button with Floating Heart Badge */}
            <Link
              to="/dashboard/saved"
              className="relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs xl:text-sm font-semibold transition-all text-[#836737] hover:text-[#1a1209] hover:bg-[#fef3d4]"
              title="Saved Properties / Shortlist"
            >
              <div className="relative flex items-center justify-center">
                <Heart className="h-5 w-5 text-[#C9921A] transition-transform duration-200 hover:scale-110" />
                {savedCount > 0 && (
                  <span className="absolute -top-1.5 -right-2 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#C9921A] text-[10px] font-extrabold text-white px-1 shadow-xs border border-white leading-none">
                    {savedCount}
                  </span>
                )}
              </div>
            </Link>

            {/* Post Property Button — hidden for customers */}
            {profile?.role !== "customer" && (
              <button
                onClick={() => navigate({ to: "/dashboard/properties/new" })}
                className="hidden sm:inline-flex items-center justify-center min-h-[36px] rounded-full px-4 py-1.5 text-xs sm:text-sm font-bold transition-all duration-200 hover:bg-[#fef3d4] border shadow-xs"
                style={{ color: "#836737", borderColor: "#e8d9c0", backgroundColor: "#fff" }}
              >
                + Post Property
              </button>
            )}

            {/* Profile Dropdown / Login */}
            {profile ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="rounded-full min-h-[36px] min-w-[36px] flex items-center justify-center p-0.5 transition-transform hover:scale-105">
                    <Avatar className="h-8 w-8 border-2" style={{ borderColor: "#e8d9c0" }}>
                      <AvatarFallback style={{ backgroundColor: GOLD, color: "#fff", fontSize: 13, fontWeight: 700 }}>
                        {(profile.full_name ?? profile.email ?? "U").slice(0, 1).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 mt-1 rounded-2xl p-1.5 shadow-xl border-[#e8d9c0] bg-white">
                  <DropdownMenuLabel className="truncate text-xs font-bold text-[#1a1209] px-3 py-2">
                    {profile.full_name || profile.email}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator className="bg-[#e8d9c0]/60" />
                  <DropdownMenuItem asChild className="rounded-xl min-h-[40px] cursor-pointer text-sm font-medium text-[#1a1209] focus:bg-[#fef9f0] focus:text-[#C9921A]">
                    <Link to="/dashboard"><LayoutDashboard className="mr-2.5 h-4 w-4 text-[#836737]" />Dashboard</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild className="rounded-xl min-h-[40px] cursor-pointer text-sm font-medium text-[#1a1209] focus:bg-[#fef9f0] focus:text-[#C9921A]">
                    <Link to="/dashboard/saved"><Heart className="mr-2.5 h-4 w-4 text-[#836737]" />Saved Properties</Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-[#e8d9c0]/60" />
                  <DropdownMenuItem onClick={handleSignOut} className="rounded-xl min-h-[40px] cursor-pointer text-sm font-medium text-red-600 focus:bg-red-50 focus:text-red-700">
                    <LogOut className="mr-2.5 h-4 w-4 text-red-500" />Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Link
                to="/auth"
                className="flex h-9 w-9 min-h-[36px] min-w-[36px] items-center justify-center rounded-full transition-colors hover:bg-[#fef3d4]"
                style={{ color: "#836737" }}
                title="Sign in"
              >
                <UserCircle2 className="h-5 w-5" />
              </Link>
            )}

            {/* Mobile Hamburger Button */}
            <button
              onClick={() => setMobileOpen(true)}
              className="lg:hidden flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-[#fef3d4]"
              style={{ color: "#836737" }}
              aria-label="Open menu"
            >
              <AlignJustify className="h-5 w-5" />
            </button>
          </div>
        </nav>
      </header>

      {/* ── Mobile Drawer ─────────────────────────────────────────── */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs lg:hidden transition-opacity duration-300"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      <div
        className={`fixed top-0 right-0 z-50 h-full w-80 max-w-[85vw] flex flex-col lg:hidden transition-transform duration-300 ease-out shadow-2xl ${
          mobileOpen ? "translate-x-0" : "translate-x-full"
        }`}
        style={{ backgroundColor: BG, borderLeft: "1px solid #e8d9c0" }}
      >
        <div className="flex items-center justify-between px-5 h-14 border-b shrink-0" style={{ borderColor: "#e8d9c0" }}>
          <span style={{ color: GOLD, fontFamily: "'Sora',sans-serif", fontSize: 20, fontWeight: 800, letterSpacing: "-0.02em" }}>
            Nivaas.
          </span>
          <button
            onClick={() => setMobileOpen(false)}
            className="flex h-10 w-10 min-h-[40px] min-w-[40px] items-center justify-center rounded-full transition-colors hover:bg-[#fef3d4]"
            style={{ color: "#836737" }}
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          <p className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider" style={{ color: "#a08858" }}>
            Browse
          </p>
          {NAV_TABS.map((tab) => {
            const active = isTabActive(tab);
            return (
              <button
                key={tab.label}
                type="button"
                onClick={() => handleTabClick(tab)}
                className="w-full flex items-center gap-3 px-4 py-3 min-h-[44px] rounded-xl text-sm font-semibold transition-colors"
                style={
                  active
                    ? { color: GOLD, backgroundColor: "#fef3d4", fontWeight: 700 }
                    : { color: "#836737", backgroundColor: "transparent" }
                }
              >
                {tab.mapLink && <Map className="h-4 w-4 shrink-0" />}
                <span>{tab.label}</span>
              </button>
            );
          })}

          <div className="my-4 border-t" style={{ borderColor: "#e8d9c0" }} />

          {/* Post Property — hidden for customers */}
          {profile?.role !== "customer" && (
            <button
              onClick={() => { navigate({ to: "/dashboard/properties/new" }); setMobileOpen(false); }}
              className="w-full flex items-center gap-3 px-4 py-3 min-h-[44px] rounded-xl text-sm font-semibold transition-colors text-[#836737] hover:bg-[#fef3d4]"
            >
              + Post Property
            </button>
          )}

          {profile ? (
            <>
              <button
                onClick={() => { navigate({ to: "/dashboard" }); setMobileOpen(false); }}
                className="w-full flex items-center gap-3 px-4 py-3 min-h-[44px] rounded-xl text-sm font-semibold transition-colors text-[#836737] hover:bg-[#fef3d4]"
              >
                <LayoutDashboard className="h-4 w-4 shrink-0" /> Dashboard
              </button>
              <button
                onClick={() => { navigate({ to: "/dashboard/saved" }); setMobileOpen(false); }}
                className="w-full flex items-center gap-3 px-4 py-3 min-h-[44px] rounded-xl text-sm font-semibold transition-colors text-[#836737] hover:bg-[#fef3d4]"
              >
                <Heart className="h-4 w-4 shrink-0" /> Saved Properties
              </button>
              <button
                onClick={() => { handleSignOut(); setMobileOpen(false); }}
                className="w-full flex items-center gap-3 px-4 py-3 min-h-[44px] rounded-xl text-sm font-semibold transition-colors text-red-600 hover:bg-red-50"
              >
                <LogOut className="h-4 w-4 shrink-0" /> Sign out
              </button>
            </>
          ) : (
            <button
              onClick={() => { navigate({ to: "/auth" }); setMobileOpen(false); }}
              className="w-full flex items-center gap-3 px-4 py-3 min-h-[44px] rounded-xl text-sm font-semibold transition-colors text-[#836737] hover:bg-[#fef3d4]"
            >
              <UserCircle2 className="h-4 w-4 shrink-0" /> Sign in
            </button>
          )}
        </nav>
      </div>
    </>
  );
}
