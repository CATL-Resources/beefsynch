import { useState, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Search, Users, Package, Archive, Droplets, Sun, Truck,
  AlertTriangle, AlertCircle, Upload, Check, X, FileSpreadsheet,
  Clock, RotateCcw, ChevronsUpDown, ArrowUpDown,
} from "lucide-react";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { format, parseISO, differenceInDays, startOfMonth, parse, isValid } from "date-fns";
import Papa from "papaparse";

import StatCard from "@/components/StatCard";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Calendar } from "@/components/ui/calendar";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { CalendarIcon } from "lucide-react";
import { getBadgeClass } from "@/lib/badgeStyles";

/* ── shared constants ── */
const TANK_TYPES = [
  { value: "all", label: "All Types" },
  { value: "customer_tank", label: "Customer Tank" },
  { value: "inventory_tank", label: "Inventory Tank" },
  { value: "shipper", label: "Shipper" },
  { value: "mushroom", label: "Mushroom" },
  { value: "rental_tank", label: "Rental Tank" },
  { value: "communal_tank", label: "Communal Tank" },
  { value: "freeze_branding", label: "Freeze Branding" },
];
const STATUSES = [
  { value: "all", label: "All Statuses" },
  { value: "wet", label: "Wet" },
  { value: "dry", label: "Dry" },
  { value: "out", label: "Out" },
  { value: "unknown", label: "Unknown" },
  { value: "inactive", label: "Inactive" },
  { value: "bad_tank", label: "Bad Tank" },
];
const TYPE_LABELS: Record<string, string> = {
  customer_tank: "Customer Tank", inventory_tank: "Inventory Tank", shipper: "Shipper",
  mushroom: "Mushroom", rental_tank: "Rental Tank", communal_tank: "Communal Tank", freeze_branding: "Freeze Branding",
};

const TYPE_BADGE: Record<string, string> = {
  customer_tank: "bg-teal-600/20 text-teal-400 border-teal-600/30",
  inventory_tank: "bg-purple-600/20 text-purple-400 border-purple-600/30",
  shipper: "bg-blue-600/20 text-blue-400 border-blue-600/30",
  mushroom: "bg-blue-600/20 text-blue-400 border-blue-600/30",
  rental_tank: "bg-amber-600/20 text-amber-400 border-amber-600/30",
  communal_tank: "bg-orange-600/20 text-orange-400 border-orange-600/30",
  freeze_branding: "bg-muted text-muted-foreground border-border",
};

const EID_HEADERS = ["eid", "tank_eid", "tank_number", "tank", "number", "id", "tag", "electronic_id"];
const DATE_HEADERS = ["date", "fill_date", "scan_date", "filled", "timestamp"];
const DATE_FORMATS = ["yyyy-MM-dd", "MM/dd/yyyy", "M/d/yyyy", "MM-dd-yyyy", "yyyy/MM/dd"];

function tryParseDate(raw: string): Date | null {
  if (!raw) return null;
  for (const fmt of DATE_FORMATS) {
    const d = parse(raw.trim(), fmt, new Date());
    if (isValid(d)) return d;
  }
  const fallback = new Date(raw.trim());
  return isValid(fallback) ? fallback : null;
}

interface BulkRow {
  rowNum: number;
  csvValue: string;
  matchedTank: { id: string; tank_number: string; tank_name: string | null } | null;
  parsedDate: Date | null;
}

/* ═══════════════════════════════════════════════════
   TAB 1 — CUSTOMERS
   ═══════════════════════════════════════════════════ */
