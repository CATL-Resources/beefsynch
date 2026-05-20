import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Loader2, Search, Download, CalendarIcon, X, Plus, Package, ChevronDown, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import TableSkeleton from "@/components/TableSkeleton";
import EmptyState from "@/components/EmptyState";
import { cn } from "@/lib/utils";
import { getBadgeClass } from "@/lib/badgeStyles";

/* ── Packs constants ── */
const STATUS_LABELS: Record<string, string> = {
  packed: "Packed",
  in_field: "In Field",
  shipped: "Shipped",
  delivered: "Delivered",
  picked_up: "Picked Up",
  unpacked: "Unpacked",
  tank_returned: "Tank Returned",
  cancelled: "Cancelled",
};

const TYPE_LABELS: Record<string, string> = {
  project: "Project",
  shipment: "Shipment",
  order: "Order",
  pickup: "Pickup",
};

/* Customer-outbound pack types — get WS7 polish (status pills, order names, Received section). */
const CUSTOMER_OUTBOUND = new Set(["shipment", "pickup", "order"]);
const isCustomerOutbound = (t: string) => CUSTOMER_OUTBOUND.has(t);

/* Per-pack-type "received" status set. */
const RECEIVED_BY_TYPE: Record<string, Set<string>> = {
  shipment: new Set(["delivered", "tank_returned"]),
  pickup: new Set(["picked_up", "tank_returned"]),
  order: new Set(["picked_up", "tank_returned"]),
};
const isReceivedRow = (row: any) =>
  isCustomerOutbound(row.pack_type) &&
  (RECEIVED_BY_TYPE[row.pack_type]?.has(row.status) ?? false);

/* Per-pack-type pill label for "packed". */
const PACKED_LABEL_BY_TYPE: Record<string, string> = {
  shipment: "Ready to Ship",
  pickup: "Ready for Pickup",
  order: "Ready for Pickup",
};

type OutboundPill = { label: string; className: string };
const OUTBOUND_PILL_CLASSES: Record<string, string> = {
  blue: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  amber: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  green: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  gray: "bg-muted text-muted-foreground border-border",
  red: "bg-destructive/20 text-destructive border-destructive/30",
};
const getOutboundPill = (row: any): OutboundPill | null => {
  if (!isCustomerOutbound(row.pack_type)) return null;
  switch (row.status) {
    case "packed":
      return { label: PACKED_LABEL_BY_TYPE[row.pack_type] ?? "Ready", className: OUTBOUND_PILL_CLASSES.blue };
    case "shipped":
      return row.pack_type === "shipment"
        ? { label: "In Transit", className: OUTBOUND_PILL_CLASSES.amber }
        : null;
    case "delivered":
      return row.pack_type === "shipment"
        ? { label: "Delivered", className: OUTBOUND_PILL_CLASSES.green }
        : null;
    case "picked_up":
      return row.pack_type === "pickup" || row.pack_type === "order"
        ? { label: "Picked Up", className: OUTBOUND_PILL_CLASSES.green }
        : null;
    case "tank_returned":
      return { label: "Returned", className: OUTBOUND_PILL_CLASSES.gray };
    case "cancelled":
      return { label: "Cancelled", className: OUTBOUND_PILL_CLASSES.red };
    default:
      return null;
  }
};

/* Build "Customer — MMM d" labels from linked semen_orders. */
const getOrderLabels = (row: any): string => {
  const orders = (row.tank_pack_orders || []);
  if (orders.length === 0) return "";
  const labels: string[] = [];
  for (const o of orders) {
    const so = o?.semen_orders;
    if (!so) continue;
    const name = so.customers?.name || "Unknown customer";
    const date = so.order_date ? format(new Date(so.order_date), "MMM d") : null;
    labels.push(date ? `${name} — ${date}` : name);
  }
  return labels.join(", ");
};

