import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  ShoppingCart,
  Layers, ScrollText, List, Users, LayoutDashboard, Container,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Navbar from "@/components/Navbar";
import AppFooter from "@/components/AppFooter";
import NewProjectDialog from "@/components/NewProjectDialog";

import HubTab from "@/components/operations/HubTab";
import ProjectsTab from "@/components/operations/ProjectsTab";
import InventoryTab from "@/components/inventory/InventoryTab";
import OrdersTab from "@/components/inventory/OrdersTab";

import TanksTabContent, { CustomersTab } from "@/components/inventory/TanksTabContent";
import LogTab from "@/components/inventory/LogTab";
import Planning from "@/pages/Planning";

import { useOrgRole } from "@/hooks/useOrgRole";

interface TabDef {
  key: string;
  label: string;
  icon: any;
  href?: string;
}

const TABS: TabDef[] = [
  { key: "hub", label: "Hub", icon: LayoutDashboard },
  { key: "projects", label: "Projects", icon: List },
  { key: "inventory", label: "Inventory", icon: Layers },
  { key: "tanks", label: "Tanks", icon: Container },
  { key: "orders", label: "Orders", icon: ShoppingCart },
  { key: "customers", label: "Customers", icon: Users },
  { key: "log", label: "Log", icon: ScrollText },
];

type TabKey = string;

const OperationsDashboard = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { orgId, orgName, userId } = useOrgRole();
  const [dialogOpen, setDialogOpen] = useState(false);
  const activeTab = (searchParams.get("tab") as TabKey) || "hub";
  const inventoryOwnerFilter = (searchParams.get("owner") as "all" | "company" | "customer") || "company";
  const viewParam = searchParams.get("view");
  const [inventoryView, setInventoryView] = useState<"bull" | "planning">(
    viewParam === "planning" ? "planning" : "bull"
  );

  useEffect(() => {
    const vp = searchParams.get("view");
    if (vp === "planning") setInventoryView("planning");
    else setInventoryView("bull");
  }, [searchParams]);

  const setTab = (tab: TabKey, extra?: Record<string, string>) => {
    setSearchParams({ tab, ...extra }, { replace: true });
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--gradient-bg)" }}>
      <Navbar onNewProject={() => setDialogOpen(true)} />
      <NewProjectDialog open={dialogOpen} onOpenChange={setDialogOpen} onProjectCreated={() => {}} />

      <main className="flex-1 container mx-auto px-4 py-6 space-y-6">
        <h1 className="text-2xl font-bold font-display text-foreground">Operations Dashboard</h1>

        {/* Tabs */}
        <div className="flex flex-wrap gap-2">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => {
                if (tab.href) {
                  navigate(tab.href);
                } else {
                  setTab(tab.key);
                }
              }}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? "bg-primary text-primary-foreground"
                  : "bg-card/60 text-muted-foreground hover:text-foreground hover:bg-secondary/60 border border-border/40"
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="rounded-xl border border-border/40 bg-card/40 p-4">
          {activeTab === "hub" && orgId && (
            <HubTab orgId={orgId} onSwitchTab={(tab, extra) => setTab(tab as TabKey, extra)} />
          )}
          {activeTab === "projects" && orgId && (
            <ProjectsTab orgId={orgId} />
          )}
          {activeTab === "inventory" && orgId && (
            <div className="space-y-4">
              <div className="flex gap-2">
                <button
                  onClick={() => setInventoryView("bull")}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                    inventoryView === "bull"
                      ? "bg-primary text-primary-foreground"
                      : "bg-card/60 text-muted-foreground hover:text-foreground hover:bg-secondary/60 border border-border/40"
                  )}
                >
                  By Bull
                </button>
                <button
                  onClick={() => setInventoryView("planning")}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                    inventoryView === "planning"
                      ? "bg-primary text-primary-foreground"
                      : "bg-card/60 text-muted-foreground hover:text-foreground hover:bg-secondary/60 border border-border/40"
                  )}
                >
                  Planning
                </button>
              </div>

              {inventoryView === "bull" && (
                <InventoryTab orgId={orgId} initialOwnerFilter={inventoryOwnerFilter} onFilterReset={() => setSearchParams({ tab: "inventory" }, { replace: true })} />
              )}
              {inventoryView === "planning" && (
                <Planning embedded />
              )}
            </div>
          )}
          {activeTab === "tanks" && orgId && (
            <TanksTabContent orgId={orgId} orgName={orgName ?? null} userId={userId ?? null} companyOnly={false} initialSubTab={searchParams.get("subTab") || undefined} />
          )}
          {activeTab === "orders" && orgId && (
            <OrdersTab orgId={orgId} />
          )}
          {activeTab === "customers" && orgId && (
            <CustomersTab orgId={orgId} />
          )}
          {activeTab === "log" && orgId && <LogTab orgId={orgId} />}
        </div>
      </main>

      <AppFooter />
    </div>
  );
};

export default OperationsDashboard;
