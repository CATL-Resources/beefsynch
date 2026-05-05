import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { getBullDisplayName } from "@/lib/bullDisplay";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

interface TransferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceRow: any | null;
  sourceTankName: string;
  orgId: string | null | undefined;
  userId: string | null | undefined;
  tankId: string;
  defaultCustomerId?: string;
  defaultCustomerName?: string;
  initialMode?: "transfer" | "withdraw";
  onSuccess?: () => void;
}

export default function TransferDialog({
  open,
  onOpenChange,
  sourceRow,
  sourceTankName,
  orgId,
  userId,
  tankId,
  defaultCustomerId,
  defaultCustomerName,
  initialMode = "transfer",
  onSuccess,
}: TransferDialogProps) {
  const queryClient = useQueryClient();
  const [units, setUnits] = useState<number>(0);
  const [destTankId, setDestTankId] = useState<string>("");
  const [canister, setCanister] = useState("");
  const [subCanister, setSubCanister] = useState("");
  const [customerId, setCustomerId] = useState<string>("");
  const [orderId, setOrderId] = useState<string>("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [tankPopoverOpen, setTankPopoverOpen] = useState(false);
  const [customerPopoverOpen, setCustomerPopoverOpen] = useState(false);
  const [orderPopoverOpen, setOrderPopoverOpen] = useState(false);
  const [isBillable, setIsBillable] = useState(false);
  const [mode, setMode] = useState<"transfer" | "withdraw">("transfer");
  const [reason, setReason] = useState("");

  const bullName = getBullDisplayName(sourceRow);
  const bullCode = sourceRow?.bull_code || sourceRow?.bulls_catalog?.naab_code;
  const available = sourceRow?.units ?? 0;

  useEffect(() => {
    if (open && sourceRow) {
      setUnits(sourceRow.units || 0);
      setDestTankId("");
      setCanister("");
      setSubCanister("");
      const initialCustomer = sourceRow.customer_id || defaultCustomerId || "";
      setCustomerId(initialCustomer);
      setOrderId("");
      setNote("");
      // Auto-billable when company stock → customer (no source customer, customer assigned)
      setIsBillable(!!initialCustomer && !sourceRow.customer_id);
      setMode(initialMode);
      setReason("");
    }
  }, [open, sourceRow, defaultCustomerId, initialMode]);

  const { data: tanks = [] } = useQuery({
    queryKey: ["transfer_dialog_tanks", orgId],
    enabled: !!orgId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tanks")
        .select("id, tank_name, tank_number, tank_type")
        .eq("organization_id", orgId!)
        .order("tank_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: customers = [] } = useQuery({
    queryKey: ["transfer_dialog_customers", orgId],
    enabled: !!orgId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, name")
        .eq("organization_id", orgId!)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: orders = [] } = useQuery({
    queryKey: ["transfer_dialog_orders", customerId],
    enabled: !!customerId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("semen_orders")
        .select("id, created_at, fulfillment_status")
        .eq("customer_id", customerId)
        .not("fulfillment_status", "in", "(fulfilled,cancelled)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const destTanks = useMemo(
    () => tanks.filter((t) => t.id !== tankId),
    [tanks, tankId],
  );

  const selectedTank = destTanks.find((t) => t.id === destTankId);
  const selectedCustomer = customers.find((c) => c.id === customerId);
  const selectedOrder = orders.find((o) => o.id === orderId);

  const tankLabel = (t: any) =>
    `${t.tank_name || t.tank_number || "Unnamed"}${t.tank_type ? ` (${t.tank_type})` : ""}`;

  const validate = (): string | null => {
    if (!sourceRow) return "No source row selected";
    if (!units || units <= 0) return "Units must be greater than 0";
    if (units > available)
      return `Cannot ${mode} ${units} units — only ${available} available`;
    if (mode === "transfer") {
      if (!destTankId) return "Destination tank is required";
      if (destTankId === tankId) return "Destination tank cannot be the source tank";
      if (!canister.trim()) return "Canister is required";
    }
    if (mode === "withdraw") {
      if (!reason.trim()) return "Reason is required for withdrawals";
    }
    return null;
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) {
      toast({ title: mode === "transfer" ? "Cannot transfer" : "Cannot withdraw", description: err, variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      if (mode === "transfer") {
        const { error } = await supabase.rpc("transfer_inventory", {
          _source_inventory_id: sourceRow.id,
          _dest_tank_id: destTankId,
          _dest_canister: canister.trim(),
          _dest_sub_canister: subCanister.trim() || null,
          _units: units,
          _new_customer_id: customerId || null,
          _order_id: orderId || null,
          _notes: note.trim() || null,
          _performed_by: userId,
          _is_billable: customerId ? isBillable : null,
        });
        if (error) throw error;
        toast({
          title: "Transfer complete",
          description: `Transferred ${units} units to ${selectedTank ? tankLabel(selectedTank) : "destination tank"}`,
        });
      } else {
        const { error } = await supabase.rpc("withdraw_inventory", {
          _source_inventory_id: sourceRow.id,
          _units: units,
          _reason: reason.trim(),
          _customer_id: customerId || null,
          _order_id: orderId || null,
          _is_billable: customerId ? isBillable : null,
          _performed_by: userId,
        });
        if (error) throw error;
        toast({
          title: "Withdrawal complete",
          description: `Withdrew ${units} units of ${bullName}`,
        });
      }
      queryClient.invalidateQueries({ queryKey: ["tank_detail_inventory", tankId] });
      queryClient.invalidateQueries({ queryKey: ["tank_detail_transactions", tankId] });
      if (mode === "transfer" && destTankId) {
        queryClient.invalidateQueries({ queryKey: ["tank_detail_inventory", destTankId] });
        queryClient.invalidateQueries({ queryKey: ["tank_detail_transactions", destTankId] });
      }
      queryClient.invalidateQueries({ queryKey: ["tank_inventory_all"] });
      queryClient.invalidateQueries({ queryKey: ["customer_inventory"] });
      onSuccess?.();
      onOpenChange(false);
    } catch (e: any) {
      toast({
        title: mode === "transfer" ? "Transfer failed" : "Withdrawal failed",
        description: e?.message || "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === "transfer" ? "Transfer Semen" : "Withdraw Semen"}</DialogTitle>
          <DialogDescription>
            {mode === "transfer"
              ? `Move ${bullName}${bullCode ? ` (${bullCode})` : ""} from ${sourceTankName}. ${available} units available.`
              : `Remove ${bullName}${bullCode ? ` (${bullCode})` : ""} from ${sourceTankName}. ${available} units available.`}
          </DialogDescription>
        </DialogHeader>

        {sourceRow && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <Button
                type="button"
                variant={mode === "transfer" ? "default" : "outline"}
                size="sm"
                className="flex-1"
                onClick={() => setMode("transfer")}
              >
                Transfer
              </Button>
              <Button
                type="button"
                variant={mode === "withdraw" ? "default" : "outline"}
                size="sm"
                className="flex-1"
                onClick={() => setMode("withdraw")}
              >
                Withdraw
              </Button>
            </div>

            <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
              <div>
                <span className="text-muted-foreground">Bull: </span>
                <span className="font-medium">
                  {bullName}
                  {bullCode ? ` (${bullCode})` : ""}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">From: </span>
                <span className="font-medium">
                  {sourceTankName} / Canister {sourceRow.canister}
                  {sourceRow.sub_canister ? ` / ${sourceRow.sub_canister}` : ""}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Available: </span>
                <span className="font-medium">{available} units</span>
              </div>
            </div>

            <div>
              <Label htmlFor="transfer-units">Units to {mode}</Label>
              <Input
                id="transfer-units"
                type="number"
                min={1}
                max={available}
                value={units}
                onChange={(e) => setUnits(Number(e.target.value))}
              />
            </div>

            {mode === "transfer" && (
              <div className="space-y-3">
                <div className="text-xs font-semibold uppercase text-muted-foreground">
                  Destination
                </div>

                <div>
                  <Label>Destination tank</Label>
                  <Popover open={tankPopoverOpen} onOpenChange={setTankPopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        className="w-full justify-between font-normal"
                      >
                        {selectedTank ? tankLabel(selectedTank) : "Select tank…"}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                      <Command filter={(value, search) => value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0}>
                        <CommandInput placeholder="Search tanks…" />
                        <CommandList>
                          <CommandEmpty>No tanks found.</CommandEmpty>
                          <CommandGroup>
                            {destTanks.map((t) => (
                              <CommandItem
                                key={t.id}
                                value={tankLabel(t)}
                                onSelect={() => {
                                  setDestTankId(t.id);
                                  setTankPopoverOpen(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    destTankId === t.id ? "opacity-100" : "opacity-0",
                                  )}
                                />
                                {tankLabel(t)}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="transfer-canister">Canister</Label>
                    <Input
                      id="transfer-canister"
                      value={canister}
                      onChange={(e) => setCanister(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="transfer-subcan">Sub-canister</Label>
                    <Input
                      id="transfer-subcan"
                      value={subCanister}
                      onChange={(e) => setSubCanister(e.target.value)}
                      placeholder="Optional"
                    />
                  </div>
                </div>
              </div>
            )}

            {mode === "withdraw" && (
              <div>
                <Label htmlFor="withdraw-reason">Reason *</Label>
                <Textarea
                  id="withdraw-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Customer picked up in their own tank"
                  rows={2}
                />
              </div>
            )}
            <div className="space-y-3">
              <div className="text-xs font-semibold uppercase text-muted-foreground">
                Ownership (optional)
              </div>

              <div>
                <Label>Assign to customer</Label>
                <Popover open={customerPopoverOpen} onOpenChange={setCustomerPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      className="w-full justify-between font-normal"
                    >
                      {selectedCustomer ? selectedCustomer.name : "Company stock (no customer)"}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command filter={(value, search) => value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0}>
                      <CommandInput placeholder="Search customers…" />
                      <CommandList>
                        <CommandEmpty>No customers found.</CommandEmpty>
                        <CommandGroup>
                          <CommandItem
                            value="__none__"
                            onSelect={() => {
                              setCustomerId("");
                              setOrderId("");
                              setIsBillable(false);
                              setCustomerPopoverOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                !customerId ? "opacity-100" : "opacity-0",
                              )}
                            />
                            Company stock (no customer)
                          </CommandItem>
                          {customers.map((c) => (
                            <CommandItem
                              key={c.id}
                              value={c.name}
                              onSelect={() => {
                                setCustomerId(c.id);
                                setOrderId("");
                                setIsBillable(!sourceRow?.customer_id);
                                setCustomerPopoverOpen(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  customerId === c.id ? "opacity-100" : "opacity-0",
                                )}
                              />
                              {c.name}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              {customerId && (
                <div>
                  <Label>Link to order</Label>
                  <Popover open={orderPopoverOpen} onOpenChange={setOrderPopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        className="w-full justify-between font-normal"
                      >
                        {selectedOrder
                          ? `Order from ${format(new Date(selectedOrder.created_at), "MMM d, yyyy")} — ${selectedOrder.fulfillment_status}`
                          : "No order linked"}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Search orders…" />
                        <CommandList>
                          <CommandEmpty>No unfulfilled orders.</CommandEmpty>
                          <CommandGroup>
                            <CommandItem
                              value="__none__"
                              onSelect={() => {
                                setOrderId("");
                                setOrderPopoverOpen(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  !orderId ? "opacity-100" : "opacity-0",
                                )}
                              />
                              No order
                            </CommandItem>
                            {orders.map((o) => (
                              <CommandItem
                                key={o.id}
                                value={o.id}
                                onSelect={() => {
                                  setOrderId(o.id);
                                  setOrderPopoverOpen(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    orderId === o.id ? "opacity-100" : "opacity-0",
                                  )}
                                />
                                Order from {format(new Date(o.created_at), "MMM d, yyyy")} — {o.fulfillment_status}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
              )}
            </div>

            {customerId && (
              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase text-muted-foreground">
                  Billing
                </div>
                <div className="flex items-start gap-2">
                  <Checkbox
                    id="transfer-billable"
                    checked={isBillable}
                    onCheckedChange={(v) => setIsBillable(v === true)}
                    className="mt-0.5"
                  />
                  <div className="space-y-0.5">
                    <Label htmlFor="transfer-billable" className="cursor-pointer">
                      Billable to customer
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Check this if the customer is being charged for this semen.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div>
              <Label htmlFor="transfer-note">Note</Label>
              <Textarea
                id="transfer-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Optional"
                rows={2}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {mode === "transfer" ? "Transfer" : "Withdraw"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
