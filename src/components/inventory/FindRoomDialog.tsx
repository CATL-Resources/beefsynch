import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PackagePlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Row = {
  tank_id: string;
  canister: string | null;
  units: number;
  tanks: {
    id: string;
    tank_name: string | null;
    tank_number: string | null;
    tank_type: string | null;
    total_canisters: number | null;
    canister_capacity: number | null;
  } | null;
};

type CanisterEntry = {
  canister: string;
  current: number;
  capacity: number;
  room: number;
};

type TankGroup = {
  tankId: string;
  tankName: string;
  totalRoom: number;
  canisters: CanisterEntry[];
};

function estimateCapacity(
  explicit: number | null,
  maxCanisterUnits: number,
): number {
  if (explicit && explicit > 0) return explicit;
  return Math.min(500, Math.max(200, Math.ceil(maxCanisterUnits / 50) * 50));
}

function fillColor(pct: number): string {
  if (pct >= 80) return "bg-red-500/70";
  if (pct >= 50) return "bg-amber-500/70";
  return "bg-emerald-500/70";
}

export default function FindRoomDialog() {
  const [open, setOpen] = useState(false);
  const [needText, setNeedText] = useState("");
  const need = Number(needText);
  const needValid = Number.isFinite(need) && need > 0 ? need : 0;

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["find_room_inventory"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tank_inventory")
        .select(
          "tank_id, canister, units, tanks!inner(id, tank_name, tank_number, tank_type, total_canisters, canister_capacity, location_status, nitrogen_status)",
        )
        .eq("tanks.location_status", "here")
        .eq("tanks.nitrogen_status", "wet")
        .eq("tanks.tank_type", "inventory_tank")
        .gt("units", 0);
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  // Also pull the tanks themselves so we can show those with zero inventory.
  const { data: allTanks = [] } = useQuery({
    queryKey: ["find_room_tanks"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tanks")
        .select("id, tank_name, tank_number, tank_type, total_canisters, canister_capacity, location_status, nitrogen_status")
        .eq("location_status", "here")
        .eq("nitrogen_status", "wet")
        .eq("tank_type", "inventory_tank");
      if (error) throw error;
      return data ?? [];
    },
  });

  const groups = useMemo<TankGroup[]>(() => {
    const byTank = new Map<string, {
      tank: NonNullable<Row["tanks"]>;
      canisterUnits: Map<string, number>;
    }>();

    for (const t of allTanks) {
      byTank.set(t.id, { tank: t as any, canisterUnits: new Map() });
    }
    for (const r of rows) {
      if (!r.tanks) continue;
      const entry = byTank.get(r.tank_id) ?? { tank: r.tanks, canisterUnits: new Map() };
      const can = r.canister || "";
      entry.canisterUnits.set(can, (entry.canisterUnits.get(can) ?? 0) + (r.units ?? 0));
      byTank.set(r.tank_id, entry);
    }

    const result: TankGroup[] = [];
    for (const [tankId, { tank, canisterUnits }] of byTank.entries()) {
      const maxInAny = Math.max(0, ...Array.from(canisterUnits.values()));
      const capacity = estimateCapacity(tank.canister_capacity ?? null, maxInAny);
      const seenCanisters = new Set(canisterUnits.keys());
      // Empty canisters from total_canisters
      if (tank.total_canisters) {
        for (let i = 1; i <= tank.total_canisters; i++) {
          if (!seenCanisters.has(String(i))) canisterUnits.set(String(i), 0);
        }
      }
      const canisters: CanisterEntry[] = Array.from(canisterUnits.entries()).map(([canister, current]) => ({
        canister,
        current,
        capacity,
        room: Math.max(0, capacity - current),
      }));
      const filtered = needValid > 0 ? canisters.filter((c) => c.room >= needValid) : canisters;
      if (filtered.length === 0) continue;
      filtered.sort((a, b) => b.room - a.room);
      const tankName = tank.tank_name || (tank.tank_number ? `Tank #${tank.tank_number}` : "Unnamed");
      result.push({
        tankId,
        tankName,
        totalRoom: filtered.reduce((s, c) => s + c.room, 0),
        canisters: filtered,
      });
    }
    result.sort((a, b) => b.totalRoom - a.totalRoom);
    return result;
  }, [rows, allTanks, needValid]);

  const totalMatches = groups.reduce((s, g) => s + g.canisters.length, 0);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <PackagePlus className="h-4 w-4" /> Find Room
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Find room for incoming semen</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="find-room-need" className="text-xs text-muted-foreground">
              How many units do you need to store?
            </Label>
            <Input
              id="find-room-need"
              inputMode="numeric"
              placeholder="e.g. 200"
              value={needText}
              onChange={(e) => setNeedText(e.target.value.replace(/[^0-9]/g, ""))}
              className="mt-1 h-9"
            />
            <p className="text-xs text-muted-foreground mt-1">
              {isLoading
                ? "Loading inventory…"
                : needValid > 0
                  ? `Showing ${totalMatches} canister${totalMatches === 1 ? "" : "s"} with room for ${needValid}+ units`
                  : `Showing ${totalMatches} canister${totalMatches === 1 ? "" : "s"} sorted by most room`}
            </p>
          </div>
          <div className="space-y-3">
            {groups.length === 0 && !isLoading && (
              <p className="text-sm text-muted-foreground italic">No canisters match.</p>
            )}
            {groups.map((g) => (
              <div key={g.tankId} className="rounded-lg border border-border/60 overflow-hidden">
                <div className="flex items-baseline justify-between px-3 py-2 bg-muted/40">
                  <span className="text-sm font-semibold">{g.tankName}</span>
                  <span className="text-xs text-muted-foreground">{g.totalRoom} units of room total</span>
                </div>
                <div className="divide-y divide-border/40">
                  {g.canisters.map((c) => {
                    const pct = c.capacity > 0 ? Math.min(100, Math.round((c.current / c.capacity) * 100)) : 0;
                    return (
                      <div key={c.canister || "—"} className="px-3 py-2 grid grid-cols-[80px_1fr_120px_80px] items-center gap-3 text-xs">
                        <div>Can {c.canister || "—"}</div>
                        <div className="h-2 rounded bg-muted overflow-hidden">
                          <div className={`h-full ${fillColor(pct)}`} style={{ width: `${pct}%` }} />
                        </div>
                        <div className="tabular-nums text-muted-foreground">
                          {c.current} / {c.capacity}
                        </div>
                        <div className="text-right font-medium text-emerald-400 tabular-nums">
                          ~{c.room} room
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
