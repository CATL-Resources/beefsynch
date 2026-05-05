import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { MapPin, Printer } from "lucide-react";
import EmptyState from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  generateTankInventorySheetPdf,
  generateBulkTankInventoryPdf,
  TankSheetRow,
  TankWithRows,
} from "@/lib/generateTankInventorySheetPdf";

type CanisterData = {
  canister: string;
  canisterNum: number;
  units: number;
  bulls: string[];
};

type TankWithCanisters = {
  id: string;
  name: string;
  number: string;
  tankType: string;
  customerName: string | null;
  nitrogenStatus: string;
  locationStatus: string;
  totalCanisters: number | null;
  canisterCapacity: number | null;
  canisters: Map<string, CanisterData>;
  totalUnits: number;
  maxCanisterSeen: number;
};

type FilterMode = "all" | "wet_only" | "has_open_slots";
type TypeFilter = "all" | "inventory_tank" | "communal_tank" | "rental_tank" | "customer_tank";

const TYPE_FILTER_OPTIONS: Array<{ value: TypeFilter; label: string }> = [
  { value: "all", label: "All types" },
  { value: "inventory_tank", label: "Inventory" },
  { value: "communal_tank", label: "Communal" },
  { value: "rental_tank", label: "Rental" },
  { value: "customer_tank", label: "Customer" },
];

