import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgRole } from "@/hooks/useOrgRole";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";

export interface ReceiveDialogItem {
  id: string;
  units: number;
  units_received: number;
  item_status: string;
  bull_name: string;
  naab_code: string | null;
  bull_catalog_id: string | null;
}

interface ReceiveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  orderType: "inventory" | "customer" | string;
  semenCompanyId: string | null;
  semenCompanyName: string | null;
  customerId: string | null;
  items: ReceiveDialogItem[];
  onReceived: () => void;
}

interface TankOption {
  id: string;
  tank_number: string | number;
  tank_name: string | null;
  tank_type?: string | null;
}

const tankLabel = (t: TankOption) => {
  const base = t.tank_name ? `#${t.tank_number} — ${t.tank_name}` : `Tank #${t.tank_number}`;
  return t.tank_type === "customer_tank" ? `${base} (customer)` : base;
};

function TankCombobox({
  value,
  onChange,
  tanks,
  placeholder,
  size = "default",
}: {
  value: string;
  onChange: (id: string) => void;
  tanks: TankOption[];
  placeholder: string;
  size?: "default" | "sm";
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tanks;
    return tanks.filter((t) => {
      const num = String(t.tank_number).toLowerCase();
      const name = (t.tank_name ?? "").toLowerCase();
      return num.includes(q) || name.includes(q);
    });
  }, [search, tanks]);
  const selected = tanks.find((t) => t.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          className={cn(
            "w-full justify-between font-normal",
            !value && "text-muted-foreground",
            size === "sm" && "h-8 text-xs",
          )}
        >
          <span className="truncate">{selected ? tankLabel(selected) : placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search tanks…"
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>No tanks found.</CommandEmpty>
            {filtered.map((t) => (
              <CommandItem
                key={t.id}
                value={t.id}
                onSelect={() => {
                  onChange(t.id);
                  setOpen(false);
                }}
              >
                <Check className={cn("mr-2 h-4 w-4", value === t.id ? "opacity-100" : "opacity-0")} />
                <span>{tankLabel(t)}</span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default function ReceiveDialog({
  open,
  onOpenChange,
  orderId,
  orderType,
  semenCompanyId,
  semenCompanyName,
  customerId,
  items,
  onReceived,
}: ReceiveDialogProps) {
  const { orgId, userId } = useOrgRole();
  const [defaultTankId, setDefaultTankId] = useState<string>("");
  const [perLineQty, setPerLineQty] = useState<Record<string, string>>({});
  const [perLineTank, setPerLineTank] = useState<Record<string, string>>({});
  const [perLineCanister, setPerLineCanister] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const pending = useMemo(
    () => items.filter((i) => i.item_status === "pending" || i.item_status === "partially_received"),
    [items],
  );

  const { data: tanks = [] } = useQuery({
    queryKey: ["tanks-list-receive", orgId],
    enabled: !!orgId && open,
    queryFn: async () => {
      // Only physically present, charged tanks. Customer tanks come last
      // (sorted via tank_type) so company tanks surface first.
      const { data, error } = await supabase
        .from("tanks")
        .select("id, tank_number, tank_name, tank_type")
        .eq("organization_id", orgId!)
        .eq("location_status", "here")
        .eq("nitrogen_status", "wet")
        .order("tank_type")
        .order("tank_number");
      if (error) throw error;
      return (data ?? []) as TankOption[];
    },
  });

  // Resolve current user's organization_members.id for the shipments.received_by FK
  const { data: memberId } = useQuery({
    queryKey: ["current-org-member", orgId, userId],
    enabled: !!orgId && !!userId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organization_members")
        .select("id")
        .eq("organization_id", orgId!)
        .eq("user_id", userId!)
        .maybeSingle();
      if (error) throw error;
      return data?.id ?? null;
    },
  });

  useEffect(() => {
    if (open) {
      setPerLineQty({});
      setPerLineTank({});
      setPerLineCanister({});
      if (tanks.length === 1) setDefaultTankId(tanks[0].id);
      else setDefaultTankId("");
    }
  }, [open, tanks.length]);

  const setQty = (id: string, v: string) => {
    const digits = v.replace(/[^0-9]/g, "");
    setPerLineQty((p) => ({ ...p, [id]: digits }));
  };

  type DraftLine = {
    bullCatalogId: string | null;
    bullName: string;
    bullCode: string;
    tankId: string;
    canister: string;
    units: number;
    itemType: "semen";
  };

  const validate = (): { ok: true; draftLines: DraftLine[] } | { ok: false; msg: string } => {
    const draftLines: DraftLine[] = [];
    for (const item of pending) {
      const raw = perLineQty[item.id] ?? "";
      if (raw === "") continue;
      const units = parseInt(raw, 10);
      if (!Number.isFinite(units) || units < 0) {
        return { ok: false, msg: `Invalid quantity for ${item.bull_name}` };
      }
      if (units === 0) continue;
      const tankId = perLineTank[item.id] || defaultTankId;
      if (!tankId) {
        return { ok: false, msg: `${item.bull_name}: select a destination tank` };
      }
      const canister = (perLineCanister[item.id] ?? "").trim();
      if (!canister) {
        return { ok: false, msg: `${item.bull_name}: enter a destination canister` };
      }
      draftLines.push({
        bullCatalogId: item.bull_catalog_id,
        bullName: item.bull_name,
        bullCode: item.naab_code ?? "",
        tankId,
        canister,
        units,
        itemType: "semen",
      });
    }
    if (draftLines.length === 0) {
      return { ok: false, msg: "Enter a quantity for at least one bull" };
    }
    return { ok: true, draftLines };
  };

  const handleSubmit = async () => {
    if (!orgId) {
      toast({ title: "Not signed in", variant: "destructive" });
      return;
    }
    if (!memberId) {
      toast({
        title: "No membership found",
        description: "Could not look up your organization membership.",
        variant: "destructive",
      });
      return;
    }
    const v = validate();
    if (!v.ok) {
      toast({ title: "Cannot receive", description: v.msg, variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const isInventory = orderType === "inventory";
      const snapshot: Record<string, unknown> = {
        version: 1,
        draft_lines: v.draftLines,
        inventory_owner: isInventory ? "CATL" : null,
        semen_owner_id: !isInventory ? customerId : null,
        supplier_invoice_number: null,
      };

      const shipmentId = crypto.randomUUID();
      const { error: shipErr } = await supabase.from("shipments").insert({
        id: shipmentId,
        organization_id: orgId,
        semen_order_id: orderId,
        customer_id: !isInventory ? customerId : null,
        semen_company_id: semenCompanyId,
        received_by: memberId,
        received_date: new Date().toISOString().slice(0, 10),
        shipment_type: isInventory ? "inventory" : "customer",
        status: "draft",
        reconciliation_snapshot: snapshot as never,
      });
      if (shipErr) throw shipErr;

      const { data, error } = await supabase.rpc("confirm_shipment", {
        _input: { shipment_id: shipmentId },
      });
      if (error) {
        // Roll back the draft shipment so the next attempt isn't tripped up
        // by a leftover row.
        await supabase.from("shipments").delete().eq("id", shipmentId);
        throw error;
      }

      const result = (data ?? {}) as {
        total_units?: number;
        lines_short?: number;
        lines_over?: number;
        lines_added?: number;
        lines_missing?: number;
      };
      const bits: string[] = [`${result.total_units ?? 0} units received`];
      if (result.lines_short) bits.push(`${result.lines_short} short`);
      if (result.lines_over) bits.push(`${result.lines_over} over`);
      if (result.lines_added) bits.push(`${result.lines_added} added`);
      toast({ title: "Shipment confirmed", description: bits.join(" · ") });

      onOpenChange(false);
      onReceived();
    } catch (err: any) {
      toast({ title: "Receive failed", description: err.message ?? String(err), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Receive Shipment{semenCompanyName ? ` — ${semenCompanyName}` : ""}</DialogTitle>
          <DialogDescription>
            Enter how many units of each bull arrived. Leave blank or 0 to skip.
            Units beyond the order quantity are fine — they'll be marked over in
            reconciliation.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Default destination tank</Label>
            <TankCombobox
              value={defaultTankId}
              onChange={setDefaultTankId}
              tanks={tanks}
              placeholder="Select tank…"
            />
            <p className="text-xs text-muted-foreground">Override per line below if needed. Canisters are entered per line — no default.</p>
          </div>

          <div className="rounded-lg border border-border/50 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead>Bull</TableHead>
                  <TableHead>NAAB</TableHead>
                  <TableHead className="text-right">Ordered</TableHead>
                  <TableHead className="text-right">Already</TableHead>
                  <TableHead className="text-right w-28">Receive Now</TableHead>
                  <TableHead className="w-56">Tank</TableHead>
                  <TableHead className="w-24">Canister</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pending.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      No pending lines on this order.
                    </TableCell>
                  </TableRow>
                ) : (
                  pending.map((item) => {
                    const remaining = item.units - item.units_received;
                    return (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.bull_name}</TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {item.naab_code ?? "—"}
                        </TableCell>
                        <TableCell className="text-right">{item.units}</TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {item.units_received}
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            inputMode="numeric"
                            value={perLineQty[item.id] ?? ""}
                            onChange={(e) => setQty(item.id, e.target.value)}
                            placeholder="0"
                            className="h-8 text-right"
                            aria-label={`Receive units for ${item.bull_name}`}
                          />
                          <div className="text-[10px] text-muted-foreground mt-0.5">
                            {remaining} pending
                          </div>
                        </TableCell>
                        <TableCell>
                          <TankCombobox
                            value={perLineTank[item.id] ?? ""}
                            onChange={(id) =>
                              setPerLineTank((p) => ({ ...p, [item.id]: id }))
                            }
                            tanks={tanks}
                            placeholder="(use default)"
                            size="sm"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={perLineCanister[item.id] ?? ""}
                            onChange={(e) =>
                              setPerLineCanister((p) => ({ ...p, [item.id]: e.target.value }))
                            }
                            placeholder="canister"
                            className="h-8 text-sm"
                            aria-label={`Canister for ${item.bull_name}`}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || pending.length === 0}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Receive
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