/* ── PacksList ── */
const PacksList = ({ orgId }: { orgId: string }) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"active" | "all" | "completed">("active");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();

  const { data: packs = [], isLoading } = useQuery({
    queryKey: ["packs", "all", orgId, statusFilter, typeFilter, dateFrom?.toISOString(), dateTo?.toISOString()],
    queryFn: async () => {
      if (!orgId) return [];
      let query = supabase
        .from("tank_packs")
        .select(`
          id, packed_at, packed_by, status, pack_type, destination_name, field_tank_id, notes, customer_id,
          tanks!tank_packs_field_tank_id_fkey(tank_name, tank_number),
          tank_pack_lines(id, units),
          tank_pack_projects(project_id, projects!tank_pack_projects_project_id_fkey(name)),
          tank_pack_orders(semen_order_id, semen_orders(id, order_date, customers!semen_orders_customer_id_fkey(name))),
          customers!tank_packs_customer_id_fkey(name)
        `)
        .eq("organization_id", orgId)
        .order("packed_at", { ascending: false })
        .range(0, 999);

      if (statusFilter !== "all") query = query.eq("status", statusFilter);
      if (typeFilter !== "all") query = query.eq("pack_type", typeFilter);
      if (dateFrom) query = query.gte("packed_at", format(dateFrom, "yyyy-MM-dd"));
      if (dateTo) query = query.lte("packed_at", format(dateTo, "yyyy-MM-dd") + "T23:59:59");

      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!orgId,
  });

  const COMPLETED_STATUSES = new Set(["unpacked", "tank_returned", "cancelled"]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return packs.filter((row: any) => {
      // View mode filter
      const isCompleted = COMPLETED_STATUSES.has(row.status);
      if (viewMode === "active" && isCompleted) return false;
      if (viewMode === "completed" && !isCompleted) return false;

      if (!q) return true;
      const fieldTank = row.tanks as any;
      const tankLabel = (fieldTank?.tank_name || fieldTank?.tank_number || "").toLowerCase();
      const dest = (row.destination_name || "").toLowerCase();
      const packedBy = (row.packed_by || "").toLowerCase();
      const projects = (row.tank_pack_projects || []);
      const projNames = projects.map((p: any) => (p.projects?.name || "").toLowerCase()).join(" ");
      const orders = (row.tank_pack_orders || []);
      const orderNames = orders.map((o: any) => (o.semen_orders?.customers?.name || "").toLowerCase()).join(" ");
      return tankLabel.includes(q) || dest.includes(q) || packedBy.includes(q) || projNames.includes(q) || orderNames.includes(q);
    });
  }, [packs, search, viewMode]);

  // Split into active (everything not in Received) and received (customer-outbound only,
  // type-appropriate received statuses). Cancelled customer-outbound rows stay active.
  // Project rows are NEVER moved into Received.
  const { activeRows, receivedRows } = useMemo(() => {
    const active: any[] = [];
    const received: any[] = [];
    for (const row of filtered) {
      if (isReceivedRow(row)) received.push(row);
      else active.push(row);
    }
    // Active sort: keep original packed_at DESC from query, but push cancelled
    // customer-outbound rows to the bottom of the active list.
    active.sort((a, b) => {
      const aCancelled = isCustomerOutbound(a.pack_type) && a.status === "cancelled" ? 1 : 0;
      const bCancelled = isCustomerOutbound(b.pack_type) && b.status === "cancelled" ? 1 : 0;
      if (aCancelled !== bCancelled) return aCancelled - bCancelled;
      const aT = a.packed_at ? new Date(a.packed_at).getTime() : 0;
      const bT = b.packed_at ? new Date(b.packed_at).getTime() : 0;
      return bT - aT;
    });
    // Received sort: most recent first (no per-status timestamps in schema, fall back to packed_at).
    received.sort((a, b) => {
      const aT = a.packed_at ? new Date(a.packed_at).getTime() : 0;
      const bT = b.packed_at ? new Date(b.packed_at).getTime() : 0;
      return bT - aT;
    });
    return { activeRows: active, receivedRows: received };
  }, [filtered]);

  const [showReceived, setShowReceived] = useState(false);

  const fieldTankLabel = (row: any) => {
    const t = row.tanks as any;
    return t?.tank_name || t?.tank_number || "—";
  };

  const getDestination = (row: any): string => {
    if (row.pack_type === "pickup") {
      const custName = (row.customers as any)?.name;
      return custName ? `Customer: ${custName}` : "Customer pickup";
    }
    if (row.pack_type === "shipment") return row.destination_name ? `Ship to: ${row.destination_name}` : "—";
    if (row.pack_type === "order") {
      const orders = (row.tank_pack_orders || []);
      if (orders.length === 0) return "—";
      const first = orders[0]?.semen_orders?.customers?.name || "—";
      return orders.length > 1 ? `${first} (+${orders.length - 1} more)` : first;
    }
    const projects = (row.tank_pack_projects || []);
    if (projects.length === 0) return "—";
    return projects.map((p: any) => p?.projects?.name || "—").join(", ");
  };

  const getLineStats = (row: any) => {
    const lines = (row.tank_pack_lines || []);
    return {
      count: lines.length,
      units: lines.reduce((s: number, l: any) => s + (l.units || 0), 0),
    };
  };


  const handleExportCsv = () => {
    const headers = ["Packed Date", "Field Tank", "Type", "Destination", "Lines", "Units", "Status", "Packed By", "Notes"];
    const rows = filtered.map((row: any) => {
      const stats = getLineStats(row);
      return [
        row.packed_at ? format(new Date(row.packed_at), "yyyy-MM-dd") : "",
        fieldTankLabel(row),
        row.pack_type || "",
        `"${getDestination(row)}"`,
        stats.count,
        stats.units,
        row.status || "",
        row.packed_by || "",
        `"${(row.notes || "").replace(/"/g, '""')}"`,
      ].join(",");
    });
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `packs-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const hasFilters = search.trim() || statusFilter !== "all" || typeFilter !== "all" || dateFrom || dateTo;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div />
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleExportCsv} disabled={filtered.length === 0}>
            <Download className="h-4 w-4 mr-2" /> Export CSV
          </Button>
        </div>
      </div>

      {/* View chips */}
      <div className="flex flex-wrap items-center gap-2">
        {([
          { key: "active", label: "Active" },
          { key: "all", label: "All" },
          { key: "completed", label: "Completed" },
        ] as const).map((opt) => (
          <button
            key={opt.key}
            onClick={() => setViewMode(opt.key)}
            className={cn(
              "px-3 py-1.5 rounded-full text-sm font-medium border transition-colors",
              viewMode === opt.key
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-muted-foreground border-border hover:text-foreground hover:bg-secondary"
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search destination, tank, project…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="packed">Packed</SelectItem>
            <SelectItem value="in_field">In Field</SelectItem>
            <SelectItem value="shipped">Shipped</SelectItem>
            <SelectItem value="delivered">Delivered</SelectItem>
            <SelectItem value="picked_up">Picked Up</SelectItem>
            <SelectItem value="unpacked">Unpacked</SelectItem>
            <SelectItem value="tank_returned">Tank Returned</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="project">Project</SelectItem>
            <SelectItem value="shipment">Shipment</SelectItem>
            <SelectItem value="order">Order</SelectItem>
            <SelectItem value="pickup">Pickup</SelectItem>
          </SelectContent>
        </Select>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className={cn("w-[150px] justify-start text-left font-normal", !dateFrom && "text-muted-foreground")}>
              <CalendarIcon className="mr-2 h-4 w-4" />
              {dateFrom ? format(dateFrom, "MMM d, yyyy") : "From"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} className="p-3 pointer-events-auto" />
          </PopoverContent>
        </Popover>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className={cn("w-[150px] justify-start text-left font-normal", !dateTo && "text-muted-foreground")}>
              <CalendarIcon className="mr-2 h-4 w-4" />
              {dateTo ? format(dateTo, "MMM d, yyyy") : "To"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={dateTo} onSelect={setDateTo} className="p-3 pointer-events-auto" />
          </PopoverContent>
        </Popover>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setStatusFilter("all"); setTypeFilter("all"); setDateFrom(undefined); setDateTo(undefined); }}>
            <X className="h-4 w-4 mr-1" /> Clear
          </Button>
        )}
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <TableSkeleton rows={6} columns={8} />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Package}
              title={hasFilters ? "No matching packs" : "No packs yet"}
              description={hasFilters ? "No packs match your filters. Try adjusting or clearing filters." : "Click '+ Pack Tank' to create your first pack."}
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Packed Date</TableHead>
                    <TableHead>Field Tank</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Destination</TableHead>
                    <TableHead className="text-right">Lines</TableHead>
                    <TableHead className="text-right">Units</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Packed By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeRows.map((row: any) => {
                    const stats = getLineStats(row);
                    const outbound = isCustomerOutbound(row.pack_type);
                    const pill = getOutboundPill(row);
                    const orderLabels = outbound ? getOrderLabels(row) : "";
                    return (
                      <TableRow key={row.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/pack/${row.id}`)}>
                        <TableCell>{row.packed_at ? format(new Date(row.packed_at), "MMM d, yyyy") : "—"}</TableCell>
                        <TableCell className="font-medium">{fieldTankLabel(row)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs capitalize">{TYPE_LABELS[row.pack_type] || row.pack_type}</Badge>
                        </TableCell>
                        <TableCell className="text-sm max-w-[240px]">
                          {outbound ? (
                            <div className="truncate">
                              <div className="truncate">{getDestination(row)}</div>
                              <div className={cn("truncate text-xs", orderLabels ? "text-muted-foreground" : "text-muted-foreground/60 italic")}>
                                {orderLabels ? `Order${(row.tank_pack_orders || []).length > 1 ? "s" : ""}: ${orderLabels}` : "No orders linked"}
                              </div>
                            </div>
                          ) : (
                            <div className="truncate">{getDestination(row)}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-right">{stats.count}</TableCell>
                        <TableCell className="text-right">{stats.units}</TableCell>
                        <TableCell>
                          {pill ? (
                            <Badge variant="outline" className={cn("text-xs whitespace-nowrap", pill.className)}>{pill.label}</Badge>
                          ) : (
                            <Badge variant="outline" className={cn("text-xs", getBadgeClass('packStatus', row.status))}>{STATUS_LABELS[row.status] || row.status}</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{row.packed_by || "—"}</TableCell>
                      </TableRow>
                    );
                  })}
                  {receivedRows.length > 0 && (
                    <>
                      <TableRow
                        className="cursor-pointer bg-muted/30 hover:bg-muted/50 border-t-2 border-border"
                        onClick={() => setShowReceived((v) => !v)}
                      >
                        <TableCell colSpan={8} className="py-2">
                          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                            {showReceived ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            Received Packs ({receivedRows.length})
                          </div>
                        </TableCell>
                      </TableRow>
                      {showReceived && receivedRows.map((row: any) => {
                        const stats = getLineStats(row);
                        const pill = getOutboundPill(row);
                        const orderLabels = getOrderLabels(row);
                        return (
                          <TableRow key={row.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/pack/${row.id}`)}>
                            <TableCell>{row.packed_at ? format(new Date(row.packed_at), "MMM d, yyyy") : "—"}</TableCell>
                            <TableCell className="font-medium">{fieldTankLabel(row)}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs capitalize">{TYPE_LABELS[row.pack_type] || row.pack_type}</Badge>
                            </TableCell>
                            <TableCell className="text-sm max-w-[240px]">
                              <div className="truncate">
                                <div className="truncate">{getDestination(row)}</div>
                                <div className={cn("truncate text-xs", orderLabels ? "text-muted-foreground" : "text-muted-foreground/60 italic")}>
                                  {orderLabels ? `Order${(row.tank_pack_orders || []).length > 1 ? "s" : ""}: ${orderLabels}` : "No orders linked"}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="text-right">{stats.count}</TableCell>
                            <TableCell className="text-right">{stats.units}</TableCell>
                            <TableCell>
                              {pill ? (
                                <Badge variant="outline" className={cn("text-xs whitespace-nowrap", pill.className)}>{pill.label}</Badge>
                              ) : (
                                <Badge variant="outline" className={cn("text-xs", getBadgeClass('packStatus', row.status))}>{STATUS_LABELS[row.status] || row.status}</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">{row.packed_by || "—"}</TableCell>
                          </TableRow>
                        );
                      })}
                    </>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

/* ── UnpacksList ── */
const UnpacksList = ({ orgId }: { orgId: string }) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  

  const { data: unpacks = [], isLoading } = useQuery({
    queryKey: ["unpacks", orgId, dateFrom?.toISOString(), dateTo?.toISOString()],
    queryFn: async () => {
      if (!orgId) return [];
      let query = supabase
        .from("tank_packs")
        .select(`
          id, unpacked_at, unpacked_by, field_tank_id, packed_at,
          tanks!tank_packs_field_tank_id_fkey(tank_name, tank_number),
          tank_unpack_lines(id, units_returned, destination_tank_id, bull_name,
            tanks!tank_unpack_lines_destination_tank_id_fkey(tank_name, tank_number)),
          tank_pack_projects(project_id,
            projects!tank_pack_projects_project_id_fkey(name))
        `)
        .eq("organization_id", orgId)
        .eq("status", "unpacked")
        .order("unpacked_at", { ascending: false })
        .range(0, 999);

      if (dateFrom) query = query.gte("unpacked_at", dateFrom.toISOString());
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        query = query.lte("unpacked_at", end.toISOString());
      }

      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!orgId,
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return unpacks;
    const q = search.toLowerCase();
    return unpacks.filter((row: any) => {
      const fieldTank = row.tanks as any;
      const tankLabel = (fieldTank?.tank_name || fieldTank?.tank_number || "").toLowerCase();
      const projects = (row.tank_pack_projects || []);
      const projNames = projects.map((p: any) => (p.projects?.name || "").toLowerCase()).join(" ");
      const unpackedBy = (row.unpacked_by || "").toLowerCase();
      return tankLabel.includes(q) || projNames.includes(q) || unpackedBy.includes(q);
    });
  }, [unpacks, search]);

  const getRowStats = (row: any) => {
    const lines = (row.tank_unpack_lines || []);
    const totalReturned = lines.reduce((s: number, l: any) => s + (l.units_returned || 0), 0);
    const destTanks = new Set<string>();
    for (const l of lines) {
      const t = l.tanks as any;
      if (t) destTanks.add(t.tank_name || t.tank_number || "Unknown");
    }
    return { lineCount: lines.length, totalReturned, returnedTo: destTanks.size > 0 ? Array.from(destTanks).join(", ") : "—" };
  };

  const fieldTankLabel = (row: any) => {
    const t = row.tanks as any;
    return t?.tank_name || t?.tank_number || "—";
  };


  const handleExportCsv = () => {
    const headers = ["Unpacked Date", "Field Tank", "Pack ID", "Returned To", "Lines", "Units Returned", "Unpacked By"];
    const rows = filtered.map((row: any) => {
      const stats = getRowStats(row);
      return [
        row.unpacked_at ? format(new Date(row.unpacked_at), "yyyy-MM-dd HH:mm") : "",
        fieldTankLabel(row),
        row.id,
        stats.returnedTo,
        stats.lineCount,
        stats.totalReturned,
        row.unpacked_by || "",
      ].join(",");
    });
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `unpacks-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const hasFilters = search.trim() || dateFrom || dateTo;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div />
        <Button variant="outline" onClick={handleExportCsv} disabled={filtered.length === 0}>
          <Download className="h-4 w-4 mr-2" /> Export CSV
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search tank, project, unpacker…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className={cn("w-[150px] justify-start text-left font-normal", !dateFrom && "text-muted-foreground")}>
              <CalendarIcon className="mr-2 h-4 w-4" />
              {dateFrom ? format(dateFrom, "MMM d, yyyy") : "From"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} className="p-3 pointer-events-auto" />
          </PopoverContent>
        </Popover>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className={cn("w-[150px] justify-start text-left font-normal", !dateTo && "text-muted-foreground")}>
              <CalendarIcon className="mr-2 h-4 w-4" />
              {dateTo ? format(dateTo, "MMM d, yyyy") : "To"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={dateTo} onSelect={setDateTo} className="p-3 pointer-events-auto" />
          </PopoverContent>
        </Popover>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setDateFrom(undefined); setDateTo(undefined); }}>
            <X className="h-4 w-4 mr-1" /> Clear
          </Button>
        )}
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <TableSkeleton rows={6} columns={8} />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Package}
              title={hasFilters ? "No matching unpacks" : "No unpacks yet"}
              description={hasFilters ? "No unpacks match your filters. Try adjusting or clearing filters." : "Unpacks happen from a pack's detail page after a pack returns from the field."}
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Unpacked Date</TableHead>
                    <TableHead>Field Tank</TableHead>
                    <TableHead>Original Pack</TableHead>
                    <TableHead>Returned To</TableHead>
                    <TableHead className="text-right">Lines</TableHead>
                    <TableHead className="text-right">Units Returned</TableHead>
                    <TableHead>Unpacked By</TableHead>
                    
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((row: any) => {
                    const stats = getRowStats(row);
                    return (
                      <TableRow key={row.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/pack/${row.id}`)}>
                        <TableCell>{row.unpacked_at ? format(new Date(row.unpacked_at), "MMM d, yyyy") : "—"}</TableCell>
                        <TableCell className="font-medium">{fieldTankLabel(row)}</TableCell>
                        <TableCell>
                          <button className="text-primary hover:underline text-sm" onClick={(e) => { e.stopPropagation(); navigate(`/pack/${row.id}`); }}>
                            {row.packed_at ? format(new Date(row.packed_at), "MMM d") : row.id.slice(0, 8)}
                          </button>
                        </TableCell>
                        <TableCell className="text-sm">{stats.returnedTo}</TableCell>
                        <TableCell className="text-right">{stats.lineCount}</TableCell>
                        <TableCell className="text-right">{stats.totalReturned}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{row.unpacked_by || "—"}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

/* ── PackingTab ── */
const PackingTab = ({ orgId }: { orgId: string }) => {
  const [subTab, setSubTab] = useState<"packs" | "unpacks">("packs");

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button
          onClick={() => setSubTab("packs")}
          className={cn(
            "inline-flex items-center rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
            subTab === "packs"
              ? "bg-primary text-primary-foreground"
              : "bg-card/60 text-muted-foreground hover:text-foreground hover:bg-secondary/60 border border-border/40"
          )}
        >
          Packs
        </button>
        <button
          onClick={() => setSubTab("unpacks")}
          className={cn(
            "inline-flex items-center rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
            subTab === "unpacks"
              ? "bg-primary text-primary-foreground"
              : "bg-card/60 text-muted-foreground hover:text-foreground hover:bg-secondary/60 border border-border/40"
          )}
        >
          Unpacks
        </button>
      </div>

      {subTab === "packs" && <PacksList orgId={orgId} />}
      {subTab === "unpacks" && <UnpacksList orgId={orgId} />}
    </div>
  );
};

export default PackingTab;