export default function TankMap({ orgId }: { orgId: string }) {
  const [filter, setFilter] = useState<FilterMode>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [expanded, setExpanded] = useState<string | null>(null); // format: "tankId:canister"

  const { data, isLoading } = useQuery({
    queryKey: ["tank_map", orgId],
    enabled: !!orgId,
    staleTime: 30_000,
    queryFn: async () => {
      // All tanks at this location (not out in the field).
      const { data: tanks, error: tErr } = await supabase
        .from("tanks")
        .select(
          "id, tank_name, tank_number, tank_type, nitrogen_status, location_status, total_canisters, canister_capacity, customer_id, customers!tanks_customer_id_fkey(name)"
        )
        .eq("organization_id", orgId)
        .eq("location_status", "here")
        .order("tank_number");
      if (tErr) throw tErr;

      // Inventory: paginated fetch (PostgREST caps at 1000 rows per request)
      const PAGE = 1000;
      const allInv: any[] = [];
      let from = 0;
      while (true) {
        const { data: inv, error: iErr } = await supabase
          .from("tank_inventory")
          .select(
            "tank_id, canister, units, custom_bull_name, bull_code, bulls_catalog!tank_inventory_bull_catalog_id_fkey(bull_name)"
          )
          .eq("organization_id", orgId)
          .range(from, from + PAGE - 1);
        if (iErr) throw iErr;
        const batch = inv ?? [];
        allInv.push(...batch);
        if (batch.length < PAGE) break;
        from += PAGE;
      }

      return { tanks: tanks ?? [], inventory: allInv };
    },
  });

  const tanksWithCanisters = useMemo<TankWithCanisters[]>(() => {
    if (!data) return [];
    return data.tanks.map((t: any) => {
      const inv = data.inventory.filter((i: any) => i.tank_id === t.id);
      const canMap = new Map<string, CanisterData>();
      let maxNum = 0;
      let totalUnits = 0;

      for (const row of inv) {
        const key = row.canister ?? "—";
        const num = parseInt(key, 10);
        if (!isNaN(num) && num > maxNum) maxNum = num;

        if (!canMap.has(key)) {
          canMap.set(key, {
            canister: key,
            canisterNum: isNaN(num) ? 999 : num,
            units: 0,
            bulls: [],
          });
        }
        const c = canMap.get(key)!;
        const units = row.units || 0;
        c.units += units;
        totalUnits += units;

        const bullName =
          row.custom_bull_name ||
          row.bulls_catalog?.bull_name ||
          row.bull_code ||
          "Unknown";
        if (!c.bulls.includes(bullName)) c.bulls.push(bullName);
      }

      return {
        id: t.id,
        name: t.tank_name || "—",
        number: t.tank_number || "—",
        tankType: t.tank_type || "",
        customerName: t.customers?.name ?? null,
        nitrogenStatus: t.nitrogen_status || "unknown",
        locationStatus: t.location_status || "here",
        totalCanisters: t.total_canisters ?? null,
        canisterCapacity: t.canister_capacity ?? null,
        canisters: canMap,
        totalUnits,
        maxCanisterSeen: maxNum,
      };
    });
  }, [data]);

  const filtered = useMemo(() => {
    return tanksWithCanisters.filter((t) => {
      // Hide empty tanks (freeze branding, mushroom, empty shippers, etc.)
      if (t.totalUnits === 0) return false;
      if (typeFilter !== "all" && t.tankType !== typeFilter) return false;
      if (filter === "wet_only" && t.nitrogenStatus !== "wet") return false;
      if (filter === "has_open_slots") {
        const totalSlots = t.totalCanisters ?? Math.max(t.maxCanisterSeen, 6);
        if (t.canisters.size >= totalSlots) return false;
      }
      return true;
    });
  }, [tanksWithCanisters, filter, typeFilter]);

  const totalOpenSlots = useMemo(() => {
    return tanksWithCanisters.reduce((sum, t) => {
      const totalSlots = t.totalCanisters ?? Math.max(t.maxCanisterSeen, 6);
      return sum + Math.max(0, totalSlots - t.canisters.size);
    }, 0);
  }, [tanksWithCanisters]);

  const [printingAll, setPrintingAll] = useState(false);

  const handlePrintAll = async () => {
    if (filtered.length === 0 || !data) return;
    setPrintingAll(true);
    try {
      const tanksForPdf: TankWithRows[] = filtered.map((tank) => {
        const rows: TankSheetRow[] = [];
        for (const [canKey] of tank.canisters.entries()) {
          // Re-look up each bull's units and code from original inventory rows
          const origRows = data.inventory.filter(
            (i: any) => i.tank_id === tank.id && (i.canister ?? "—") === canKey
          );
          for (const r of origRows) {
            rows.push({
              canister: canKey,
              bullName:
                r.custom_bull_name ||
                r.bulls_catalog?.bull_name ||
                r.bull_code ||
                "Unknown",
              bullCode: r.bull_code || "",
              units: r.units || 0,
            });
          }
        }
        return {
          meta: {
            tankId: tank.id,
            tankName: tank.name,
            tankNumber: tank.number,
            nitrogenStatus: tank.nitrogenStatus,
            locationStatus: tank.locationStatus,
            totalCanisters: tank.totalCanisters,
            maxCanisterSeen: tank.maxCanisterSeen,
          },
          rows,
        };
      });
      generateBulkTankInventoryPdf(tanksForPdf);
      toast.success(
        `Downloaded count sheets for ${filtered.length} tank${filtered.length !== 1 ? "s" : ""}`
      );
    } catch (err: any) {
      console.error("Bulk print failed:", err);
      toast.error("Could not generate bulk PDF. Try again.");
    } finally {
      setPrintingAll(false);
    }
  };

  if (isLoading) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        Loading tank map…
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <EmptyState
        icon={MapPin}
        title="No tanks to map"
        description="No tanks with inventory match the current filter."
      />
    );
  }

  return (
    <div className="space-y-4 p-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          {filtered.length} tank{filtered.length !== 1 ? "s" : ""} ·{" "}
          <span className="font-medium text-foreground">
            {totalOpenSlots} open canister{totalOpenSlots !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            onClick={handlePrintAll}
            disabled={printingAll || filtered.length === 0}
          >
            <Printer className="h-4 w-4 mr-1.5" />
            {printingAll ? "Generating…" : `Print all (${filtered.length})`}
          </Button>
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as TypeFilter)}>
            <SelectTrigger className="w-[160px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TYPE_FILTER_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filter} onValueChange={(v) => setFilter(v as FilterMode)}>
            <SelectTrigger className="w-[200px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All inventory tanks</SelectItem>
              <SelectItem value="wet_only">Wet tanks only</SelectItem>
              <SelectItem value="has_open_slots">Has open canisters</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded border border-green-600 bg-green-100" />
          Open
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded border border-amber-600 bg-amber-100" />
          Partial
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded border border-gray-500 bg-gray-200" />
          Occupied
        </span>
      </div>

      {/* Tank cards */}
      <div className="space-y-3">
        {filtered.map((tank) => (
          <TankCard
            key={tank.id}
            tank={tank}
            expanded={expanded}
            setExpanded={setExpanded}
          />
        ))}
      </div>
    </div>
  );
}

