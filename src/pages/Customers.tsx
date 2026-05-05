import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Users, Package, Archive } from "lucide-react";
import { format, parseISO, differenceInDays } from "date-fns";

import Navbar from "@/components/Navbar";
import BackButton from "@/components/BackButton";
import AppFooter from "@/components/AppFooter";
import StatCard from "@/components/StatCard";
import { supabase } from "@/integrations/supabase/client";
import { useOrgRole } from "@/hooks/useOrgRole";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const Customers = () => {
  const navigate = useNavigate();
  const { orgId } = useOrgRole();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "has_tanks" | "has_units">("all");
  const [dialogOpen, setDialogOpen] = useState(false);

  // Form state
  const [formName, setFormName] = useState("");
  const [formCompanyName, setFormCompanyName] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formAddressLine1, setFormAddressLine1] = useState("");
  const [formAddressLine2, setFormAddressLine2] = useState("");
  const [formCity, setFormCity] = useState("");
  const [formState, setFormState] = useState("");
  const [formZip, setFormZip] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Fetch customers
  const { data: customers = [], isLoading } = useQuery({
    queryKey: ["customers", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .eq("organization_id", orgId!)
        .order("name", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Fetch tanks with customer_id
  const { data: tanks = [] } = useQuery({
    queryKey: ["tanks_for_customers", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tanks")
        .select("id, customer_id")
        .eq("organization_id", orgId!);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Fetch tank inventory
  const { data: inventory = [] } = useQuery({
    queryKey: ["tank_inventory_for_customers", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tank_inventory")
        .select("customer_id, units, inventoried_at")
        .eq("organization_id", orgId!);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Computed customer data
  const customerData = useMemo(() => {
    const tankCountMap = new Map<string, number>();
    const unitSumMap = new Map<string, number>();
    const lastInventoriedMap = new Map<string, string>();

    for (const t of tanks) {
      if (t.customer_id) {
        tankCountMap.set(t.customer_id, (tankCountMap.get(t.customer_id) || 0) + 1);
      }
    }

    for (const inv of inventory) {
      if (inv.customer_id) {
        unitSumMap.set(inv.customer_id, (unitSumMap.get(inv.customer_id) || 0) + (inv.units || 0));
        const existing = lastInventoriedMap.get(inv.customer_id);
        if (inv.inventoried_at && (!existing || inv.inventoried_at > existing)) {
          lastInventoriedMap.set(inv.customer_id, inv.inventoried_at);
        }
      }
    }

    return customers.map((c: any) => ({
      ...c,
      tankCount: tankCountMap.get(c.id) || 0,
      totalUnits: unitSumMap.get(c.id) || 0,
      lastInventoried: lastInventoriedMap.get(c.id) || null,
    }));
  }, [customers, tanks, inventory]);

  // Filtered
  const filtered = useMemo(() => {
    let result = customerData;

    if (filterMode === "has_tanks") {
      result = result.filter((c: any) => c.tankCount > 0);
    } else if (filterMode === "has_units") {
      result = result.filter((c: any) => c.totalUnits > 0);
    }

    if (search) {
      const q = search.toLowerCase();
      result = result.filter((c: any) => c.name.toLowerCase().includes(q));
    }

    return result;
  }, [customerData, search, filterMode]);

  // Stats
  const totalCustomers = customers.length;
  const totalTanks = tanks.filter((t: any) => t.customer_id).length;
  const totalUnitsStored = inventory
    .filter((i: any) => i.customer_id)
    .reduce((s: number, i: any) => s + (i.units || 0), 0);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("customers")
        .insert({
          organization_id: orgId!,
          name: formName.trim(),
          company_name: formCompanyName.trim() || null,
          phone: formPhone.trim() || null,
          email: formEmail.trim() || null,
          address_line1: formAddressLine1.trim() || null,
          address_line2: formAddressLine2.trim() || null,
          city: formCity.trim() || null,
          state: formState.trim() || null,
          zip: formZip.trim() || null,
          notes: formNotes.trim() || null,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast({ title: "Customer added" });
      setDialogOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      const isDuplicate = error?.code === "23505" || error?.status === 409;
      const description = isDuplicate
        ? "A customer with this name already exists."
        : error?.message || "Could not save customer.";
      toast({ title: "Error", description, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormName("");
    setFormCompanyName("");
    setFormPhone("");
    setFormEmail("");
    setFormAddressLine1("");
    setFormAddressLine2("");
    setFormCity("");
    setFormState("");
    setFormZip("");
    setFormNotes("");
  };

  const openCreate = () => {
    resetForm();
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formName.trim()) return;

    // Validate email if provided
    if (formEmail.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formEmail.trim())) {
        toast({ title: "Invalid email", description: "Please enter a valid email address", variant: "destructive" });
        return;
      }
    }

    // Validate phone if provided
    if (formPhone.trim()) {
      const phoneDigits = formPhone.trim().replace(/\D/g, "");
      if (phoneDigits.length < 10) {
        toast({ title: "Invalid phone", description: "Phone number must have at least 10 digits", variant: "destructive" });
        return;
      }
    }

    setSaving(true);
    await saveMutation.mutateAsync();
    setSaving(false);
  };

  const getInventoryColor = (lastInventoried: string | null) => {
    if (!lastInventoried) return "";
    const days = differenceInDays(new Date(), parseISO(lastInventoried));
    if (days > 180) return "text-destructive";
    if (days > 90) return "text-orange-400";
    return "";
  };

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="container mx-auto px-4 py-8 space-y-8">
        <BackButton />
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold font-display tracking-tight">Customers</h2>
          <Button className="gap-2" onClick={openCreate}>
            <Plus className="h-4 w-4" /> Add Customer
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard title="Total Customers" value={totalCustomers} delay={0} index={0} icon={Users} />
          <StatCard title="Total Tanks" value={totalTanks} delay={100} index={1} icon={Package} />
          <StatCard title="Total Units Stored" value={totalUnitsStored} delay={200} index={2} icon={Archive} />
        </div>

        {/* Search */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[200px] max-w-xs flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search customer..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="inline-flex rounded-lg border border-border/50 overflow-hidden">
            <button
              className={cn("px-3 py-2 text-sm font-medium transition-colors",
                filterMode === "all" ? "bg-primary text-primary-foreground" : "bg-muted/30 text-muted-foreground hover:bg-muted/50"
              )}
              onClick={() => setFilterMode("all")}
            >
              All
            </button>
            <button
              className={cn("px-3 py-2 text-sm font-medium transition-colors",
                filterMode === "has_tanks" ? "bg-primary text-primary-foreground" : "bg-muted/30 text-muted-foreground hover:bg-muted/50"
              )}
              onClick={() => setFilterMode("has_tanks")}
            >
              Has Tanks
            </button>
            <button
              className={cn("px-3 py-2 text-sm font-medium transition-colors",
                filterMode === "has_units" ? "bg-primary text-primary-foreground" : "bg-muted/30 text-muted-foreground hover:bg-muted/50"
              )}
              onClick={() => setFilterMode("has_units")}
            >
              Has Units
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="rounded-lg border border-border/50 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="whitespace-nowrap">Customer Name</TableHead>
                <TableHead className="whitespace-nowrap">Phone</TableHead>
                <TableHead className="whitespace-nowrap">Email</TableHead>
                <TableHead className="whitespace-nowrap text-right">Tanks</TableHead>
                <TableHead className="whitespace-nowrap text-right">Total Units</TableHead>
                <TableHead className="whitespace-nowrap">Last Inventoried</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">Loading…</TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                    {customers.length === 0 ? "No customers yet." : "No customers match your search."}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((cust: any) => (
                  <TableRow key={cust.id} className="cursor-pointer hover:bg-secondary/50" onClick={() => navigate(`/customers/${cust.id}`)}>
                    <TableCell className="font-medium whitespace-nowrap text-primary hover:underline">{cust.name}</TableCell>
                    <TableCell className="whitespace-nowrap">{cust.phone || "—"}</TableCell>
                    <TableCell className="whitespace-nowrap">{cust.email || "—"}</TableCell>
                    <TableCell className="text-right">{cust.tankCount}</TableCell>
                    <TableCell className="text-right">{cust.totalUnits}</TableCell>
                    <TableCell className={cn("whitespace-nowrap", getInventoryColor(cust.lastInventoried))}>
                      {cust.lastInventoried
                        ? format(parseISO(cust.lastInventoried), "MMM d, yyyy")
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </main>

      {/* Add Customer Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Customer</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-[140px_1fr] items-center gap-x-4 gap-y-3">
            <Label className="text-right text-sm">Display Name *</Label>
            <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Customer name" />
            <Label className="text-right text-sm">Company Name</Label>
            <Input value={formCompanyName} onChange={(e) => setFormCompanyName(e.target.value)} />
            <Label className="text-right text-sm">Email</Label>
            <Input value={formEmail} onChange={(e) => setFormEmail(e.target.value)} placeholder="Email address" />
            <Label className="text-right text-sm">Phone</Label>
            <Input value={formPhone} onChange={(e) => setFormPhone(e.target.value)} placeholder="Phone number" />
            <Label className="text-right text-sm">Address Line 1</Label>
            <Input value={formAddressLine1} onChange={(e) => setFormAddressLine1(e.target.value)} />
            <Label className="text-right text-sm">Address Line 2</Label>
            <Input value={formAddressLine2} onChange={(e) => setFormAddressLine2(e.target.value)} />
            <Label className="text-right text-sm">City / State / Zip</Label>
            <div className="grid grid-cols-[1fr_60px_100px] gap-2">
              <Input value={formCity} onChange={(e) => setFormCity(e.target.value)} placeholder="City" />
              <Input value={formState} onChange={(e) => setFormState(e.target.value)} placeholder="ST" maxLength={2} />
              <Input value={formZip} onChange={(e) => setFormZip(e.target.value)} placeholder="Zip" />
            </div>
            <Label className="text-right text-sm">Notes</Label>
            <Textarea value={formNotes} onChange={(e) => setFormNotes(e.target.value)} placeholder="Notes" rows={3} />
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !formName.trim()}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AppFooter />
    </div>
  );
};

export default Customers;
