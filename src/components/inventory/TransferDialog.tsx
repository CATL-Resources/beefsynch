import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  ArrowRightLeft,
  Check,
  ChevronsUpDown,
  HandCoins,
  Loader2,
  ShoppingCart,
  Trash2,
} from "lucide-react";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Mode = "transfer" | "order" | "pickup" | "withdraw";

interface TransferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceRow: any | null;
  sourceTankName: string;
  orgId: string | null | undefined;
  userId: string | null | undefined;
  tankId?: string;
  defaultCustomerId?: string;
  defaultCustomerName?: string;
  initialMode?: Mode;
  onSuccess?: () => void;
}

const MODE_CARDS: Array<{ value: Mode; title: string; desc: string; Icon: typeof ArrowRightLeft }> = [
  {
    value: "transfer",
    title: "Transfer",
    desc: "Move semen from one tank to another",
    Icon: ArrowRightLeft,
  },
  {
    value: "order",
    title: "Fill Order / Sale",
    desc: "Customer is buying this semen",
    Icon: ShoppingCart,
  },
  {
    value: "pickup",
    title: "Customer Pickup",
    desc: "Customer is taking their own stored semen",
    Icon: HandCoins,
  },
  {
    value: "withdraw",
    title: "Withdraw",
    desc: "Damaged, expired, count correction, or other removal",
    Icon: Trash2,
  },
];