function TankCard({
  tank,
  expanded,
  setExpanded,
}: {
  tank: TankWithCanisters;
  expanded: string | null;
  setExpanded: (v: string | null) => void;
}) {
  const totalSlots = tank.totalCanisters ?? Math.max(tank.maxCanisterSeen, 6);
  const capacity = tank.canisterCapacity ?? 100;
  const slotNums = Array.from({ length: totalSlots }, (_, i) => i + 1);
  const openCount = slotNums.filter((n) => !tank.canisters.has(String(n))).length;

  const [isPrinting, setIsPrinting] = useState(false);
  const handlePrint = async () => {
    setIsPrinting(true);
    try {
      const { data, error } = await supabase
        .from("tank_inventory")
        .select(
          "canister, units, custom_bull_name, bull_code, bulls_catalog!tank_inventory_bull_catalog_id_fkey(bull_name)"
        )
        .eq("tank_id", tank.id);
      if (error) throw error;

      const rows: TankSheetRow[] = (data ?? []).map((r: any) => ({
        canister: r.canister ?? "—",
        bullName:
          r.custom_bull_name ||
          r.bulls_catalog?.bull_name ||
          r.bull_code ||
          "Unknown",
        bullCode: r.bull_code || "",
        units: r.units || 0,
      }));

      generateTankInventorySheetPdf(
        {
          tankId: tank.id,
          tankName: tank.name,
          tankNumber: tank.number,
          nitrogenStatus: tank.nitrogenStatus,
          locationStatus: tank.locationStatus,
          totalCanisters: tank.totalCanisters,
          maxCanisterSeen: tank.maxCanisterSeen,
        },
        rows
      );
      toast.success(`Sheet downloaded for ${tank.name}`);
    } catch (err: any) {
      console.error("Print failed:", err);
      toast.error("Could not generate sheet. Try again.");
    } finally {
      setIsPrinting(false);
    }
  };

  return (
    <div className="rounded-lg border border-border/60 bg-card p-4">
      <div className="grid gap-4 md:grid-cols-[200px_1fr]">
        {/* Left: tank meta */}
        <div className="space-y-1">
          <div className="flex items-start justify-between gap-2">
            <Link
              to={`/tanks/${tank.id}`}
              className="min-w-0 group rounded-sm -m-1 p-1 hover:bg-muted/40 transition-colors"
            >
              <div className="text-base font-semibold truncate group-hover:text-primary transition-colors">
                {tank.name}
              </div>
              <div className="text-xs text-muted-foreground group-hover:text-primary/80 transition-colors">
                #{tank.number} →
              </div>
              {tank.customerName && (
                <div className="text-xs text-muted-foreground truncate" title={tank.customerName}>
                  {tank.customerName}
                </div>
              )}
            </Link>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-[11px] shrink-0"
              onClick={handlePrint}
              disabled={isPrinting}
            >
              <Printer className="h-3 w-3 mr-1" />
              {isPrinting ? "..." : "Print"}
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <Badge variant="outline" className="text-[10px] capitalize">
              {tank.nitrogenStatus}
            </Badge>
            <Badge variant="outline" className="text-[10px] capitalize">
              {tank.locationStatus}
            </Badge>
          </div>
          <div className="pt-2 text-xl font-bold">
            {tank.totalUnits.toLocaleString()}
          </div>
          <div className="text-xs text-muted-foreground">
            units ·{" "}
            {openCount > 0 ? (
              <span className="text-green-600 font-medium">{openCount} open</span>
            ) : (
              "full"
            )}
          </div>
          {tank.totalCanisters === null && (
            <div className="pt-1 text-[10px] text-amber-600 leading-tight">
              Capacity not set — inferred from inventory
            </div>
          )}
        </div>

        {/* Right: canister grid + expanded detail */}
        <div className="space-y-3">
          <div className="grid grid-cols-6 gap-1.5">
            {slotNums.map((n) => {
              const key = String(n);
              const c = tank.canisters.get(key);
              const expandKey = `${tank.id}:${key}`;
              const isExpanded = expanded === expandKey;

              let bgClass = "bg-green-100 border-green-600 text-green-900";
              let label = "Open";
              if (c) {
                if (c.units < capacity) {
                  bgClass = "bg-amber-100 border-amber-600 text-amber-900";
                } else {
                  bgClass = "bg-gray-200 border-gray-500 text-gray-900";
                }
                label = `${c.units}u · ${c.bulls.length} bull${
                  c.bulls.length !== 1 ? "s" : ""
                }`;
              }

              return (
                <button
                  key={n}
                  onClick={() => setExpanded(isExpanded ? null : expandKey)}
                  className={cn(
                    "rounded border p-1.5 text-center transition-all hover:ring-2 hover:ring-offset-1 hover:ring-primary/40",
                    bgClass,
                    isExpanded && "ring-2 ring-offset-1 ring-primary"
                  )}
                >
                  <div className="text-sm font-bold leading-none">{n}</div>
                  <div className="mt-1 text-[10px] leading-tight">{label}</div>
                </button>
              );
            })}
          </div>

          {expanded?.startsWith(`${tank.id}:`) &&
            (() => {
              const canKey = expanded.split(":")[1];
              const c = tank.canisters.get(canKey);
              if (!c) {
                return (
                  <div className="rounded border border-green-600/40 bg-green-50 p-3 text-xs text-green-900">
                    Canister {canKey} — open and available for new inventory.
                  </div>
                );
              }
              return (
                <div className="rounded border border-border/60 bg-muted/30 p-3 space-y-1">
                  <div className="text-xs font-medium">
                    Canister {canKey} · {c.units} units · {c.bulls.length} bull
                    {c.bulls.length !== 1 ? "s" : ""}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {c.bulls.sort().join(", ")}
                  </div>
                </div>
              );
            })()}
        </div>
      </div>
    </div>
  );
}
