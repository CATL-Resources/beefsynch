import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Navbar from "@/components/Navbar";
import AppFooter from "@/components/AppFooter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Search,
  AlertTriangle,
  Clock,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CalendarClock,
  Download,
} from "lucide-react";
import { format, differenceInDays, parseISO } from "date-fns";
import { exportToCsv, type ExportColumn } from "@/lib/exports";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";


interface PlanningRow {
  bull_catalog_id: string;
  bull_name: string;
  naab_code: string | null;
  company: string | null;
  on_hand: number;
  customer_supply: number;
  incoming: number;
  customer_orders: number;
  project_needs: number;
  customer_project_needs: number;
  net_position: number;
  needed_by: string | null;
  active_projects: number;
  customer_order_count: number;
  status: "short" | "incoming" | "ok";
}

export default function Planning({ embedded = false }: { embedded?: boolean }) {
  const navigate = useNavigate();
  const [rows, setRows] = useState<PlanningRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [shortsOnly, setShortsOnly] = useState(false);
  const [okExpanded, setOkExpanded] = useState(false);
  const [expandedBull, setExpandedBull] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailData, setDetailData] = useState<{
    projects: { id: string; name: string; breedingDate: string | null; status: string; units: number }[];
    customerOrders: { orderId: string; customerName: string; units: number; orderDate: string | null; status: string }[];
    inventoryOrders: { orderId: string; units: number; orderDate: string | null; status: string }[];
    locations: { tank: string; canister: string; units: number; owner: string }[];
  } | null>(null);

  async function loadBullDetail(bullCatalogId: string) {
    setDetailLoading(true);
    setDetailData(null);

    const { data: projBulls } = await supabase
      .from("project_bulls")
      .select("units, project_id, projects(id, name, breeding_date, status)")
      .eq("bull_catalog_id", bullCatalogId);

    const projects = (projBulls ?? [])
      .filter((pb: any) => pb.projects && ["Confirmed", "Tentative"].includes(pb.projects.status))
      .map((pb: any) => ({
        id: pb.projects.id,
        name: pb.projects.name,
        breedingDate: pb.projects.breeding_date,
        status: pb.projects.status,
        units: pb.units,
      }))
      .sort((a: any, b: any) => (a.breedingDate ?? "").localeCompare(b.breedingDate ?? ""));

    const { data: custItems } = await supabase
      .from("semen_order_items")
      .select("units, semen_order_id, semen_orders(id, order_type, fulfillment_status, order_date, customer_id, customers!semen_orders_customer_id_fkey(name))")
      .eq("bull_catalog_id", bullCatalogId);

    const customerOrders = (custItems ?? [])
      .filter((item: any) =>
        item.semen_orders?.order_type === "customer" &&
        ["pending", "partially_fulfilled"].includes(item.semen_orders?.fulfillment_status)
      )
      .map((item: any) => ({
        orderId: item.semen_orders.id,
        customerName: item.semen_orders.customers?.name ?? "Unknown",
        units: item.units,
        orderDate: item.semen_orders.order_date,
        status: item.semen_orders.fulfillment_status,
      }));

    const inventoryOrders = (custItems ?? [])
      .filter((item: any) =>
        item.semen_orders?.order_type === "inventory" &&
        ["pending", "partially_fulfilled"].includes(item.semen_orders?.fulfillment_status)
      )
      .map((item: any) => ({
        orderId: item.semen_orders.id,
        units: item.units,
        orderDate: item.semen_orders.order_date,
        status: item.semen_orders.fulfillment_status,
      }));

    // On-hand locations (which tanks hold stock for this bull)
    const { data: locationData } = await supabase
      .from("tank_inventory")
      .select("units, canister, owner, tanks!tank_inventory_tank_id_fkey(tank_name, tank_number)")
      .eq("bull_catalog_id", bullCatalogId)
      .is("customer_id", null)
      .gt("units", 0);

    const locations = (locationData ?? []).map((row: any) => ({
      tank: row.tanks?.tank_name || row.tanks?.tank_number || "—",
      canister: row.canister || "?",
      units: row.units,
      owner: row.owner || "—",
    }));

    setDetailData({ projects, customerOrders, inventoryOrders, locations });
    setDetailLoading(false);
  }

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data, error } = await supabase
        .from("view_bull_planning")
        .select("*");
      if (error) {
        console.error("Planning load error:", error);
        setRows([]);
      } else {
        setRows((data ?? []) as PlanningRow[]);
      }
      setLoading(false);
    }
    load();
  }, []);

  const summary = useMemo(() => {
    const bullsShort = rows.filter((r) => r.status === "short").length;
    const bullsIncoming = rows.filter((r) => r.status === "incoming").length;
    const bullsOk = rows.filter((r) => r.status === "ok").length;
    const unitsShort = rows.reduce(
      (sum, r) => (r.net_position < 0 ? sum + Math.abs(r.net_position) : sum),
      0,
    );
    return { bullsShort, bullsIncoming, bullsOk, unitsShort };
  }, [rows]);

  const companies = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => s.add(r.company ?? "Custom"));
    return Array.from(s).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    let r = rows;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      r = r.filter(
        (row) =>
          (row.bull_name ?? "").toLowerCase().includes(q) ||
          (row.naab_code ?? "").toLowerCase().includes(q),
      );
    }
    if (companyFilter !== "all") {
      r = r.filter((row) => (row.company ?? "Custom") === companyFilter);
    }
    if (shortsOnly) {
      r = r.filter((row) => row.status === "short");
    }
    return r;
  }, [rows, search, companyFilter, shortsOnly]);

  function sortRows(list: PlanningRow[]) {
    return [...list].sort((a, b) => {
      if (a.needed_by === null && b.needed_by !== null) return 1;
      if (a.needed_by !== null && b.needed_by === null) return -1;
      if (a.needed_by !== null && b.needed_by !== null) {
        const da = a.needed_by.localeCompare(b.needed_by);
        if (da !== 0) return da;
      }
      return a.net_position - b.net_position;
    });
  }

  const shortRows = sortRows(filtered.filter((r) => r.status === "short"));
  const incomingRows = sortRows(filtered.filter((r) => r.status === "incoming"));
  const okRows = [...filtered.filter((r) => r.status === "ok")].sort(
    (a, b) => a.net_position - b.net_position,
  );

  /**
   * Build a CSV of every SHORT bull so Chandy can send order lists to vendors.
   * Respects the current filters (search, company, shorts-only toggle).
   * Sort order: Company → Needed By (soonest first, nulls last) → Bull Name.
   * Units Needed = absolute value of net_position (negative for shorts).
   */
  function handleExportShortCsv() {
    const exportRows = [...shortRows].sort((a, b) => {
      const ca = a.company ?? "";
      const cb = b.company ?? "";
      if (ca !== cb) return ca.localeCompare(cb);
      if (a.needed_by === null && b.needed_by !== null) return 1;
      if (a.needed_by !== null && b.needed_by === null) return -1;
      if (a.needed_by !== null && b.needed_by !== null) {
        const d = a.needed_by.localeCompare(b.needed_by);
        if (d !== 0) return d;
      }
      return (a.bull_name ?? "").localeCompare(b.bull_name ?? "");
    });

    const columns: ExportColumn<PlanningRow>[] = [
      { label: "Company", value: (r) => r.company ?? "" },
      { label: "NAAB Code", value: (r) => r.naab_code ?? "" },
      { label: "Bull Name", value: (r) => r.bull_name ?? "" },
      { label: "On Hand", value: (r) => r.on_hand },
      { label: "Customer Supply", value: (r) => r.customer_supply },
      { label: "Units Needed", value: (r) => Math.abs(r.net_position) },
      { label: "Needed By", value: (r) => (r.needed_by ? r.needed_by : "") },
    ];

    exportToCsv(
      {
        title: "Bull Order List",
        filenameBase: "beefsynch_order_list",
        columns,
      },
      exportRows,
    );
  }

  function actionText(r: PlanningRow): string {
    const totalDemand = r.customer_orders + r.project_needs;
    const supply = r.on_hand + r.incoming;
    if (r.status === "short") {
      const need = totalDemand - supply;
      return `Order +${need}`;
    }
    if (r.status === "incoming") {
      return "Covered once received";
    }
    const surplus = r.on_hand - totalDemand;
    return `+${surplus} surplus`;
  }

  function daysBadge(needed_by: string | null) {
    if (!needed_by) return null;
    const days = differenceInDays(parseISO(needed_by), new Date());
    if (days < 0) {
      return (
        <Badge variant="outline" className="border-red-500/40 text-red-300 bg-red-500/10">
          {Math.abs(days)}d overdue
        </Badge>
      );
    }
    if (days < 30) {
      return (
        <Badge variant="outline" className="border-red-500/40 text-red-300 bg-red-500/10">
          in {days}d
        </Badge>
      );
    }
    if (days < 60) {
      return (
        <Badge variant="outline" className="border-amber-500/40 text-amber-300 bg-amber-500/10">
          in {days}d
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="border-border/60 text-muted-foreground">
        in {days}d
      </Badge>
    );
  }

  function statusActionClass(status: PlanningRow["status"]) {
    if (status === "short") return "text-red-300 font-semibold";
    if (status === "incoming") return "text-amber-300 font-semibold";
    return "text-emerald-300 font-semibold";
  }

  function BullRow({ r }: { r: PlanningRow }) {
    const isExpanded = expandedBull === r.bull_catalog_id;

    const handleToggle = () => {
      if (isExpanded) {
        setExpandedBull(null);
        setDetailData(null);
      } else {
        setExpandedBull(r.bull_catalog_id);
        loadBullDetail(r.bull_catalog_id);
      }
    };

    return (
      <div className="rounded-lg border border-border/40 bg-card/40 transition-colors">
        {/* Clickable header */}
        <div
          className="cursor-pointer hover:bg-card/70 rounded-lg"
          onClick={handleToggle}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleToggle();
          }}
        >
          {/* Desktop layout */}
          <div className="hidden md:grid grid-cols-[2fr_repeat(5,_minmax(0,_1fr))_1.6fr_1.2fr] gap-3 items-center px-4 py-3 text-sm">
            <div className="min-w-0">
              <div className="font-medium text-foreground truncate">{r.bull_name}</div>
              <div className="text-xs text-muted-foreground truncate">
                {r.naab_code ?? "—"}
                {r.company ? ` • ${r.company}` : ""}
              </div>
            </div>
            <div className="text-center">
              <div className="text-foreground font-medium">{r.on_hand}</div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">on hand</div>
            </div>
            <div className="text-center">
              {r.customer_supply > 0 ? (
                <div className="text-emerald-600 dark:text-emerald-400 font-medium">{r.customer_supply}</div>
              ) : (
                <div className="text-muted-foreground">—</div>
              )}
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">customer</div>
            </div>
            <div className="text-center">
              <div className="text-foreground font-medium">{r.incoming}</div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">incoming</div>
            </div>
            <div className="text-center">
              <div className="text-foreground font-medium">{r.customer_orders}</div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">cust</div>
            </div>
            <div className="text-center">
              <div className="text-foreground font-medium">{r.project_needs}</div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">proj</div>
            </div>
            <div className="text-sm text-muted-foreground">
              {r.needed_by ? (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-foreground">
                    {format(parseISO(r.needed_by), "MMM d, yyyy")}
                  </span>
                  {daysBadge(r.needed_by)}
                </div>
              ) : (
                "—"
              )}
            </div>
            <div className={`text-right ${statusActionClass(r.status)}`}>{actionText(r)}</div>
          </div>

          {/* Mobile layout */}
          <div className="md:hidden p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium text-foreground truncate">{r.bull_name}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {r.naab_code ?? "—"}
                  {r.company ? ` • ${r.company}` : ""}
                </div>
              </div>
              <div className={`text-sm ${statusActionClass(r.status)}`}>{actionText(r)}</div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-muted-foreground">On hand: </span>
                <span className="text-foreground font-medium">{r.on_hand}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Customer: </span>
                {r.customer_supply > 0 ? (
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium">{r.customer_supply}</span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </div>
              <div>
                <span className="text-muted-foreground">Incoming: </span>
                <span className="text-foreground font-medium">{r.incoming}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Customer: </span>
                <span className="text-foreground font-medium">{r.customer_orders}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Projects: </span>
                <span className="text-foreground font-medium">{r.project_needs}</span>
              </div>
            </div>
            {r.needed_by && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <CalendarClock className="h-3.5 w-3.5" />
                <span className="text-foreground">
                  {format(parseISO(r.needed_by), "MMM d, yyyy")}
                </span>
                {daysBadge(r.needed_by)}
              </div>
            )}
          </div>
        </div>

        {/* Expanded detail panel */}
        {isExpanded && (
          <div className="border-t border-border/40 px-4 py-4 space-y-4 bg-background/40">
            {detailLoading ? (
              <div className="text-sm text-muted-foreground">Loading details…</div>
            ) : detailData ? (
              <>
                {/* Projects */}
                <div className="space-y-2">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
                    Projects ({detailData.projects.length})
                  </div>
                  {detailData.projects.length === 0 ? (
                    <div className="text-xs text-muted-foreground italic">No active projects need this bull</div>
                  ) : (
                    <div className="space-y-1.5">
                      {detailData.projects.map((p) => (
                        <div
                          key={p.id}
                          className="flex items-center justify-between gap-3 text-sm rounded-md border border-border/30 bg-card/40 px-3 py-2 cursor-pointer hover:bg-card/70 transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/project/${p.id}`);
                          }}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-foreground truncate">{p.name}</span>
                            <Badge variant="outline" className="text-[10px] shrink-0">
                              {p.status}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-3 shrink-0 text-xs">
                            <span className="text-foreground font-medium tabular-nums">{p.units}u</span>
                            {p.breedingDate && (
                              <span className="text-muted-foreground">
                                breed {format(parseISO(p.breedingDate), "MMM d")}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Customer Orders */}
                <div className="space-y-2">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
                    Customer Orders ({detailData.customerOrders.length})
                  </div>
                  {detailData.customerOrders.length === 0 ? (
                    <div className="text-xs text-muted-foreground italic">No open customer orders for this bull</div>
                  ) : (
                    <div className="space-y-1.5">
                      {detailData.customerOrders.map((o) => (
                        <div
                          key={o.orderId}
                          className="flex items-center justify-between gap-3 text-sm rounded-md border border-border/30 bg-card/40 px-3 py-2 cursor-pointer hover:bg-card/70 transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/semen-order/${o.orderId}`);
                          }}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-foreground truncate">{o.customerName}</span>
                            <Badge variant="outline" className="text-[10px] shrink-0">
                              {o.status.replace("_", " ")}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-3 shrink-0 text-xs">
                            <span className="text-foreground font-medium tabular-nums">{o.units}u</span>
                            {o.orderDate && (
                              <span className="text-muted-foreground">
                                ordered {format(parseISO(o.orderDate), "MMM d")}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Inventory Orders Placed */}
                <div className="space-y-2">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
                    Orders Placed ({detailData.inventoryOrders.length})
                  </div>
                  {detailData.inventoryOrders.length === 0 ? (
                    <div className="text-xs text-muted-foreground italic">No inventory orders placed for this bull</div>
                  ) : (
                    <div className="space-y-1.5">
                      {detailData.inventoryOrders.map((o) => (
                        <div
                          key={o.orderId}
                          className="flex items-center justify-between gap-3 text-sm rounded-md border border-border/30 bg-card/40 px-3 py-2 cursor-pointer hover:bg-card/70 transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/semen-order/${o.orderId}`);
                          }}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-foreground">Inventory order</span>
                            <Badge variant="outline" className="text-[10px] shrink-0">
                              {o.status.replace("_", " ")}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-3 shrink-0 text-xs">
                            <span className="text-foreground font-medium tabular-nums">{o.units}u</span>
                            {o.orderDate && (
                              <span className="text-muted-foreground">
                                ordered {format(parseISO(o.orderDate), "MMM d")}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* On Hand Locations */}
                <div className="space-y-2">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
                    On Hand Locations ({detailData.locations.length})
                  </div>
                  {detailData.locations.length === 0 ? (
                    <div className="text-xs text-muted-foreground italic">No units currently in inventory</div>
                  ) : (
                    <div className="space-y-1.5">
                      {detailData.locations.map((loc, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between gap-3 text-sm rounded-md border border-border/30 bg-card/40 px-3 py-2"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-foreground truncate">{loc.tank}</span>
                            <span className="text-xs text-muted-foreground shrink-0">can {loc.canister}</span>
                          </div>
                          <div className="flex items-center gap-3 shrink-0 text-xs">
                            <span className="text-foreground font-medium tabular-nums">{loc.units}u</span>
                            <span className="text-muted-foreground">{loc.owner}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : null}
          </div>
        )}
      </div>
    );
  }

  function SectionHeader({
    icon: Icon,
    label,
    count,
    tone,
  }: {
    icon: typeof AlertTriangle;
    label: string;
    count: number;
    tone: "red" | "amber" | "emerald";
  }) {
    const toneClass =
      tone === "red"
        ? "text-red-300"
        : tone === "amber"
        ? "text-amber-300"
        : "text-emerald-300";
    return (
      <CardTitle className={`flex items-center gap-2 text-base ${toneClass}`}>
        <Icon className="h-4 w-4" />
        {label} ({count})
      </CardTitle>
    );
  }

  const content = (
    <div className="space-y-6">
        {!embedded && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(-1)}
            className="gap-2 -ml-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold font-display text-foreground">Planning</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Bulls with active demand and incoming supply.
            </p>
          </div>
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-block">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleExportShortCsv}
                    disabled={shortRows.length === 0}
                    className="gap-2"
                  >
                    <Download className="h-4 w-4" />
                    Export order list (CSV)
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {shortRows.length === 0
                  ? "No short bulls to export"
                  : `Export ${shortRows.length} short bull${shortRows.length === 1 ? "" : "s"} to CSV`}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Summary metric cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-red-500/30">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground font-normal">
                <AlertTriangle className="h-4 w-4 text-red-400" />
                Bulls short
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-red-300">{summary.bullsShort}</div>
            </CardContent>
          </Card>
          <Card className="border-amber-500/30">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground font-normal">
                <Clock className="h-4 w-4 text-amber-400" />
                Covered by incoming
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-amber-300">{summary.bullsIncoming}</div>
            </CardContent>
          </Card>
          <Card className="border-emerald-500/30">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground font-normal">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                Stock OK
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-emerald-300">{summary.bullsOk}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground font-normal">
                Units short
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground">
                {summary.unitsShort.toLocaleString()}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filter toolbar */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-[200px] max-w-sm relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search bull name or NAAB..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={companyFilter} onValueChange={setCompanyFilter}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="All companies" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All companies</SelectItem>
                  {companies.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant={shortsOnly ? "default" : "outline"}
                size="sm"
                onClick={() => setShortsOnly(!shortsOnly)}
              >
                Shorts only
              </Button>
            </div>
          </CardContent>
        </Card>

        {loading && (
          <div className="text-center py-12 text-muted-foreground">Loading…</div>
        )}

        {!loading && filtered.length === 0 && (
          <Card>
            <CardContent className="pt-6 text-center text-muted-foreground">
              {rows.length === 0
                ? "No active demand or incoming supply."
                : "No bulls match your filters."}
            </CardContent>
          </Card>
        )}

        {/* SHORT */}
        {!loading && shortRows.length > 0 && (
          <Card className="border-red-500/30">
            <CardHeader>
              <SectionHeader icon={AlertTriangle} label="Short" count={shortRows.length} tone="red" />
            </CardHeader>
            <CardContent className="space-y-2">
              {shortRows.map((r) => (
                <BullRow key={r.bull_catalog_id} r={r} />
              ))}
            </CardContent>
          </Card>
        )}

        {/* INCOMING */}
        {!loading && incomingRows.length > 0 && (
          <Card className="border-amber-500/30">
            <CardHeader>
              <SectionHeader
                icon={Clock}
                label="Covered by incoming"
                count={incomingRows.length}
                tone="amber"
              />
            </CardHeader>
            <CardContent className="space-y-2">
              {incomingRows.map((r) => (
                <BullRow key={r.bull_catalog_id} r={r} />
              ))}
            </CardContent>
          </Card>
        )}

        {/* OK — collapsed by default */}
        {!loading && okRows.length > 0 && (
          <Card className="border-emerald-500/30">
            <CardHeader
              className="cursor-pointer select-none"
              onClick={() => setOkExpanded(!okExpanded)}
            >
              <CardTitle className="flex items-center gap-2 text-base text-emerald-300">
                {okExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
                <CheckCircle2 className="h-4 w-4" />
                Stock OK ({okRows.length})
              </CardTitle>
            </CardHeader>
            {okExpanded && (
              <CardContent className="space-y-2">
                {okRows.map((r) => (
                  <BullRow key={r.bull_catalog_id} r={r} />
                ))}
              </CardContent>
            )}
          </Card>
        )}
    </div>
  );

  if (embedded) return content;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--gradient-bg)" }}>
      <Navbar />
      <main className="flex-1 container mx-auto px-4 py-6">
        {content}
      </main>
      <AppFooter />
    </div>
  );
}
