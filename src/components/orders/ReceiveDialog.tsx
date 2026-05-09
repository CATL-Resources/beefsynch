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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2 } from "lucide-react";

export interface ReceiveDialogItem {
  id: string;
  units: number;
  units_received: number;
  item_status: string;
  bull_name: string;
  naab_code: string | null;
}

interface ReceiveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  semenCompanyName: string | null;
  items: ReceiveDialogItem[];
  onReceived: () => void;
}

interface TankOption {
  id: string;
  tank_number: string | number;
  tank_name: string | null;
}

const tankLabel = (t: TankOption) =>
  t.tank_name ? `${t.tank_number} — ${t.tank_name}` : String(t.tank_number);

export default function ReceiveDialog({
  open,
  onOpenChange,
  orderId,
  semenCompanyName,
  items,
  onReceived,
}: ReceiveDialogProps) {
  const { orgId } = useOrgRole();
  const [defaultTankId, setDefaultTankId] = useState<string>("");
  const [perLineQty, setPerLineQty] = useState<Record<string, string>>({});
  const [perLineTank, setPerLineTank] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const pending = useMemo(
    () => items.filter((i) => i.item_status === "pending" || i.item_status === "partially_received"),
    [items],
  );

  const { data: tanks = [] } = useQuery({
    queryKey: ["tanks-list-receive", orgId],
    enabled: !!orgId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tanks")
        .select("id, tank_number, tank_name")
        .eq("organization_id", orgId!)
        .order("tank_number");
      if (error) throw error;
      return (data ?? []) as TankOption[];
    },
  });

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setPerLineQty({});
      setPerLineTank({});
      // If exactly one tank, preselect; otherwise leave blank.
      if (tanks.length === 1) setDefaultTankId(tanks[0].id);
      else setDefaultTankId("");
    }
  }, [open, tanks.length]);

  const setQty = (id: string, v: string) => {
    // Strip non-digits, keep blank
    const digits = v.replace(/[^0-9]/g, "");
    setPerLineQty((p) => ({ ...p, [id]: digits }));
  };

  const validate = (): { ok: true; lines: { order_item_id: string; units: number; dest_tank_id: string }[] } | { ok: false; msg: string } => {
    const lines: { order_item_id: string; units: number; dest_tank_id: string }[] = [];
    for (const item of pending) {
      const raw = perLineQty[item.id] ?? "";
      if (raw === "") continue;
      const units = parseInt(raw, 10);
      if (!Number.isFinite(units) || units < 0) {
        return { ok: false, msg: `Invalid quantity for ${item.bull_name}` };
      }
      if (units === 0) continue;
      const remaining = item.units - item.units_received;
      if (units > remaining) {
        return { ok: false, msg: `${item.bull_name}: cannot receive ${units} (only ${remaining} remaining)` };
      }
      const tankId = perLineTank[item.id] || defaultTankId;
      if (!tankId) {
        return { ok: false, msg: `${item.bull_name}: select a destination tank` };
      }
      lines.push({ order_item_id: item.id, units, dest_tank_id: tankId });
    }
    if (lines.length === 0) {
      return { ok: false, msg: "Enter a quantity for at least one bull" };
    }
    return { ok: true, lines };
  };

  const handleSubmit = async () => {
    const v = validate();
    if (!v.ok) {
      toast({ title: "Cannot receive", description: v.msg, variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc("receive_shipment_items", {
        _order_id: orderId,
        _lines: v.lines,
      });
      if (error) throw error;
      const result = (data ?? {}) as { lines_received?: number; units_received?: number };
      toast({
        title: "Shipment received",
        description: `Received ${result.lines_received ?? v.lines.length} bull${(result.lines_received ?? v.lines.length) === 1 ? "" : "s"}, ${result.units_received ?? v.lines.reduce((s, l) => s + l.units, 0)} total units`,
      });
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
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Default destination tank</Label>
            <Select value={defaultTankId} onValueChange={setDefaultTankId}>
              <SelectTrigger>
                <SelectValue placeholder="Select tank…" />
              </SelectTrigger>
              <SelectContent>
                {tanks.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {tankLabel(t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Override per line below if needed.</p>
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {pending.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
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
                            max {remaining}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Select
                            value={perLineTank[item.id] ?? ""}
                            onValueChange={(v) =>
                              setPerLineTank((p) => ({ ...p, [item.id]: v }))
                            }
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="(use default)" />
                            </SelectTrigger>
                            <SelectContent>
                              {tanks.map((t) => (
                                <SelectItem key={t.id} value={t.id}>
                                  {tankLabel(t)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
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
