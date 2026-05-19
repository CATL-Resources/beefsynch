import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { Search, Database, Droplets } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

type Tank = {
  id: string;
  tank_name: string | null;
  tank_number: string | null;
  nitrogen_status: string | null;
  location_status: string | null;
};

type Fill = { tank_id: string; fill_date: string };

type InventoryItem = {
  tank_id: string;
  canister: string | null;
  units: number;
  bull_name: string | null;
  bull_code: string | null;
  custom_bull_name: string | null;
  bulls_catalog: { bull_name: string | null; naab_code: string | null } | null;
};

export default function InventoryDrawer() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const enabled = open;

  const { data: tanks = [] } = useQuery({
    queryKey: ["inventory_drawer_tanks"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tanks")
        .select("id, tank_name, tank_number, nitrogen_status, location_status")
        .is("customer_id", null)
        .order("tank_name");
      if (error) throw error;
      return (data ?? []) as Tank[];
    },
  });

  const { data: fills = [] } = useQuery({
    queryKey: ["inventory_drawer_fills"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tank_fills")
        .select("tank_id, fill_date")
        .order("fill_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Fill[];
    },
  });

  const tankIds = tanks.map((t) => t.id);
  const { data: inventory = [] } = useQuery({
    queryKey: ["inventory_drawer_inv", tankIds.join(",")],
    enabled: enabled && tankIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tank_inventory")
        .select("tank_id, canister, units, bull_name, bull_code, custom_bull_name, bulls_catalog:bull_catalog_id(bull_name, naab_code)")
        .in("tank_id", tankIds)
        .gt("units", 0);
      if (error) throw error;
      return (data ?? []) as unknown as InventoryItem[];
    },
  });

  const lastFillByTank = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of fills) {
      if (!m.has(f.tank_id)) m.set(f.tank_id, f.fill_date);
    }
    return m;
  }, [fills]);

  const filtered = useMemo(() => {
    if (!search.trim()) return inventory;
    const q = search.toLowerCase();
    return inventory.filter((i) => {
      const name = (i.bulls_catalog?.bull_name || i.bull_name || i.custom_bull_name || "").toLowerCase();
      const code = (i.bulls_catalog?.naab_code || i.bull_code || "").toLowerCase();
      return name.includes(q) || code.includes(q);
    });
  }, [inventory, search]);

  const byTank = useMemo(() => {
    const m = new Map<string, InventoryItem[]>();
    for (const item of filtered) {
      const arr = m.get(item.tank_id) || [];
      arr.push(item);
      m.set(item.tank_id, arr);
    }
    return m;
  }, [filtered]);

  const sortedTanks = useMemo(() => {
    return [...tanks].sort((a, b) => {
      const aWet = a.nitrogen_status === "wet" ? 0 : 1;
      const bWet = b.nitrogen_status === "wet" ? 0 : 1;
      if (aWet !== bWet) return aWet - bWet;
      return (a.tank_name || a.tank_number || "").localeCompare(b.tank_name || b.tank_number || "");
    });
  }, [tanks]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="fixed bottom-6 right-6 z-40 h-10 shadow-lg gap-1.5"
        >
          <Database className="h-4 w-4" /> Inventory
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Company inventory</SheetTitle>
        </SheetHeader>
        <div className="relative mt-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search bull or NAAB…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="mt-3 space-y-3">
          {sortedTanks.map((t) => {
            const items = byTank.get(t.id) ?? [];
            const total = items.reduce((s, i) => s + (i.units ?? 0), 0);
            if (search.trim() && items.length === 0) return null;
            const lastFill = lastFillByTank.get(t.id);
            // Group items by canister within this tank
            const byCanister = new Map<string, InventoryItem[]>();
            for (const it of items) {
              const c = it.canister ?? "—";
              const arr = byCanister.get(c) || [];
              arr.push(it);
              byCanister.set(c, arr);
            }
            return (
              <div key={t.id} className="rounded-lg border border-border/60 p-3">
                <div className="flex items-baseline justify-between gap-2 flex-wrap">
                  <div className="font-medium text-sm">
                    {t.tank_name || t.tank_number || "Unnamed tank"}
                    {t.tank_name && t.tank_number && (
                      <span className="ml-1.5 text-xs text-muted-foreground">#{t.tank_number}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge variant="outline" className={
                      t.nitrogen_status === "wet"
                        ? "bg-blue-500/15 text-blue-300 border-blue-400/40 text-[10px]"
                        : "bg-amber-500/15 text-amber-300 border-amber-400/40 text-[10px]"
                    }>
                      <Droplets className="h-3 w-3 mr-1" /> {t.nitrogen_status || "unknown"}
                    </Badge>
                    <span className="text-xs tabular-nums">{total} units</span>
                  </div>
                </div>
                {lastFill && (
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    Last fill: {format(parseISO(lastFill), "MMM d, yyyy")}
                  </div>
                )}
                <div className="mt-2 space-y-1">
                  {byCanister.size === 0 ? (
                    <p className="text-xs text-muted-foreground italic">Empty</p>
                  ) : (
                    Array.from(byCanister.entries())
                      .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
                      .map(([can, list]) => (
                        <div key={can} className="text-xs">
                          <div className="font-medium">Can {can}</div>
                          <div className="pl-3 text-muted-foreground space-y-0.5">
                            {list.map((it, i) => (
                              <div key={i} className="flex justify-between">
                                <span>
                                  {it.bulls_catalog?.bull_name || it.bull_name || it.custom_bull_name || "—"}
                                  {(it.bulls_catalog?.naab_code || it.bull_code) && (
                                    <span className="ml-1.5 opacity-70">{it.bulls_catalog?.naab_code || it.bull_code}</span>
                                  )}
                                </span>
                                <span className="tabular-nums">{it.units}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))
                  )}
                </div>
              </div>
            );
          })}
          {sortedTanks.length === 0 && enabled && (
            <p className="text-sm text-muted-foreground italic">No company tanks.</p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