const DELIVERY_METHODS = [
  { value: "pickup", label: "Customer pickup" },
  { value: "drop_off", label: "We dropped off" },
  { value: "shipped", label: "Shipped" },
] as const;

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
  initialMode,
  onSuccess,
}: TransferDialogProps) {
  const queryClient = useQueryClient();
  const effectiveTankId = tankId || sourceRow?.tank_id || "";

  const [mode, setMode] = useState<Mode>("transfer");
  const [units, setUnits] = useState<number>(0);
  const [destTankId, setDestTankId] = useState<string>("");
  const [canister, setCanister] = useState("");
  const [subCanister, setSubCanister] = useState("");
  const [customerId, setCustomerId] = useState<string>("");
  const [orderId, setOrderId] = useState<string>("");
  const [deliveryMethod, setDeliveryMethod] = useState<string>("pickup");
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [isBillable, setIsBillable] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [tankPopoverOpen, setTankPopoverOpen] = useState(false);
  const [customerPopoverOpen, setCustomerPopoverOpen] = useState(false);
  const [orderPopoverOpen, setOrderPopoverOpen] = useState(false);

  const bullName = getBullDisplayName(sourceRow);
  const bullCode = sourceRow?.bull_code || sourceRow?.bulls_catalog?.naab_code;
  const available = sourceRow?.units ?? 0;

  useEffect(() => {
    if (open && sourceRow) {
      const initialCustomer = sourceRow.customer_id || defaultCustomerId || "";
      const defaultMode: Mode =
        initialMode ?? (sourceRow.customer_id ? "pickup" : "transfer");

      setMode(defaultMode);
      setUnits(sourceRow.units || 0);
      setDestTankId("");
      setCanister("");
      setSubCanister("");
      setCustomerId(initialCustomer);
      setOrderId("");
      setDeliveryMethod("pickup");
      setNote("");
      setReason("");
      // Transfer: auto-billable when company stock → customer
      setIsBillable(
        defaultMode === "order"
          ? true
          : !!initialCustomer && !sourceRow.customer_id,
      );
    }
  }, [open, sourceRow, defaultCustomerId, initialMode]);

  // When mode changes mid-dialog, reset billable to the right default for the mode.
  useEffect(() => {
    if (!open) return;
    if (mode === "order") setIsBillable(true);
    else if (mode === "pickup" || mode === "withdraw") setIsBillable(false);
    else if (mode === "transfer") {
      setIsBillable(!!customerId && !sourceRow?.customer_id);
    }
  }, [mode, open, customerId, sourceRow]);

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
    () => tanks.filter((t) => t.id !== effectiveTankId),
    [tanks, effectiveTankId],
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
      if (destTankId === effectiveTankId)
        return "Destination tank cannot be the source tank";
      if (!canister.trim()) return "Canister is required";
    }
    if (mode === "order") {
      if (!customerId) return "Customer is required";
      // orderId is optional — if missing, withdraw_inventory auto-creates one
    }
    if (mode === "pickup") {
      if (!customerId) return "Customer is required for pickup";
    }
    if (mode === "withdraw") {
      if (!reason.trim()) return "Reason is required for withdrawals";
    }
    return null;
  };

  const modeLabel = (m: Mode) => MODE_CARDS.find((c) => c.value === m)?.title ?? m;

  const handleSubmit = async () => {
    const err = validate();
    if (err) {
      toast({ title: `Cannot ${modeLabel(mode).toLowerCase()}`, description: err, variant: "destructive" });
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
          _order_id: null,
          _notes: note.trim() || null,
          _performed_by: userId,
          _is_billable: customerId ? isBillable : null,
        });
        if (error) throw error;
        toast({
          title: "Transfer complete",
          description: `Transferred ${units} units to ${selectedTank ? tankLabel(selectedTank) : "destination tank"}`,
        });
      } else if (mode === "order") {
        const deliveryLabel =
          DELIVERY_METHODS.find((d) => d.value === deliveryMethod)?.label || deliveryMethod;
        const noteParts = [deliveryLabel, note.trim()].filter(Boolean);

        if (orderId) {
          // Fulfilling against an existing order
          const { error } = await supabase.rpc("record_direct_sale", {
            _input: {
              order_id: orderId,
              source_tank_id: effectiveTankId,
              source_canister: sourceRow.canister || null,
              bull_catalog_id: sourceRow.bull_catalog_id || null,
              bull_code: bullCode || null,
              bull_name: bullName || null,
              units,
              is_billable: true,
              destination_tank_id: destTankId || null,
              notes: noteParts.join(" — "),
            },
          });
          if (error) throw error;
        } else {
          // No order selected — withdraw_inventory auto-creates a customer order
          const { error } = await supabase.rpc("withdraw_inventory", {
            _source_inventory_id: sourceRow.id,
            _units: units,
            _reason: noteParts.join(" — ") || `Direct sale to ${selectedCustomer?.name || "customer"}`,
            _customer_id: customerId,
            _order_id: null,
            _is_billable: true,
            _performed_by: userId,
          });
          if (error) throw error;
        }

        toast({
          title: "Sale recorded",
          description: `${units} units of ${bullName} sold to ${selectedCustomer?.name || "customer"}${orderId ? " (existing order)" : " (new order created)"}`,
        });
      } else if (mode === "pickup") {
        const { error } = await supabase.rpc("customer_pickup", {
          _source_inventory_id: sourceRow.id,
          _units: units,
          _customer_id: customerId,
          _notes: note.trim() || null,
          _performed_by: userId,
        });
        if (error) throw error;
        toast({
          title: "Pickup recorded",
          description: `${units} units of ${bullName} picked up by ${selectedCustomer?.name || "customer"}`,
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

      if (effectiveTankId) {
        queryClient.invalidateQueries({ queryKey: ["tank_detail_inventory", effectiveTankId] });
        queryClient.invalidateQueries({ queryKey: ["tank_detail_transactions", effectiveTankId] });
      }
      if (mode === "transfer" && destTankId) {
        queryClient.invalidateQueries({ queryKey: ["tank_detail_inventory", destTankId] });
        queryClient.invalidateQueries({ queryKey: ["tank_detail_transactions", destTankId] });
      }
      queryClient.invalidateQueries({ queryKey: ["tank_inventory_all"] });
      queryClient.invalidateQueries({ queryKey: ["customer_inventory"] });
      queryClient.invalidateQueries({ queryKey: ["semen-inventory"] });
      queryClient.invalidateQueries({ queryKey: ["tank_map"] });
      onSuccess?.();
      onOpenChange(false);
    } catch (e: any) {
      toast({
        title: `${modeLabel(mode)} failed`,
        description: e?.message || "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const submitLabel =
    mode === "transfer"
      ? "Transfer"
      : mode === "order"
        ? "Record Sale"
        : mode === "pickup"
          ? "Record Pickup"
          : "Withdraw";

  const orderEmpty = mode === "order" && !!customerId && orders.length === 0;
  const submitDisabled = submitting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Move Semen</DialogTitle>
          <DialogDescription>
            {bullName}
            {bullCode ? ` (${bullCode})` : ""} from {sourceTankName} — {available} units available.
          </DialogDescription>
        </DialogHeader>

        {sourceRow && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              {MODE_CARDS.map(({ value, title, desc, Icon }) => {
                const active = mode === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setMode(value)}
                    className={cn(
                      "text-left rounded-md border p-3 transition-colors",
                      active
                        ? "border-primary bg-primary/10 ring-1 ring-primary"
                        : "border-border hover:bg-muted/40",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <Icon className={cn("h-4 w-4", active ? "text-primary" : "text-muted-foreground")} />
                      <span className="font-medium text-sm">{title}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{desc}</p>
                  </button>
                );
              })}
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
              <Label htmlFor="transfer-units">Units to {modeLabel(mode).toLowerCase()}</Label>
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
                  placeholder="e.g. Damaged in transit, expired, count correction"
                  rows={2}
                />
              </div>
            )}

            {(mode === "transfer" || mode === "order" || mode === "pickup" || (mode === "withdraw")) && (
              <div className="space-y-3">
                <div className="text-xs font-semibold uppercase text-muted-foreground">
                  {mode === "transfer"
                    ? "Ownership (optional)"
                    : mode === "withdraw"
                      ? "Customer (optional)"
                      : "Customer"}
                </div>

                <div>
                  <Label>
                    {mode === "order" || mode === "pickup" ? "Customer *" : "Assign to customer"}
                  </Label>
                  <Popover open={customerPopoverOpen} onOpenChange={setCustomerPopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        className="w-full justify-between font-normal"
                      >
                        {selectedCustomer
                          ? selectedCustomer.name
                          : mode === "order" || mode === "pickup"
                            ? "Select customer…"
                            : "Company stock (no customer)"}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                      <Command filter={(value, search) => value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0}>
                        <CommandInput placeholder="Search customers…" />
                        <CommandList>
                          <CommandEmpty>No customers found.</CommandEmpty>
                          <CommandGroup>
                            {mode !== "order" && mode !== "pickup" && (
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
                            )}
                            {customers.map((c) => (
                              <CommandItem
                                key={c.id}
                                value={c.name}
                                onSelect={() => {
                                  setCustomerId(c.id);
                                  setOrderId("");
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

                {(mode === "order" || (customerId && mode !== "pickup")) && (
                  <div>
                    <Label>{mode === "order" ? "Order (optional)" : "Link to order"}</Label>
                    <Popover open={orderPopoverOpen} onOpenChange={setOrderPopoverOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          className="w-full justify-between font-normal"
                          disabled={mode === "order" && !customerId}
                        >
                          {selectedOrder
                            ? `Order from ${format(new Date(selectedOrder.created_at), "MMM d, yyyy")} — ${selectedOrder.fulfillment_status}`
                            : mode === "order"
                              ? "Select an open order…"
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
                              {mode !== "order" && (
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
                              )}
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
                    {orderEmpty && (
                      <p className="text-xs text-muted-foreground mt-1">
                        No open orders — a new order will be created automatically.
                      </p>
                    )}
                  </div>
                )}

                {mode === "order" && customerId && (
                  <div>
                    <Label>Destination tank (optional)</Label>
                    <Popover open={tankPopoverOpen} onOpenChange={setTankPopoverOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          className="w-full justify-between font-normal"
                        >
                          {selectedTank ? tankLabel(selectedTank) : "No tank — semen leaves inventory"}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                        <Command filter={(value, search) => value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0}>
                          <CommandInput placeholder="Search tanks…" />
                          <CommandList>
                            <CommandEmpty>No tanks found.</CommandEmpty>
                            <CommandGroup>
                              <CommandItem
                                value="__none__"
                                onSelect={() => {
                                  setDestTankId("");
                                  setTankPopoverOpen(false);
                                }}
                              >
                                <Check className={cn("mr-2 h-4 w-4", !destTankId ? "opacity-100" : "opacity-0")} />
                                No tank — semen leaves inventory
                              </CommandItem>
                              {destTanks.map((t) => (
                                <CommandItem
                                  key={t.id}
                                  value={tankLabel(t)}
                                  onSelect={() => {
                                    setDestTankId(t.id);
                                    setTankPopoverOpen(false);
                                  }}
                                >
                                  <Check className={cn("mr-2 h-4 w-4", destTankId === t.id ? "opacity-100" : "opacity-0")} />
                                  {tankLabel(t)}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    <p className="text-xs text-muted-foreground mt-1">
                      Pick the customer's tank if you want to track where this semen went.
                    </p>
                  </div>
                )}
              </div>
            )}

            {mode === "order" && (
              <div>
                <Label>Delivery</Label>
                <Select value={deliveryMethod} onValueChange={setDeliveryMethod}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DELIVERY_METHODS.map((d) => (
                      <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {mode === "transfer" && customerId && (
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
          <Button onClick={handleSubmit} disabled={submitDisabled}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
