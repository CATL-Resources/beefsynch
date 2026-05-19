import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { List, CalendarDays, Plus, BarChart3, LogOut, User, UserPlus, Users, Menu, X, ChevronDown, MessageSquare, Layers, Database, Building2 } from "lucide-react";
import beefsynchIcon from "@/assets/beefsynch-icon.png";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useOrgRole } from "@/hooks/useOrgRole";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface NavbarProps {
  onNewProject?: () => void;
}

const navBtnClass =
  "inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors w-full md:w-auto";


const Navbar = ({ onNewProject }: NavbarProps) => {
  const navigate = useNavigate();
  const [email, setEmail] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const { role: orgRole, orgName, userOrgs, switchOrg } = useOrgRole();
  const canManageTeam = orgRole === "owner" || orgRole === "admin";

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null);
      setIsAnonymous(data.user?.is_anonymous === true);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user?.email ?? null);
      setIsAnonymous(session?.user?.is_anonymous === true);
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    toast({ title: "Signed out", description: "You have been signed out." });
    navigate("/auth");
  };

  const go = (path: string) => {
    navigate(path);
    setMobileOpen(false);
  };

  return (
    <header className="border-b border-border/50 backdrop-blur-sm">
      <div className="container mx-auto flex items-center justify-between px-4 py-4">
        {/* Logo */}
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate("/operations?tab=hub")}>
          <img src={beefsynchIcon} alt="BeefSynch logo" className="h-9 w-9 object-contain rounded" />
          <div>
            <h1 className="text-2xl font-bold font-display text-foreground tracking-tight">
              Beef<span className="text-primary">Synch</span>
            </h1>
            {orgName && userOrgs.length <= 1 && (
              <p className="text-xs text-muted-foreground tracking-wide">
                {orgName}
              </p>
            )}
            {orgName && userOrgs.length > 1 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                    {orgName}
                    <ChevronDown className="h-3 w-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="z-50 w-56 bg-popover border border-border shadow-lg">
                  {userOrgs.map((org) => (
                    <DropdownMenuItem
                      key={org.orgId}
                      onClick={() => switchOrg(org.orgId)}
                      className="cursor-pointer gap-2"
                    >
                      <span className={org.orgName === orgName ? "font-semibold" : ""}>{org.orgName}</span>
                      <span className="ml-auto text-xs text-muted-foreground capitalize">{org.role}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {!orgName && (
              <p className="text-xs text-muted-foreground tracking-wide">
                Synchronization Planner
              </p>
            )}
          </div>
        </div>

        {/* Desktop nav */}
         <nav className="hidden md:flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className={navBtnClass}>
                <Menu className="h-4 w-4" /> Menu
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="z-50 w-52 bg-popover border border-border shadow-lg">
              <DropdownMenuItem onClick={() => go("/operations")} className="cursor-pointer gap-2">
                <Layers className="h-4 w-4" /> Operations
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => go("/customers")} className="cursor-pointer gap-2">
                <Users className="h-4 w-4" /> Customers
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => go("/bulls")} className="cursor-pointer gap-2">
                <List className="h-4 w-4" /> Bull Catalog
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => go("/companies")} className="cursor-pointer gap-2">
                <Building2 className="h-4 w-4" /> Semen Companies
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => go("/calendar")} className="cursor-pointer gap-2">
                <CalendarDays className="h-4 w-4" /> Calendar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => go("/operations?tab=inventory")} className="cursor-pointer gap-2">
                <BarChart3 className="h-4 w-4" /> Planning
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => go("/chat")} className="cursor-pointer gap-2">
                <MessageSquare className="h-4 w-4" /> Bull Chat
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            onClick={() => { onNewProject?.(); setMobileOpen(false); }}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-normal text-white hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" /> New Project
          </button>

          {/* User menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                <User className="h-4 w-4 shrink-0" />
                <span className="hidden lg:inline max-w-[160px] truncate">
                  {isAnonymous ? "Guest User" : email ?? ""}
                </span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="z-50 w-56 bg-popover border border-border shadow-lg">
              <div className="px-3 py-2 text-xs text-muted-foreground truncate border-b border-border">
                {isAnonymous ? "Guest User" : email ?? ""}
              </div>
              {isAnonymous && (
                <DropdownMenuItem onClick={() => navigate("/auth?convert=true")} className="cursor-pointer gap-2">
                  <UserPlus className="h-4 w-4" /> Create Account
                </DropdownMenuItem>
              )}
              {canManageTeam && (
                <DropdownMenuItem onClick={() => go("/team")} className="cursor-pointer gap-2">
                  <Users className="h-4 w-4" /> Manage Team
                </DropdownMenuItem>
              )}
              {canManageTeam && (
                <DropdownMenuItem onClick={() => go("/admin/import-bulls")} className="cursor-pointer gap-2">
                  <Database className="h-4 w-4" /> Import Bull Catalog
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer gap-2 text-destructive focus:text-destructive">
                <LogOut className="h-4 w-4" /> Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>

        {/* Mobile actions */}
        <div className="md:hidden flex items-center gap-1">
          <button
            onClick={() => onNewProject?.()}
            className="inline-flex items-center justify-center rounded-md p-2 text-primary hover:bg-secondary transition-colors"
            aria-label="New Project"
          >
            <Plus className="h-5 w-5" />
          </button>
          <button
            onClick={() => setMobileOpen((o) => !o)}
            className="inline-flex items-center justify-center rounded-md p-2 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile dropdown panel */}
      {mobileOpen && (
        <div className="md:hidden border-t border-border/50 bg-popover/95 backdrop-blur-md px-4 py-3 space-y-1 animate-fade-in">
          <button onClick={() => go("/operations")} className={navBtnClass}>
            <Layers className="h-4 w-4" /> Operations
          </button>
          <button onClick={() => go("/customers")} className={navBtnClass}>
            <Users className="h-4 w-4" /> Customers
          </button>
          <div className="border-t border-border/50 my-1" />
          <button onClick={() => go("/bulls")} className={navBtnClass}>
            <List className="h-4 w-4" /> Bull Catalog
          </button>
          <button onClick={() => go("/calendar")} className={navBtnClass}>
            <CalendarDays className="h-4 w-4" /> Calendar
          </button>
          <button onClick={() => go("/operations?tab=inventory")} className={navBtnClass}>
            <BarChart3 className="h-4 w-4" /> Planning
          </button>
          <button onClick={() => go("/chat")} className={navBtnClass}>
            <MessageSquare className="h-4 w-4" /> Bull Chat
          </button>
          <button
            onClick={() => { onNewProject?.(); setMobileOpen(false); }}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 transition-colors w-full"
          >
            <Plus className="h-4 w-4" /> New Project
          </button>
          <div className="border-t border-border/50 pt-2 mt-2 space-y-1">
            <div className="px-3 py-1 text-xs text-muted-foreground truncate">
              {isAnonymous ? "Guest User" : email ?? ""}
            </div>
            {isAnonymous && (
              <button onClick={() => go("/auth?convert=true")} className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary transition-colors w-full">
                <UserPlus className="h-4 w-4" /> Create Account
              </button>
            )}
            {canManageTeam && (
              <button onClick={() => go("/team")} className={navBtnClass}>
                <Users className="h-4 w-4" /> Manage Team
              </button>
            )}
            {canManageTeam && (
              <button onClick={() => go("/admin/import-bulls")} className={navBtnClass}>
                <Database className="h-4 w-4" /> Import Bull Catalog
              </button>
            )}
            <button onClick={handleSignOut} className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-destructive hover:bg-secondary transition-colors w-full">
              <LogOut className="h-4 w-4" /> Sign Out
            </button>
          </div>
        </div>
      )}
    </header>
  );
};

export default Navbar;
