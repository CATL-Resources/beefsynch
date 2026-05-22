import { useState, useMemo, useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus } from "lucide-react";

import Navbar from "@/components/Navbar";
import AppFooter from "@/components/AppFooter";
import BullCombobox from "@/components/BullCombobox";
import { supabase } from "@/integrations/supabase/client";
import { getBullDisplayName } from "@/lib/bullDisplay";
import { useOrgRole } from "@/hooks/useOrgRole";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";

interface ExistingRow {
  type: "existing";
  id: string;
  canister: string;
  sub_canister: string | null;
  bull_name: string;
  bull_code: string | null;
  bull_catalog_id: string | null;
  custom_bull_name: string | null;
  previous: number;
  actual: number;
  customer_id: string | null;
  customer_name: string | null;
  storage_type: string | null;
  item_type: string;
}

interface NewRow {
  type: "new";
  key: string;
  canister: string;
  sub_canister: string;
  bull_name: string;
  bull_catalog_id: string | null;
  bull_code: string;
  units: string;
  item_type: "semen" | "embryo";
  customer_id: string | null;
}

const ReInventory = () => {
  const { tankId } = useParams<{ tankId: string }>();
  const [searchParams] = useSearchParams();
  const customerId = searchParams.get("customer_id");
  const navigate = useNavigate();
  const { orgId, userId } = useOrgRole();
  const queryClient = useQueryClient();

  const [rows, setRows] = useState<ExistingRow[]>([]);
  const [newRows, setNewRows] = useState<NewRow[]>([]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // Fetch tank
  const { data: tank, isLoading: tankLoading, error: tankError } = useQuery({
    queryKey: ["tank_detail", tankId],
    enabled: !!tankId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tanks")
        .select("*, customers!tanks_customer_id_fkey(id, name)")
        .eq("id", tankId!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Fetch customers for semen owner dropdown
  const { data: orgCustomers = [] } = useQuery({
    queryKey: ["customers-list-reinv", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from("customers")
        .select("id, name")
        .eq("organization_id", orgId!)
        .order("name");
      return data ?? [];
    },
  });

  // Fetch inventory for this tank
  const { data: inventoryData = [], isLoading } = useQuery({
    queryKey: ["reinventory_items", tankId, customerId],
    enabled: !!tankId,
    queryFn: async () => {
      let query = supabase
        .from("tank_inventory")
        .select("*, bulls_catalog!tank_inventory_bull_catalog_id_fkey(bull_name, company, registration_number), customers!tank_inventory_customer_id_fkey(name)")
        .eq("tank_id", tankId!);
      if (customerId) {
        query = query.eq("customer_id", customerId);
      }
      query = query.order("canister", { ascending: true }).order("sub_canister", { ascending: true }).limit(10000);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  // Initialize rows from fetched data
  useEffect(() => {
    if (!isLoading && inventoryData.length > 0 && !initialized) {
      setRows(
        inventoryData.map((inv: any) => ({
          type: "existing" as const,
          id: inv.id,
          canister: inv.canister,
          sub_canister: inv.sub_canister,
          bull_name: getBullDisplayName(inv),
          bull_code: inv.bull_code,
          bull_catalog_id: inv.bull_catalog_id,
          custom_bull_name: inv.custom_bull_name,
          previous: inv.units,
          actual: inv.units,
          customer_id: inv.customer_id,
          customer_name: inv.customers?.name || inv.owner || null,
          storage_type: inv.storage_type,
          item_type: inv.item_type || "semen",
        }))
      );
      setInitialized(true);
    } else if (!isLoading && inventoryData.length === 0 && !initialized) {
      setInitialized(true);
    }
  }, [inventoryData, isLoading, initialized]);

  // Last inventoried
  const lastInventoried = useMemo(() => {
    let latest: string | null = null;
    for (const inv of inventoryData) {
      if (inv.inventoried_at && (!latest || inv.inventoried_at > latest)) {
        latest = inv.inventoried_at;
      }
    }
    return latest;
  }, [inventoryData]);

  // Net change
  const netChange = useMemo(() => {
    let net = 0;
    for (const r of rows) net += r.actual - r.previous;
    for (const r of newRows) net += parseInt(r.units) || 0;
    return net;
  }, [rows, newRows]);

  // Update existing row actual count
  const updateActual = (index: number, value: string) => {
    setRows((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], actual: parseInt(value) || 0 };
      return copy;
    });
  };

  // Add new slot
  const addNewRow = () => {
    setNewRows((prev) => [
      ...prev,
      { type: "new", key: crypto.randomUUID(), canister: "", sub_canister: "", bull_name: "", bull_catalog_id: null, bull_code: "", units: "", item_type: "semen", customer_id: customerId || tank?.customer_id || null },
    ]);
  };

  const updateNewRow = (index: number, field: keyof NewRow, value: any) => {
    setNewRows((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const removeNewRow = (index: number) => {
    setNewRows((prev) => prev.filter((_, i) => i !== index));
  };

  // Save
  const handleSave = async () => {
    if (!tankId || !orgId) return;

    // Block save if any new row has a canister but no bull catalog link.
    // The database now requires every tank_inventory row to have a real
    // bull_catalog_id. Existing rows being adjusted are already linked.
    const unlinkedNewRows = newRows.filter(
      (nr) => nr.canister.trim().length > 0 && !nr.bull_catalog_id
    );
    if (unlinkedNewRows.length > 0) {
      const desc = unlinkedNewRows
        .map((nr) =>
          nr.bull_name?.trim()
            ? `Canister ${nr.canister}: "${nr.bull_name.trim()}"`
            : `Canister ${nr.canister}: (no bull)`
        )
        .join("; ");
      toast({
        title: "Bull not in catalog",
        description: `${unlinkedNewRows.length} new row${unlinkedNewRows.length === 1 ? "" : "s"} need a bull from the catalog: ${desc}. Click the Bull field on each row and pick from the dropdown, use "Add custom bull", or pick "Miscellaneous (placeholder)" if unknown.`,
        variant: "destructive",
      });
      return;
    }

    setSaving(true);

    try {
      // Build the changes array — only include rows that actually changed
      const changes: any[] = [];

      for (const row of rows) {
        if (row.actual === row.previous) continue; // skip no-ops
        // Note: new_units=0 goes through as update; the RPC will DELETE server-side
        changes.push({
          action: "update",
          inventory_id: row.id,
          expected_previous_units: row.previous,
          new_units: row.actual,
        });
      }

      for (const nr of newRows) {
        if (!nr.canister.trim()) continue;
        const units = parseInt(nr.units) || 0;
        const nrCustomerId = nr.customer_id || customerId || null;
        changes.push({
          action: "insert",
          canister: nr.canister.trim(),
          sub_canister: nr.sub_canister.trim() || null,
          bull_catalog_id: nr.bull_catalog_id || null,
          custom_bull_name: nr.bull_catalog_id ? null : nr.bull_name.trim() || null,
          bull_code: nr.bull_code.trim() || null,
          new_units: units,
          item_type: nr.item_type,
          customer_id: nrCustomerId,
          owner_type: nrCustomerId ? "customer" : null,
          owner_customer_id: nrCustomerId,
          owner_company_id: null,
        });
      }

      if (changes.length === 0) {
        toast({ title: "No changes to save" });
        setSaving(false);
        return;
      }

      const payload = {
        organization_id: orgId,
        tank_id: tankId,
        notes: notes.trim() || undefined,
        changes,
      };

      const { error } = await supabase.rpc("save_reinventory", { _input: payload });

      if (error) {
        const msg = error.message || "";
        if (msg.startsWith("STALE:") || msg.startsWith("MISSING:")) {
          toast({
            title: "Inventory changed",
            description: "Inventory changed since you opened this page. Reload and try again.",
            variant: "destructive",
          });
          // Reset so a fresh fetch repopulates state
          setInitialized(false);
          await queryClient.invalidateQueries({ queryKey: ["reinventory_items", tankId, customerId] });
        } else if (msg.startsWith("DUPLICATE:")) {
          toast({
            title: "Duplicate row",
            description: "That bull is already on this canister — edit the existing row instead.",
            variant: "destructive",
          });
        } else {
          toast({ title: "Error", description: msg || "Could not save.", variant: "destructive" });
        }
        setSaving(false);
        return;
      }

      // Success — refetch from server (source of truth) before navigating away
      await queryClient.invalidateQueries({ queryKey: ["reinventory_items", tankId, customerId] });
      queryClient.invalidateQueries({ queryKey: ["tank_inventory"] });
      queryClient.invalidateQueries({ queryKey: ["customer_inventory"] });
      queryClient.invalidateQueries({ queryKey: ["tank_inventory_all"] });
      queryClient.invalidateQueries({ queryKey: ["tank_map"] });
      toast({ title: "Inventory saved" });
      navigate(-1);
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Could not save.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // Breadcrumb
  const customerName = tank?.customers?.name;
  const tankLabel = tank?.tank_name ? `${tank.tank_name} — ${tank.tank_number}` : tank?.tank_number || "Tank";

  if (tankLoading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (tankError || !tank) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Failed to load tank. Please refresh.
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="container mx-auto px-4 py-8 space-y-6">
        {/* Breadcrumb */}
        <Breadcrumb>
          <BreadcrumbList>
            {customerId && customerName ? (
              <>
                <BreadcrumbItem>
                  <BreadcrumbLink onClick={() => navigate("/customers")} className="cursor-pointer">Customers</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbLink onClick={() => navigate(`/customers/${customerId}`)} className="cursor-pointer">{customerName}</BreadcrumbLink>
                </BreadcrumbItem>
              </>
            ) : (
              <BreadcrumbItem>
                <BreadcrumbLink onClick={() => navigate("/operations?tab=tanks")} className="cursor-pointer">Tanks</BreadcrumbLink>
              </BreadcrumbItem>
            )}
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Re-inventory {tankLabel}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header */}
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="mt-1">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold font-display tracking-tight">Re-inventory: {tankLabel}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Last inventoried: {lastInventoried ? format(parseISO(lastInventoried), "MMM d, yyyy 'at' h:mm a") : "Never"}
            </p>
            <p className="text-sm text-muted-foreground mt-2 max-w-2xl">
              Enter the actual count for each slot. The system will calculate the difference and log adjustments automatically.
            </p>
          </div>
        </div>

        {/* Inventory table */}
        <div className="rounded-lg border border-border/50 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead>Canister</TableHead>
                <TableHead>Sub-can</TableHead>
                <TableHead>Bull</TableHead>
                <TableHead>Bull Code</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead className="text-right">Previous</TableHead>
                <TableHead className="text-right">Actual</TableHead>
                <TableHead className="text-right">Diff</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading || !initialized ? (
                <TableRow>
                   <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">Loading…</TableCell>
                </TableRow>
              ) : rows.length === 0 && newRows.length === 0 ? (
                <TableRow>
                   <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">No inventory rows for this tank.</TableCell>
                </TableRow>
              ) : (
                <>
                  {rows.map((row, i) => {
                    const diff = row.actual - row.previous;
                    return (
                      <TableRow key={row.id}>
                        <TableCell>{row.canister}</TableCell>
                        <TableCell>{row.sub_canister || "—"}</TableCell>
                        <TableCell>{row.bull_name || "—"}</TableCell>
                        <TableCell>{row.bull_code || "—"}</TableCell>
                        <TableCell>
                          {row.item_type === "embryo" && (
                            <Badge variant="outline" className="bg-purple-500/15 text-purple-400 border-purple-500/30 text-xs">Embryo</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{row.customer_name || "—"}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{row.previous}</TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            min="0"
                            value={row.actual}
                            onChange={(e) => updateActual(i, e.target.value)}
                            className="w-20 ml-auto text-right h-8"
                          />
                        </TableCell>
                        <TableCell className={cn(
                          "text-right font-medium",
                          diff < 0 && "text-destructive",
                          diff > 0 && "text-green-400",
                          diff === 0 && "text-muted-foreground"
                        )}>
                          {diff > 0 ? `+${diff}` : diff}
                        </TableCell>
                      </TableRow>
                    );
                  })}

                  {/* New rows */}
                  {newRows.map((nr, i) => (
                    <TableRow key={nr.key} className="bg-primary/5">
                      <TableCell>
                        <Input
                          value={nr.canister}
                          onChange={(e) => updateNewRow(i, "canister", e.target.value)}
                          placeholder="Can"
                          className="w-16 h-8"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={nr.sub_canister}
                          onChange={(e) => updateNewRow(i, "sub_canister", e.target.value)}
                          placeholder="Sub"
                          className="w-16 h-8"
                        />
                      </TableCell>
                      <TableCell>
                        <BullCombobox
                          value={nr.bull_name}
                          catalogId={nr.bull_catalog_id}
                          onChange={(name, catId) => {
                            updateNewRow(i, "bull_name", name);
                            updateNewRow(i, "bull_catalog_id", catId);
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={nr.bull_code}
                          onChange={(e) => updateNewRow(i, "bull_code", e.target.value)}
                          placeholder="Code"
                          className="w-20 h-8"
                        />
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">—</TableCell>
                      <TableCell>
                        <Select value={nr.customer_id || "__none"} onValueChange={(v) => updateNewRow(i, "customer_id", v === "__none" ? null : v)}>
                          <SelectTrigger className="w-28 h-8"><SelectValue placeholder="Owner" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none">None</SelectItem>
                            {orgCustomers.map((c) => (
                              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select value={nr.item_type} onValueChange={(v) => updateNewRow(i, "item_type", v)}>
                          <SelectTrigger className="w-24 h-8"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="semen">Semen</SelectItem>
                            <SelectItem value="embryo">Embryo</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          min="0"
                          value={nr.units}
                          onChange={(e) => updateNewRow(i, "units", e.target.value)}
                          className="w-20 ml-auto text-right h-8"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => removeNewRow(i)} className="text-destructive h-8 px-2">✕</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Add new slot */}
        <Button variant="outline" size="sm" className="gap-2" onClick={addNewRow}>
          <Plus className="h-4 w-4" /> Add New Slot
        </Button>

        {/* Summary */}
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium">
            Net change:{" "}
            <span className={cn(
              "font-bold",
              netChange < 0 && "text-destructive",
              netChange > 0 && "text-green-400",
              netChange === 0 && "text-muted-foreground"
            )}>
              {netChange > 0 ? `+${netChange}` : netChange} units
            </span>
          </span>
        </div>

        {/* Notes */}
        <div className="max-w-xl space-y-1.5">
          <Label>Notes</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder='e.g. "Customer used 3 Blueprint on their own cows"'
            rows={3}
          />
        </div>

        {/* Save */}
        <div className="flex gap-3">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save Inventory"}
          </Button>
          <Button variant="outline" onClick={() => navigate(-1)}>Cancel</Button>
        </div>
      </main>
      <AppFooter />
    </div>
  );
};

export default ReInventory;