export const CustomersTab = ({ orgId }: { orgId: string }) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [customerFilter, setCustomerFilter] = useState<"all" | "has_tanks" | "has_units">("all");
  const [sortKey, setSortKey] = useState<string>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formName, setFormName] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formAddress, setFormAddress] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const toggleSort = (key: string) => {
    if (sortKey === key) { setSortDir((d) => (d === "asc" ? "desc" : "asc")); }
    else { setSortKey(key); setSortDir("asc"); }
  };

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ["customers", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("*").eq("organization_id", orgId).order("name", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: tanks = [] } = useQuery({
    queryKey: ["tanks_for_customers", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from("tanks").select("id, customer_id").eq("organization_id", orgId);
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: inventory = [] } = useQuery({
    queryKey: ["tank_inventory_for_customers", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const PAGE = 1000;
      const allRows: any[] = [];
      let from = 0;
      while (true) {
        const { data, error } = await supabase.from("tank_inventory").select("customer_id, units, inventoried_at").eq("organization_id", orgId).range(from, from + PAGE - 1);
        if (error) throw error;
        const rows = data ?? [];
        allRows.push(...rows);
        if (rows.length < PAGE) break;
        from += PAGE;
      }
      return allRows;
    },
  });

  const customerData = useMemo(() => {
    const tankCountMap = new Map<string, number>();
    const unitSumMap = new Map<string, number>();
    const lastInventoriedMap = new Map<string, string>();
    for (const t of tanks) { if (t.customer_id) tankCountMap.set(t.customer_id, (tankCountMap.get(t.customer_id) || 0) + 1); }
    for (const inv of inventory) {
      if (inv.customer_id) {
        unitSumMap.set(inv.customer_id, (unitSumMap.get(inv.customer_id) || 0) + (inv.units || 0));
        const existing = lastInventoriedMap.get(inv.customer_id);
        if (inv.inventoried_at && (!existing || inv.inventoried_at > existing)) lastInventoriedMap.set(inv.customer_id, inv.inventoried_at);
      }
    }
    return customers.map((c: any) => ({ ...c, tankCount: tankCountMap.get(c.id) || 0, totalUnits: unitSumMap.get(c.id) || 0, lastInventoried: lastInventoriedMap.get(c.id) || null }));
  }, [customers, tanks, inventory]);

  const filtered = useMemo(() => {
    let list = customerData;
    if (customerFilter === "has_tanks") {
      list = list.filter((c: any) => c.tankCount > 0);
    } else if (customerFilter === "has_units") {
      list = list.filter((c: any) => c.totalUnits > 0);
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((c: any) => c.name.toLowerCase().includes(q));
    }
    list = [...list].sort((a: any, b: any) => {
      let aVal: any, bVal: any;
      switch (sortKey) {
        case "name": aVal = a.name || ""; bVal = b.name || ""; break;
        case "tankCount": aVal = a.tankCount || 0; bVal = b.tankCount || 0; break;
        case "totalUnits": aVal = a.totalUnits || 0; bVal = b.totalUnits || 0; break;
        case "lastInventoried": aVal = a.lastInventoried || ""; bVal = b.lastInventoried || ""; break;
        default: aVal = a.name || ""; bVal = b.name || "";
      }
      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortDir === "asc" ? aVal - bVal : bVal - aVal;
      }
      return sortDir === "asc" ? String(aVal).localeCompare(String(bVal)) : String(bVal).localeCompare(String(aVal));
    });
    return list;
  }, [customerData, customerFilter, search, sortKey, sortDir]);

  const handleExportCustomersCsv = () => {
    const headers = ["Customer Name", "Phone", "Email", "Tanks", "Total Units", "Last Inventoried"];
    const csvRows = [headers.join(",")];
    for (const c of filtered) {
      csvRows.push([
        `"${c.name || ""}"`,
        `"${c.phone || ""}"`,
        `"${c.email || ""}"`,
        c.tankCount || 0,
        c.totalUnits || 0,
        `"${c.lastInventoried || ""}"`,
      ].join(","));
    }
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `BeefSynch_Customers_${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
  };

  const totalCustomers = customers.length;
  const totalTanks = tanks.filter((t: any) => t.customer_id).length;
  const totalUnitsStored = inventory.filter((i: any) => i.customer_id).reduce((s: number, i: any) => s + (i.units || 0), 0);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("customers").insert({ organization_id: orgId, name: formName.trim(), phone: formPhone.trim() || null, email: formEmail.trim() || null, address: formAddress.trim() || null, notes: formNotes.trim() || null });
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["customers"] }); toast({ title: "Customer added" }); setDialogOpen(false); resetForm(); },
    onError: (error: any) => {
      const isDuplicate = error?.code === "23505" || error?.status === 409;
      const description = isDuplicate
        ? "A customer with this name already exists."
        : error?.message || "Could not save customer.";
      toast({ title: "Error", description, variant: "destructive" });
    },
  });

  const resetForm = () => { setFormName(""); setFormPhone(""); setFormEmail(""); setFormAddress(""); setFormNotes(""); };
  const openCreate = () => { resetForm(); setDialogOpen(true); };
  const handleSave = async () => { if (!formName.trim()) return; setSaving(true); await saveMutation.mutateAsync(); setSaving(false); };

  const getInventoryColor = (lastInventoried: string | null) => {
    if (!lastInventoried) return "";
    const days = differenceInDays(new Date(), parseISO(lastInventoried));
    if (days > 180) return "text-destructive";
    if (days > 90) return "text-orange-400";
    return "";
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div />
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={handleExportCustomersCsv}>
            <FileSpreadsheet className="h-4 w-4" /> Export CSV
          </Button>
          <Button className="gap-2" onClick={openCreate}><Plus className="h-4 w-4" /> Add Customer</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className={cn("transition-all rounded-xl", customerFilter === "all" ? "ring-2 ring-primary" : "")}>
          <StatCard title="Total Customers" value={totalCustomers} delay={0} index={0} icon={Users} onClick={() => setCustomerFilter("all")} />
        </div>
        <div className={cn("transition-all rounded-xl", customerFilter === "has_tanks" ? "ring-2 ring-primary" : "")}>
          <StatCard title="With Tanks" value={customerData.filter((c: any) => c.tankCount > 0).length} delay={100} index={1} icon={Package} onClick={() => setCustomerFilter("has_tanks")} />
        </div>
        <div className={cn("transition-all rounded-xl", customerFilter === "has_units" ? "ring-2 ring-primary" : "")}>
          <StatCard title="Total Units Stored" value={totalUnitsStored} delay={200} index={2} icon={Archive} onClick={() => setCustomerFilter("has_units")} />
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-[200px] max-w-xs">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search customer..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
        </div>
        {(search || customerFilter !== "all") && (
          <p className="text-sm text-muted-foreground">{filtered.length} customer{filtered.length !== 1 ? "s" : ""} match</p>
        )}
      </div>

      <div className="rounded-lg border border-border/50 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="whitespace-nowrap cursor-pointer hover:text-foreground" onClick={() => toggleSort("name")}>
                <span className="inline-flex items-center gap-1">Customer Name <ArrowUpDown className="h-3 w-3" /></span>
              </TableHead>
              <TableHead className="whitespace-nowrap">Phone</TableHead>
              <TableHead className="whitespace-nowrap">Email</TableHead>
              <TableHead className="whitespace-nowrap text-right cursor-pointer hover:text-foreground" onClick={() => toggleSort("tankCount")}>
                <span className="inline-flex items-center gap-1 justify-end">Tanks <ArrowUpDown className="h-3 w-3" /></span>
              </TableHead>
              <TableHead className="whitespace-nowrap text-right cursor-pointer hover:text-foreground" onClick={() => toggleSort("totalUnits")}>
                <span className="inline-flex items-center gap-1 justify-end">Total Units <ArrowUpDown className="h-3 w-3" /></span>
              </TableHead>
              <TableHead className="whitespace-nowrap cursor-pointer hover:text-foreground" onClick={() => toggleSort("lastInventoried")}>
                <span className="inline-flex items-center gap-1">Last Inventoried <ArrowUpDown className="h-3 w-3" /></span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground">Loading…</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground">{customers.length === 0 ? "No customers yet." : "No customers match your search."}</TableCell></TableRow>
            ) : filtered.map((cust: any) => (
              <TableRow key={cust.id} className="cursor-pointer hover:bg-secondary/50" onClick={() => navigate(`/customers/${cust.id}`)}>
                <TableCell className="font-medium whitespace-nowrap text-primary hover:underline">{cust.name}</TableCell>
                <TableCell className="whitespace-nowrap">{cust.phone || "—"}</TableCell>
                <TableCell className="whitespace-nowrap">{cust.email || "—"}</TableCell>
                <TableCell className="text-right">{cust.tankCount}</TableCell>
                <TableCell className="text-right">{cust.totalUnits}</TableCell>
                <TableCell className={cn("whitespace-nowrap", getInventoryColor(cust.lastInventoried))}>
                  {cust.lastInventoried ? format(parseISO(cust.lastInventoried), "MMM d, yyyy") : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add Customer</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5"><Label>Name *</Label><Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Customer name" /></div>
            <div className="space-y-1.5"><Label>Phone</Label><Input value={formPhone} onChange={(e) => setFormPhone(e.target.value)} placeholder="Phone number" /></div>
            <div className="space-y-1.5"><Label>Email</Label><Input value={formEmail} onChange={(e) => setFormEmail(e.target.value)} placeholder="Email address" /></div>
            <div className="space-y-1.5"><Label>Address</Label><Input value={formAddress} onChange={(e) => setFormAddress(e.target.value)} placeholder="Address" /></div>
            <div className="space-y-1.5"><Label>Notes</Label><Textarea value={formNotes} onChange={(e) => setFormNotes(e.target.value)} placeholder="Notes" rows={3} /></div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving || !formName.trim()}>{saving ? "Saving…" : "Save"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

/* ═══════════════════════════════════════════════════
   TAB 2 — TANKS
   ═══════════════════════════════════════════════════ */
const TanksTab = ({ orgId, orgName, companyOnly = false }: { orgId: string; orgName: string | null; companyOnly?: boolean }) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortKey, setSortKey] = useState<string>("tank_number");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [tankNumber, setTankNumber] = useState("");
  const [tankName, setTankName] = useState("");
  const [tankEid, setTankEid] = useState("");
  const [tankCustomerId, setTankCustomerId] = useState<string>("none");
  const [tankType, setTankType] = useState("customer_tank");
  const [tankNitrogenStatus, setTankNitrogenStatus] = useState("wet");
  const [tankLocationStatus, setTankLocationStatus] = useState("here");
  const [tankModel, setTankModel] = useState("");
  const [tankSerial, setTankSerial] = useState("");
  const [tankDesc, setTankDesc] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: tanks = [], isLoading } = useQuery({
    queryKey: ["all_tanks", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from("tanks").select("*, customers!tanks_customer_id_fkey(name)").eq("organization_id", orgId).order("tank_number", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: customers = [] } = useQuery({
    queryKey: ["customers_list", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("id, name").eq("organization_id", orgId).order("name", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: fills = [] } = useQuery({
    queryKey: ["tank_fills_all", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from("tank_fills").select("tank_id, fill_date").eq("organization_id", orgId).order("fill_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: inventory = [] } = useQuery({
    queryKey: ["tank_inventory_sums", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const PAGE = 1000;
      const allRows: any[] = [];
      let from = 0;
      while (true) {
        const { data, error } = await supabase.from("tank_inventory").select("tank_id, units").eq("organization_id", orgId).range(from, from + PAGE - 1);
        if (error) throw error;
        const rows = data ?? [];
        allRows.push(...rows);
        if (rows.length < PAGE) break;
        from += PAGE;
      }
      return allRows;
    },
  });

  const lastFillMap = useMemo(() => { const map = new Map<string, string>(); for (const f of fills) { if (!map.has(f.tank_id)) map.set(f.tank_id, f.fill_date); } return map; }, [fills]);
  const unitSumMap = useMemo(() => { const map = new Map<string, number>(); for (const inv of inventory) { map.set(inv.tank_id, (map.get(inv.tank_id) || 0) + (inv.units || 0)); } return map; }, [inventory]);

  const enriched = useMemo(() => tanks.map((t: any) => ({ ...t, customerName: t.customers?.name || null, lastFill: lastFillMap.get(t.id) || null, totalUnits: unitSumMap.get(t.id) || 0 })), [tanks, lastFillMap, unitSumMap]);
  const baseTanks = useMemo(() => companyOnly ? enriched.filter((t: any) => !t.customer_id) : enriched, [enriched, companyOnly]);

  const toggleSort = (key: string) => {
    if (sortKey === key) { setSortDir((d) => (d === "asc" ? "desc" : "asc")); }
    else { setSortKey(key); setSortDir("asc"); }
  };

  const filtered = useMemo(() => {
    let list = baseTanks;
    if (typeFilter !== "all") list = list.filter((t: any) => t.tank_type === typeFilter);
    if (statusFilter !== "all") list = list.filter((t: any) => t.nitrogen_status === statusFilter || (statusFilter === "out" && t.location_status === "out"));
    if (search) { const q = search.toLowerCase(); list = list.filter((t: any) => (t.tank_number || "").toLowerCase().includes(q) || (t.tank_name || "").toLowerCase().includes(q) || (t.customerName || "").toLowerCase().includes(q)); }
    list = [...list].sort((a: any, b: any) => {
      let aVal: any, bVal: any;
      switch (sortKey) {
        case "tank_number": aVal = a.tank_number || ""; bVal = b.tank_number || ""; break;
        case "tank_name": aVal = a.tank_name || ""; bVal = b.tank_name || ""; break;
        case "customer": aVal = a.customerName || ""; bVal = b.customerName || ""; break;
        case "tank_type": aVal = a.tank_type || ""; bVal = b.tank_type || ""; break;
        case "totalUnits": aVal = a.totalUnits || 0; bVal = b.totalUnits || 0; break;
        case "lastFill": aVal = a.lastFill || ""; bVal = b.lastFill || ""; break;
        default: aVal = a.tank_number || ""; bVal = b.tank_number || "";
      }
      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortDir === "asc" ? aVal - bVal : bVal - aVal;
      }
      return sortDir === "asc" ? String(aVal).localeCompare(String(bVal)) : String(bVal).localeCompare(String(aVal));
    });
    return list;
  }, [baseTanks, typeFilter, statusFilter, search, sortKey, sortDir]);

  const totalTanks = baseTanks.length;
  const wetCount = baseTanks.filter((t: any) => t.nitrogen_status === "wet" && t.location_status === "here").length;
  const dryCount = baseTanks.filter((t: any) => t.nitrogen_status === "dry" && t.location_status === "here").length;
  const outCount = baseTanks.filter((t: any) => t.location_status === "out").length;

  const handleSave = async () => {
    if (!tankNumber.trim() || !orgId) return;
    setSaving(true);
    const { error } = await supabase.from("tanks").insert({
      organization_id: orgId, tank_number: tankNumber.trim(), tank_name: tankName.trim() || null,
      eid: tankEid.trim() || null, customer_id: tankCustomerId === "none" ? null : tankCustomerId,
      tank_type: tankType, nitrogen_status: tankNitrogenStatus, location_status: tankLocationStatus,
      model: tankModel.trim() || null,
      serial_number: tankSerial.trim() || null, description: tankDesc.trim() || null,
    });
    setSaving(false);
    if (error) { toast({ title: "Error", description: "Could not add tank.", variant: "destructive" }); }
    else { queryClient.invalidateQueries({ queryKey: ["all_tanks"] }); toast({ title: "Tank added" }); setDialogOpen(false); resetForm(); }
  };
  const resetForm = () => { setTankNumber(""); setTankName(""); setTankEid(""); setTankCustomerId("none"); setTankType("customer_tank"); setTankNitrogenStatus("wet"); setTankLocationStatus("here"); setTankModel(""); setTankSerial(""); setTankDesc(""); };

  const getFillColor = (lastFill: string | null) => {
    if (!lastFill) return "";
    const days = differenceInDays(new Date(), parseISO(lastFill));
    if (days > 90) return "text-orange-400";
    return "";
  };

  const handleRowClick = (tank: any) => {
    navigate(`/tanks/${tank.id}`);
  };

  const handleExportTanksCsv = () => {
    const headers = ["Tank Number", "Tank Name", "Customer", "Type", "Nitrogen Status", "Location Status", "Model", "Last Fill", "Total Units"];
    const csvRows = [headers.join(",")];
    for (const t of filtered) {
      csvRows.push([
        `"${t.tank_number || ""}"`,
        `"${t.tank_name || ""}"`,
        `"${t.customerName || "Company"}"`,
        `"${TYPE_LABELS[t.tank_type] || t.tank_type}"`,
        `"${t.nitrogen_status || "unknown"}"`,
        `"${t.location_status || "here"}"`,
        `"${t.model || ""}"`,
        `"${t.lastFill || ""}"`,
        t.totalUnits || 0,
      ].join(","));
    }
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `BeefSynch_Tanks_${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div />
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={handleExportTanksCsv}>
            <FileSpreadsheet className="h-4 w-4" /> Export CSV
          </Button>
          <Button className="gap-2" onClick={() => { resetForm(); setDialogOpen(true); }}><Plus className="h-4 w-4" /> Add Tank</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className={cn("transition-all rounded-xl", statusFilter === "all" ? "ring-2 ring-primary" : "")}>
          <StatCard title="Total Tanks" value={totalTanks} delay={0} index={0} icon={Package} onClick={() => setStatusFilter("all")} />
        </div>
        <div className={cn("transition-all rounded-xl", statusFilter === "wet" ? "ring-2 ring-primary" : "")}>
          <StatCard title="Wet" value={wetCount} delay={100} index={1} icon={Droplets} onClick={() => setStatusFilter("wet")} />
        </div>
        <div className={cn("transition-all rounded-xl", statusFilter === "dry" ? "ring-2 ring-primary" : "")}>
          <StatCard title="Dry" value={dryCount} delay={200} index={2} icon={Sun} onClick={() => setStatusFilter("dry")} />
        </div>
        <div className={cn("transition-all rounded-xl", statusFilter === "out" ? "ring-2 ring-primary" : "")}>
          <StatCard title="Out" value={outCount} delay={300} index={3} icon={Truck} onClick={() => setStatusFilter("out")} />
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>{TANK_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>{STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
        </Select>
        <div className="relative min-w-[200px] max-w-xs flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search tanks..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
      </div>

      {/* Desktop table — xl and up */}
      <div className="hidden xl:block rounded-lg border border-border/50 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="whitespace-nowrap cursor-pointer hover:text-foreground" onClick={() => toggleSort("tank_number")}>
                <span className="inline-flex items-center gap-1">Tank Number <ArrowUpDown className="h-3 w-3" /></span>
              </TableHead>
              <TableHead className="whitespace-nowrap cursor-pointer hover:text-foreground" onClick={() => toggleSort("tank_name")}>
                <span className="inline-flex items-center gap-1">Tank Name <ArrowUpDown className="h-3 w-3" /></span>
              </TableHead>
              <TableHead className="whitespace-nowrap cursor-pointer hover:text-foreground" onClick={() => toggleSort("customer")}>
                <span className="inline-flex items-center gap-1">Customer <ArrowUpDown className="h-3 w-3" /></span>
              </TableHead>
              <TableHead className="whitespace-nowrap cursor-pointer hover:text-foreground" onClick={() => toggleSort("tank_type")}>
                <span className="inline-flex items-center gap-1">Type <ArrowUpDown className="h-3 w-3" /></span>
              </TableHead>
              <TableHead className="whitespace-nowrap">Status</TableHead>
              <TableHead className="whitespace-nowrap">Model</TableHead>
              <TableHead className="whitespace-nowrap cursor-pointer hover:text-foreground" onClick={() => toggleSort("lastFill")}>
                <span className="inline-flex items-center gap-1">Last Fill <ArrowUpDown className="h-3 w-3" /></span>
              </TableHead>
              <TableHead className="whitespace-nowrap text-right cursor-pointer hover:text-foreground" onClick={() => toggleSort("totalUnits")}>
                <span className="inline-flex items-center gap-1 justify-end">Total Units <ArrowUpDown className="h-3 w-3" /></span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={9} className="text-center py-12 text-muted-foreground">Loading…</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="text-center py-12 text-muted-foreground">{tanks.length === 0 ? "No tanks yet." : "No tanks match your filters."}</TableCell></TableRow>
            ) : filtered.map((tank: any) => (
              <TableRow key={tank.id} className="cursor-pointer hover:bg-secondary/50" onClick={() => handleRowClick(tank)}>
                <TableCell className="font-medium whitespace-nowrap">{tank.tank_number}</TableCell>
                <TableCell className="whitespace-nowrap text-primary hover:underline">{tank.tank_name || "—"}</TableCell>
                <TableCell className="whitespace-nowrap">{tank.customerName || orgName || "Company Owned"}</TableCell>
                <TableCell><Badge variant="outline" className={getBadgeClass('tankType', tank.tank_type)}>{TYPE_LABELS[tank.tank_type] || tank.tank_type}</Badge></TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={getBadgeClass('tankStatus', tank.nitrogen_status || "unknown")}>
                      {tank.nitrogen_status || "unknown"}
                    </Badge>
                    <Badge variant="outline" className={
                      tank.location_status === "here" ? "bg-green-600/20 text-green-400 border-green-600/30" :
                      "bg-blue-600/20 text-blue-400 border-blue-600/30"
                    }>
                      {tank.location_status === "here" ? "in shop" : "out with customer"}
                    </Badge>
                  </div>
                </TableCell>
                <TableCell className="whitespace-nowrap">{tank.model || "—"}</TableCell>
                <TableCell className={cn("whitespace-nowrap", getFillColor(tank.lastFill))}>{tank.lastFill ? format(parseISO(tank.lastFill), "MMM d, yyyy") : "—"}</TableCell>
                <TableCell className="text-right">{tank.totalUnits}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Card view — below xl */}
      <div className="xl:hidden rounded-lg border border-border/50 overflow-hidden divide-y divide-border">
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            {tanks.length === 0 ? "No tanks yet." : "No tanks match your filters."}
          </div>
        ) : (
          filtered.map((tank: any) => (
            <div
              key={tank.id}
              onClick={() => handleRowClick(tank)}
              className="p-4 space-y-3 hover:bg-secondary/50 transition-colors cursor-pointer active:bg-secondary/70"
            >
              {/* Row 1: Tank name/number + Total Units */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-foreground truncate">
                    {tank.tank_name ? (
                      <>{tank.tank_name} <span className="text-muted-foreground font-normal">#{tank.tank_number}</span></>
                    ) : (
                      <>Tank #{tank.tank_number}</>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 mt-1">
                    <Badge variant="outline" className={getBadgeClass('tankStatus', tank.nitrogen_status || 'unknown')}>
                      {tank.nitrogen_status || 'unknown'}
                    </Badge>
                    <Badge variant="outline" className={
                      tank.location_status === 'here'
                        ? 'bg-green-600/20 text-green-400 border-green-600/30'
                        : 'bg-blue-600/20 text-blue-400 border-blue-600/30'
                    }>
                      {tank.location_status === 'here' ? 'in shop' : 'out'}
                    </Badge>
                    <Badge variant="outline" className={getBadgeClass('tankType', tank.tank_type)}>
                      {TYPE_LABELS[tank.tank_type] || tank.tank_type}
                    </Badge>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-lg font-bold tabular-nums leading-none">{tank.totalUnits}</div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">units</div>
                </div>
              </div>

              {/* Row 2: Key details */}
              <div className="grid grid-cols-[80px_1fr] gap-x-3 gap-y-1.5 text-sm">
                <div className="text-xs text-muted-foreground uppercase tracking-wide">Customer</div>
                <div className="truncate">{tank.customerName || orgName || 'Company Owned'}</div>
                <div className="text-xs text-muted-foreground uppercase tracking-wide">Model</div>
                <div className="truncate">{tank.model || '—'}</div>
                <div className="text-xs text-muted-foreground uppercase tracking-wide">Last Fill</div>
                <div className={cn(getFillColor(tank.lastFill))}>
                  {tank.lastFill ? format(parseISO(tank.lastFill), 'MMM d, yyyy') : '—'}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Add Tank</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5"><Label>Tank Number *</Label><Input value={tankNumber} onChange={(e) => setTankNumber(e.target.value)} placeholder="e.g. T-001" /></div>
            <div className="space-y-1.5"><Label>Tank Name</Label><Input value={tankName} onChange={(e) => setTankName(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>EID</Label><Input value={tankEid} onChange={(e) => setTankEid(e.target.value)} /></div>
            {!companyOnly && (
              <div className="space-y-1.5">
                <Label>Customer</Label>
                <Select value={tankCustomerId} onValueChange={setTankCustomerId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Company Owned</SelectItem>
                    {customers.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Tank Type</Label>
                <Select value={tankType} onValueChange={setTankType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TANK_TYPES.filter((t) => t.value !== "all").map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Nitrogen Status</Label>
                <Select value={tankNitrogenStatus} onValueChange={setTankNitrogenStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="wet">Wet</SelectItem>
                    <SelectItem value="dry">Dry</SelectItem>
                    <SelectItem value="unknown">Unknown</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Location</Label>
                <Select value={tankLocationStatus} onValueChange={setTankLocationStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="here">Here (In Shop)</SelectItem>
                    <SelectItem value="out">Out (With Customer)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5"><Label>Model</Label><Input value={tankModel} onChange={(e) => setTankModel(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Serial Number</Label><Input value={tankSerial} onChange={(e) => setTankSerial(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Description</Label><Textarea value={tankDesc} onChange={(e) => setTankDesc(e.target.value)} rows={2} /></div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving || !tankNumber.trim()}>{saving ? "Saving…" : "Save"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

/* ═══════════════════════════════════════════════════
   TAB 3 — FILLS
   ═══════════════════════════════════════════════════ */
const FillsTab = ({ orgId, userId }: { orgId: string; userId: string | null }) => {
  const queryClient = useQueryClient();
  const [selectedTankId, setSelectedTankId] = useState<string>("");
  const [tankComboboxOpen, setTankComboboxOpen] = useState(false);
  const [fillDate, setFillDate] = useState<Date>(new Date());
  const [fillType, setFillType] = useState("Monthly Fill");
  const [fillNotes, setFillNotes] = useState("");
  const [fillSaving, setFillSaving] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const [bulkRows, setBulkRows] = useState<BulkRow[] | null>(null);
  const [bulkDate, setBulkDate] = useState<Date>(new Date());
  const [useSingleDate, setUseSingleDate] = useState(false);
  const [bulkImporting, setBulkImporting] = useState(false);

  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("wet");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [search, setSearch] = useState("");

  const { data: tanks = [] } = useQuery({
    queryKey: ["all_tanks", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from("tanks").select("*, customers!tanks_customer_id_fkey(name)").eq("organization_id", orgId).order("tank_number", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: fills = [] } = useQuery({
    queryKey: ["all_tank_fills", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from("tank_fills").select("tank_id, fill_date").eq("organization_id", orgId).order("fill_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const lastFillMap = useMemo(() => { const map = new Map<string, string>(); for (const f of fills) { if (!map.has(f.tank_id)) map.set(f.tank_id, f.fill_date); } return map; }, [fills]);
  const enriched = useMemo(() => tanks.map((t: any) => { const lastFill = lastFillMap.get(t.id) || null; const daysSince = lastFill ? differenceInDays(new Date(), parseISO(lastFill)) : null; return { ...t, customerName: t.customers?.name || null, lastFill, daysSince }; }), [tanks, lastFillMap]);

  const filtered = useMemo(() => {
    let list = enriched;
    if (typeFilter !== "all") list = list.filter((t: any) => t.tank_type === typeFilter);
    if (statusFilter !== "all") list = list.filter((t: any) => t.nitrogen_status === statusFilter || (statusFilter === "out" && t.location_status === "out"));
    if (overdueOnly) list = list.filter((t: any) => t.daysSince === null || t.daysSince > 90);
    if (search) { const q = search.toLowerCase(); list = list.filter((t: any) => (t.tank_number || "").toLowerCase().includes(q) || (t.tank_name || "").toLowerCase().includes(q) || (t.customerName || "").toLowerCase().includes(q)); }
    list.sort((a: any, b: any) => { const ad = a.daysSince ?? 99999; const bd = b.daysSince ?? 99999; return bd - ad; });
    return list;
  }, [enriched, typeFilter, statusFilter, overdueOnly, search]);

  const handleRecordFill = async () => {
    if (!selectedTankId || !orgId) return;
    setFillSaving(true);
    const { error } = await supabase.from("tank_fills").insert({ organization_id: orgId, tank_id: selectedTankId, fill_date: format(fillDate, "yyyy-MM-dd"), filled_by: userId, fill_type: fillType, notes: fillNotes.trim() || null });
    setFillSaving(false);
    if (error) { toast({ title: "Error", description: "Could not record fill.", variant: "destructive" }); }
    else { const tank = tanks.find((t: any) => t.id === selectedTankId); toast({ title: "Fill recorded", description: tank ? `${tank.tank_number} ${tank.tank_name || ""}` : "" }); queryClient.invalidateQueries({ queryKey: ["all_tank_fills"] }); setSelectedTankId(""); setFillNotes(""); }
  };

  const handleFileChange = (file: File | undefined) => {
    if (!file) return;
    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: (results) => {
        const headers = results.meta.fields || [];
        let idCol = headers[0];
        for (const h of headers) { if (EID_HEADERS.includes(h.toLowerCase().trim())) { idCol = h; break; } }
        let dateCol: string | null = null;
        for (const h of headers) { if (DATE_HEADERS.includes(h.toLowerCase().trim())) { dateCol = h; break; } }
        if (!dateCol && headers.length > 1) dateCol = headers[1];
        const rows: BulkRow[] = (results.data as any[]).map((row, i) => {
          const rawId = (row[idCol] || "").toString().trim();
          const rawDate = dateCol ? (row[dateCol] || "").toString().trim() : "";
          const match = tanks.find((t: any) => (t.eid && t.eid.toLowerCase() === rawId.toLowerCase()) || t.tank_number.toLowerCase() === rawId.toLowerCase());
          return { rowNum: i + 1, csvValue: rawId, matchedTank: match ? { id: match.id, tank_number: match.tank_number, tank_name: match.tank_name } : null, parsedDate: tryParseDate(rawDate) };
        });
        const validDates = rows.filter(r => r.parsedDate).map(r => format(r.parsedDate!, "yyyy-MM-dd"));
        const uniqueDates = new Set(validDates);
        setUseSingleDate(validDates.length === 0 || uniqueDates.size <= 1);
        setBulkRows(rows);
      },
    });
    if (fileRef.current) fileRef.current.value = "";
  };

  const matchedRows = bulkRows?.filter(r => r.matchedTank) ?? [];
  const unmatchedCount = (bulkRows?.length ?? 0) - matchedRows.length;

  const handleBulkImport = async () => {
    if (!orgId || matchedRows.length === 0) return;
    setBulkImporting(true);
    const inserts = matchedRows.map(r => ({ organization_id: orgId, tank_id: r.matchedTank!.id, fill_date: format(useSingleDate || !r.parsedDate ? bulkDate : r.parsedDate, "yyyy-MM-dd"), filled_by: userId, notes: "Bulk import" }));
    const { error } = await supabase.from("tank_fills").insert(inserts as any);
    setBulkImporting(false);
    if (error) { toast({ title: "Import failed", description: error.message, variant: "destructive" }); }
    else { toast({ title: `Imported ${matchedRows.length} tank fills` }); setBulkRows(null); queryClient.invalidateQueries({ queryKey: ["all_tank_fills"] }); }
  };

  return (
    <div className="space-y-8">
      {/* Quick Fill */}
      <div className="rounded-lg border border-border/50 p-4 bg-muted/10 space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Record Fill</h3>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5 min-w-[240px] flex-1 max-w-sm">
            <Label>Tank</Label>
            <Popover open={tankComboboxOpen} onOpenChange={setTankComboboxOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" aria-expanded={tankComboboxOpen} className="w-full justify-between font-normal">
                  {selectedTankId ? (() => { const t = tanks.find((t: any) => t.id === selectedTankId); return t ? `${t.tank_number}${t.tank_name ? ` — ${t.tank_name}` : ""}${t.customers?.name ? ` (${t.customers.name})` : ""}` : "Select tank…"; })() : "Select tank…"}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command filter={(value, search) => value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0}>
                  <CommandInput placeholder="Search by number or name…" />
                  <CommandList>
                    <CommandEmpty>No tanks found.</CommandEmpty>
                    <CommandGroup>
                      {tanks.map((t: any) => (
                        <CommandItem key={t.id} value={`${t.tank_number} ${t.tank_name || ""} ${t.customers?.name || ""}`} onSelect={() => { setSelectedTankId(t.id); setTankComboboxOpen(false); }}>
                          <Check className={cn("mr-2 h-4 w-4", selectedTankId === t.id ? "opacity-100" : "opacity-0")} />
                          {t.tank_number}{t.tank_name ? ` — ${t.tank_name}` : ""}{t.customers?.name ? ` (${t.customers.name})` : ""}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
          <div className="space-y-1.5">
            <Label>Fill Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-[180px] justify-start text-left font-normal")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />{format(fillDate, "PPP")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={fillDate} onSelect={(d) => d && setFillDate(d)} initialFocus className="p-3 pointer-events-auto" /></PopoverContent>
            </Popover>
          </div>
          <div className="space-y-1.5 min-w-[160px]">
            <Label>Fill Type</Label>
            <Select value={fillType} onValueChange={setFillType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Monthly Fill">Monthly Fill</SelectItem>
                <SelectItem value="Full Fill">Full Fill</SelectItem>
                <SelectItem value="Topped Off">Topped Off</SelectItem>
                <SelectItem value="Route Fill">Route Fill</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 min-w-[160px] flex-1 max-w-xs">
            <Label>Notes</Label>
            <Input value={fillNotes} onChange={(e) => setFillNotes(e.target.value)} placeholder="Optional notes…" />
          </div>
          <Button onClick={handleRecordFill} disabled={fillSaving || !selectedTankId} className="gap-2"><Droplets className="h-4 w-4" /> {fillSaving ? "Saving…" : "Record Fill"}</Button>
        </div>
      </div>

      {/* Bulk Import */}
      <div className="rounded-lg border border-border/50 p-4 bg-muted/10 space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Bulk Import Fills</h3>
        {!bulkRows ? (
          <div onClick={() => fileRef.current?.click()} onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }} onDrop={(e) => { e.preventDefault(); e.stopPropagation(); handleFileChange(e.dataTransfer.files?.[0]); }} className="border-2 border-dashed border-border rounded-lg p-8 flex flex-col items-center gap-3 cursor-pointer hover:border-primary/50 hover:bg-muted/20 transition-colors">
            <FileSpreadsheet className="h-8 w-8 text-muted-foreground" /><p className="text-sm text-muted-foreground">Upload CSV of scanned tank fills</p><p className="text-xs text-muted-foreground">Drag & drop or click to browse (.csv)</p>
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={(e) => handleFileChange(e.target.files?.[0])} />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-4">
              <p className="text-sm"><span className="font-medium text-foreground">{matchedRows.length}</span> of <span className="font-medium text-foreground">{bulkRows.length}</span> rows matched.{unmatchedCount > 0 && <span className="text-destructive ml-1">{unmatchedCount} unmatched.</span>}</p>
              {useSingleDate && (
                <div className="flex items-center gap-2">
                  <Label className="text-sm whitespace-nowrap">Fill Date for All:</Label>
                  <Popover>
                    <PopoverTrigger asChild><Button variant="outline" size="sm" className="w-[160px] justify-start text-left font-normal"><CalendarIcon className="mr-2 h-3.5 w-3.5" />{format(bulkDate, "PPP")}</Button></PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={bulkDate} onSelect={(d) => d && setBulkDate(d)} initialFocus className="p-3 pointer-events-auto" /></PopoverContent>
                  </Popover>
                </div>
              )}
            </div>
            <div className="rounded-lg border border-border/50 overflow-x-auto">
              <Table>
                <TableHeader><TableRow className="bg-muted/30"><TableHead className="w-12">#</TableHead><TableHead>CSV Value</TableHead><TableHead>Matched Tank</TableHead><TableHead>Date</TableHead><TableHead className="w-12 text-center">Status</TableHead></TableRow></TableHeader>
                <TableBody>
                  {bulkRows.map((row) => (
                    <TableRow key={row.rowNum} className={!row.matchedTank ? "bg-destructive/5" : ""}>
                      <TableCell className="text-muted-foreground">{row.rowNum}</TableCell>
                      <TableCell className="font-mono text-sm">{row.csvValue}</TableCell>
                      <TableCell>{row.matchedTank ? <span>{row.matchedTank.tank_number}{row.matchedTank.tank_name ? ` — ${row.matchedTank.tank_name}` : ""}</span> : <span className="text-destructive font-medium">NO MATCH</span>}</TableCell>
                      <TableCell className="whitespace-nowrap">{useSingleDate ? format(bulkDate, "MMM d, yyyy") : row.parsedDate ? format(row.parsedDate, "MMM d, yyyy") : "—"}</TableCell>
                      <TableCell className="text-center">{row.matchedTank ? <Check className="h-4 w-4 text-green-500 mx-auto" /> : <X className="h-4 w-4 text-destructive mx-auto" />}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex gap-3">
              <Button onClick={handleBulkImport} disabled={bulkImporting || matchedRows.length === 0} className="gap-2"><Upload className="h-4 w-4" />{bulkImporting ? "Importing…" : `Import ${matchedRows.length} Fills`}</Button>
              <Button variant="outline" onClick={() => setBulkRows(null)}>Clear</Button>
            </div>
          </div>
        )}
      </div>

      {/* Overdue Report */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Overdue Tanks Report</h3>
        <div className="flex flex-wrap gap-3 items-center">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>{TANK_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>{STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
          </Select>
          <div className="relative min-w-[200px] max-w-xs flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <div className="flex items-center gap-2"><Switch checked={overdueOnly} onCheckedChange={setOverdueOnly} id="overdue-toggle-dash" /><Label htmlFor="overdue-toggle-dash" className="text-sm">Overdue only</Label></div>
        </div>
        <div className="rounded-lg border border-border/50 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead>Tank Number</TableHead><TableHead>Tank Name</TableHead><TableHead>Customer</TableHead><TableHead>Type</TableHead><TableHead>Status</TableHead><TableHead>Last Fill</TableHead><TableHead className="text-right">Days Since</TableHead><TableHead className="text-center">Flag</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center py-12 text-muted-foreground">No tanks match filters.</TableCell></TableRow>
              ) : filtered.map((tank: any) => (
                <TableRow key={tank.id} className="hover:bg-muted/20">
                  <TableCell className="font-medium whitespace-nowrap">{tank.tank_number}</TableCell>
                  <TableCell className="whitespace-nowrap">{tank.tank_name || "—"}</TableCell>
                  <TableCell className="whitespace-nowrap">{tank.customerName || "Company"}</TableCell>
                  <TableCell><Badge variant="outline" className={getBadgeClass('tankType', tank.tank_type)}>{TYPE_LABELS[tank.tank_type] || tank.tank_type}</Badge></TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Badge variant="outline" className={getBadgeClass('tankStatus', tank.nitrogen_status || "unknown")}>
                        {tank.nitrogen_status || "unknown"}
                      </Badge>
                      {tank.location_status === "out" && (
                        <Badge variant="outline" className="bg-blue-600/20 text-blue-400 border-blue-600/30">out</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{tank.lastFill ? format(parseISO(tank.lastFill), "MMM d, yyyy") : "—"}</TableCell>
                  <TableCell className={cn("text-right font-medium", tank.daysSince !== null && tank.daysSince > 120 && "text-destructive", tank.daysSince !== null && tank.daysSince > 90 && tank.daysSince <= 120 && "text-orange-400")}>{tank.daysSince !== null ? tank.daysSince : "—"}</TableCell>
                  <TableCell className="text-center">
                    {tank.daysSince === null ? <span className="text-xs text-muted-foreground">No fills</span> : tank.daysSince > 120 ? <AlertCircle className="h-4 w-4 text-destructive mx-auto" /> : tank.daysSince > 90 ? <AlertTriangle className="h-4 w-4 text-orange-400 mx-auto" /> : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════
   TAB 4 — TANKS OUT
   ═══════════════════════════════════════════════════ */
const TanksOutTab = ({ orgId, userId }: { orgId: string; userId: string | null }) => {
  const queryClient = useQueryClient();
  const [returnOpen, setReturnOpen] = useState(false);
  const [returnTankId, setReturnTankId] = useState<string | null>(null);
  const [returnDate, setReturnDate] = useState<Date>(new Date());
  const [returnStatus, setReturnStatus] = useState("wet");
  const [returnNotes, setReturnNotes] = useState("");
  const [returnSaving, setReturnSaving] = useState(false);

  const { data: outTanks = [], isLoading } = useQuery({
    queryKey: ["tanks_out", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from("tanks").select("*, customers!tanks_customer_id_fkey(name)").eq("organization_id", orgId).eq("location_status", "out").order("tank_number");
      if (error) throw error;
      return data ?? [];
    },
  });

  const outTankIds = useMemo(() => outTanks.map((t: any) => t.id), [outTanks]);
  const { data: movements = [] } = useQuery({
    queryKey: ["out_tank_movements", outTankIds],
    enabled: outTankIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("tank_movements").select("tank_id, movement_date, movement_type, notes, customers(name)").in("tank_id", outTankIds).in("movement_type", ["picked_up", "shipped_out"]).order("movement_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const monthStart = format(startOfMonth(new Date()), "yyyy-MM-dd");
  const { data: returnsThisMonth = [] } = useQuery({
    queryKey: ["returns_this_month", orgId, monthStart],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from("tank_movements").select("id").eq("organization_id", orgId).in("movement_type", ["returned", "received_back"]).gte("movement_date", monthStart);
      if (error) throw error;
      return data ?? [];
    },
  });

  const lastOutMap = useMemo(() => { const map = new Map<string, any>(); for (const m of movements) { if (!map.has(m.tank_id)) map.set(m.tank_id, m); } return map; }, [movements]);

  const enriched = useMemo(() =>
    outTanks.map((t: any) => {
      const move = lastOutMap.get(t.id);
      const dateOut = move?.movement_date || null;
      const daysOut = dateOut ? differenceInDays(new Date(), parseISO(dateOut)) : null;
      const customerName = move?.customers?.name || t.customers?.name || null;
      return { ...t, dateOut, daysOut, moveNotes: move?.notes || null, customerName };
    }).sort((a: any, b: any) => (b.daysOut ?? 99999) - (a.daysOut ?? 99999)),
    [outTanks, lastOutMap]
  );

  const currentlyOut = outTanks.length;
  const avgDaysOut = useMemo(() => { const vals = enriched.filter((t: any) => t.daysOut !== null).map((t: any) => t.daysOut as number); return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0; }, [enriched]);
  const returnedCount = returnsThisMonth.length;

  const openReturn = (tankId: string) => { setReturnTankId(tankId); setReturnDate(new Date()); setReturnStatus("wet"); setReturnNotes(""); setReturnOpen(true); };

  const handleReturn = async () => {
    if (!returnTankId || !orgId) return;
    setReturnSaving(true);
    const { error: moveErr } = await supabase.from("tank_movements").insert({ organization_id: orgId, tank_id: returnTankId, movement_type: "returned", movement_date: format(returnDate, "yyyy-MM-dd"), location_status_after: "here", performed_by: userId, notes: returnNotes.trim() || null });
    if (moveErr) { setReturnSaving(false); toast({ title: "Error", description: "Could not record return.", variant: "destructive" }); return; }
    await supabase.from("tanks").update({ location_status: "here", nitrogen_status: returnStatus }).eq("id", returnTankId);
    setReturnSaving(false);
    queryClient.invalidateQueries({ queryKey: ["tanks_out"] });
    queryClient.invalidateQueries({ queryKey: ["returns_this_month"] });
    queryClient.invalidateQueries({ queryKey: ["all_tanks"] });
    toast({ title: "Return recorded" });
    setReturnOpen(false);
  };

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard title="Currently Out" value={currentlyOut} delay={0} index={0} icon={Truck} />
        <StatCard title="Avg Days Out" value={avgDaysOut} delay={100} index={1} icon={Clock} />
        <StatCard title="Returned This Month" value={returnedCount} delay={200} index={2} icon={RotateCcw} />
      </div>

      <div className="rounded-lg border border-border/50 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead>Tank Number</TableHead><TableHead>Tank Name</TableHead><TableHead>Customer</TableHead><TableHead>Type</TableHead><TableHead>Date Out</TableHead><TableHead className="text-right">Days Out</TableHead><TableHead>Notes</TableHead><TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={8} className="text-center py-12 text-muted-foreground">Loading…</TableCell></TableRow>
            ) : enriched.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center py-12 text-muted-foreground">No tanks currently out.</TableCell></TableRow>
            ) : enriched.map((tank: any) => (
              <TableRow key={tank.id} className={cn("hover:bg-muted/20", tank.daysOut !== null && tank.daysOut > 60 && "bg-destructive/5", tank.daysOut !== null && tank.daysOut > 30 && tank.daysOut <= 60 && "bg-amber-500/5")}>
                <TableCell className="font-medium whitespace-nowrap">{tank.tank_number}</TableCell>
                <TableCell className="whitespace-nowrap">{tank.tank_name || "—"}</TableCell>
                <TableCell className="whitespace-nowrap">{tank.customerName || "—"}</TableCell>
                <TableCell><Badge variant="outline" className={getBadgeClass('tankType', tank.tank_type)}>{TYPE_LABELS[tank.tank_type] || tank.tank_type}</Badge></TableCell>
                <TableCell className="whitespace-nowrap">{tank.dateOut ? format(parseISO(tank.dateOut), "MMM d, yyyy") : "—"}</TableCell>
                <TableCell className={cn("text-right font-medium", tank.daysOut !== null && tank.daysOut > 60 && "text-destructive", tank.daysOut !== null && tank.daysOut > 30 && tank.daysOut <= 60 && "text-orange-400")}>{tank.daysOut ?? "—"}</TableCell>
                <TableCell className="text-xs max-w-[200px] truncate">{tank.moveNotes || "—"}</TableCell>
                <TableCell className="text-right"><Button variant="outline" size="sm" onClick={() => openReturn(tank.id)} className="gap-1.5"><RotateCcw className="h-3.5 w-3.5" /> Return</Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={returnOpen} onOpenChange={setReturnOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Record Return</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Return Date</Label>
              <Popover>
                <PopoverTrigger asChild><Button variant="outline" className="w-full justify-start text-left font-normal"><CalendarIcon className="mr-2 h-4 w-4" />{format(returnDate, "PPP")}</Button></PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={returnDate} onSelect={(d) => d && setReturnDate(d)} initialFocus className="p-3 pointer-events-auto" /></PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1.5">
              <Label>Status After</Label>
              <Select value={returnStatus} onValueChange={setReturnStatus}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="wet">Wet</SelectItem><SelectItem value="dry">Dry</SelectItem></SelectContent></Select>
            </div>
            <div className="space-y-1.5"><Label>Notes</Label><Textarea value={returnNotes} onChange={(e) => setReturnNotes(e.target.value)} rows={2} /></div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setReturnOpen(false)}>Cancel</Button>
              <Button onClick={handleReturn} disabled={returnSaving}>{returnSaving ? "Saving…" : "Save"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

/* ═══════════════════════════════════════════════════
   MAIN WRAPPER
   ═══════════════════════════════════════════════════ */
type SubTabKey = "tanks" | "fills" | "out";

const TanksTabContent = ({ orgId, orgName, userId, companyOnly = false, initialSubTab }: { orgId: string; orgName: string | null; userId: string | null; companyOnly?: boolean; initialSubTab?: string }) => {
  const [subTab, setSubTab] = useState<SubTabKey>(
    initialSubTab === "fills" ? "fills" : initialSubTab === "out" ? "out" : "tanks"
  );

  const subTabs: { key: SubTabKey; label: string }[] = [
    { key: "tanks", label: "Tanks" },
    { key: "fills", label: "Fills" },
    { key: "out", label: "Out" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {subTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setSubTab(tab.key)}
            className={cn(
              "inline-flex items-center rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
              subTab === tab.key
                ? "bg-primary text-primary-foreground"
                : "bg-card/60 text-muted-foreground hover:text-foreground hover:bg-secondary/60 border border-border/40"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      
      {subTab === "tanks" && <TanksTab orgId={orgId} orgName={orgName} companyOnly={companyOnly} />}
      {subTab === "fills" && <FillsTab orgId={orgId} userId={userId} />}
      {subTab === "out" && <TanksOutTab orgId={orgId} userId={userId} />}
    </div>
  );
};

export default TanksTabContent;
