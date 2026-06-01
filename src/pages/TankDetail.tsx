import { useState, useMemo, useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRightLeft, Droplets, RotateCcw, Truck, Sun, PackagePlus, ClipboardList, Package, PackageOpen, Pencil, Trash2, ChevronRight, ChevronDown, Search } from "lucide-react";
import TransferDialog from "@/components/inventory/TransferDialog";
import QuickBullEditDialog from "@/components/bulls/QuickBullEditDialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ExportMenu } from "@/components/ExportMenu";
import { ExportConfig } from "@/lib/exports";
import { getBullDisplayName, getBullDisplayLabel } from "@/lib/bullDisplay";
import { Plus, Loader2 } from "lucide-react";

import { format, parseISO, differenceInDays } from "date-fns";

import Navbar from "@/components/Navbar";
import AppFooter from "@/components/AppFooter";

import { supabase } from "@/integrations/supabase/client";
import { useOrgRole } from "@/hooks/useOrgRole";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import CustomerPicker from "@/components/CustomerPicker";
import BullCombobox from "@/components/BullCombobox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { cn } from "@/lib/utils";
import { CalendarIcon } from "lucide-react";

const STATUS_BADGE: Record<string, string> = {
  wet: "bg-green-600/20 text-green-400 border-green-600/30",
  dry: "bg-yellow-600/20 text-yellow-400 border-yellow-600/30",
  out: "bg-blue-600/20 text-blue-400 border-blue-600/30",
  inactive: "bg-muted text-muted-foreground border-border",
  "bad tank": "bg-destructive/20 text-destructive border-destructive/30",
  unknown: "bg-muted text-muted-foreground border-border",
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

const TYPE_LABELS: Record<string, string> = {
  customer_tank: "Customer Tank", inventory_tank: "Inventory Tank", shipper: "Shipper",
  mushroom: "Mushroom", rental_tank: "Rental Tank", communal_tank: "Communal Tank", freeze_branding: "Freeze Branding",
};

const MOVEMENT_BADGE: Record<string, string> = {
  picked_up: "bg-amber-600/20 text-amber-400 border-amber-600/30",
  returned: "bg-green-600/20 text-green-400 border-green-600/30",
  shipped_out: "bg-blue-600/20 text-blue-400 border-blue-600/30",
  received_back: "bg-teal-600/20 text-teal-400 border-teal-600/30",
};

const TXN_BADGE: Record<string, string> = {
  reinventory_adjustment: "bg-amber-600/20 text-amber-400 border-amber-600/30",
  reinventory_found: "bg-green-600/20 text-green-400 border-green-600/30",
  added: "bg-green-600/20 text-green-400 border-green-600/30",
  used: "bg-destructive/20 text-destructive border-destructive/30",
};

const TANK_TYPES = [
  { value: "customer_tank", label: "Customer Tank" },
  { value: "inventory_tank", label: "Inventory Tank" },
  { value: "shipper", label: "Shipper" },
  { value: "mushroom", label: "Mushroom" },
  { value: "rental_tank", label: "Rental Tank" },
  { value: "communal_tank", label: "Communal Tank" },
  { value: "freeze_branding", label: "Freeze Branding" },
];

const NITROGEN_STATUSES = [
  { value: "wet", label: "Wet" },
  { value: "dry", label: "Dry" },
  { value: "unknown", label: "Unknown" },
];
const LOCATION_STATUSES = [
  { value: "here", label: "In shop" },
  { value: "out", label: "Out with customer" },
];

// ───── Pack History Section (for shipper tanks) ─────
const PackHistorySection = ({ tankId, navigate }: { tankId: string; navigate: (path: string) => void }) => {
  const { data: packs = [], isLoading } = useQuery({
    queryKey: ["tank_pack_history", tankId],
    enabled: !!tankId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tank_packs")
        .select("id, packed_at, packed_by, status, pack_type, destination_name, tank_pack_projects(project_id, projects!tank_pack_projects_project_id_fkey(name)), tank_pack_lines(units)")
        .eq("field_tank_id", tankId)
        .order("packed_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">Pack History</h2>
        <Button variant="outline" size="sm" onClick={() => navigate(`/pack-tank?tankId=${tankId}`)} className="gap-1.5">
          <PackagePlus className="h-4 w-4" /> Pack This Tank
        </Button>
      </div>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : packs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No packs recorded for this tank.</p>
      ) : (
        <div className="rounded-lg border border-border/50 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead>Date Packed</TableHead>
                <TableHead>Projects</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Units</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {packs.map((p: any) => {
                const projNames = (p.tank_pack_projects || []).map((pp: any) => pp.projects?.name).filter(Boolean).join(", ");
                const totalUnitsForPack = (p.tank_pack_lines || []).reduce((s: number, l: any) => s + (l.units || 0), 0);
                const isShipment = p.pack_type === "shipment";
                return (
                  <TableRow key={p.id} className="cursor-pointer hover:bg-muted/20" onClick={() => navigate(`/pack/${p.id}`)}>
                    <TableCell>{format(new Date(p.packed_at), "MMM d, yyyy")}</TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1">
                        {isShipment ? <Truck className="h-3 w-3 text-muted-foreground" /> : <ClipboardList className="h-3 w-3 text-muted-foreground" />}
                        {isShipment ? `Ship to: ${p.destination_name || "—"}` : (projNames || "—")}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={
                        p.status === "packed" || p.status === "in_field" ? "bg-green-600/20 text-green-400 border-green-600/30" :
                        p.status === "unpacked" ? "bg-blue-600/20 text-blue-400 border-blue-600/30" :
                        "bg-muted text-muted-foreground border-border"
                      }>{p.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">{totalUnitsForPack}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
};

function PickupForm({ row, tankName, orgId, userId, tankId, onSuccess, onCancel }: {
  row: any;
  tankName: string;
  orgId: string | null;
  userId: string | null;
  tankId: string;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [units, setUnits] = useState<number>(row.units);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const bullName = getBullDisplayName(row);
  const customerName = row.customers?.name || row.owner || "Customer";

  const handleSubmit = async () => {
    if (!units || units <= 0) {
      toast({ title: "Enter units", description: "Units must be greater than zero", variant: "destructive" });
      return;
    }
    if (units > row.units) {
      toast({ title: "Too many", description: `Only ${row.units} available`, variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.rpc("customer_pickup", {
        _source_inventory_id: row.id,
        _units: units,
        _customer_id: row.customer_id,
        _notes: note.trim() || null,
        _performed_by: userId,
      });
      if (error) throw error;
      toast({ title: "Pickup recorded", description: `${units} units of ${bullName} picked up by ${customerName}` });
      onSuccess();
    } catch (e: any) {
      toast({ title: "Pickup failed", description: e?.message || "Unknown error", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-md bg-muted/50 p-3 text-sm space-y-1">
        <div><span className="text-muted-foreground">Bull:</span> <span className="font-medium">{bullName}</span></div>
        <div><span className="text-muted-foreground">Tank:</span> {tankName} / Can {row.canister}</div>
        <div><span className="text-muted-foreground">Customer:</span> {customerName}</div>
        <div><span className="text-muted-foreground">Available:</span> {row.units} units</div>
      </div>
      <div>
        <Label>Units to pick up</Label>
        <Input
          type="number"
          min={1}
          max={row.units}
          value={units}
          onChange={(e) => setUnits(Number(e.target.value) || 0)}
          placeholder="Units"
          className="mt-1"
        />
      </div>
      <div>
        <Label>Note (optional)</Label>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Picked up by Nate on 4/28"
          className="mt-1 h-16"
        />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={handleSubmit} disabled={submitting}>
          {submitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processing...</> : "Record Pickup"}
        </Button>
      </div>
    </div>
  );
}

const TankDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { orgId, userId } = useOrgRole();
  const queryClient = useQueryClient();

  // Edit dialog
  const [editOpen, setEditOpen] = useState(false);
  const [deletingTank, setDeletingTank] = useState(false);
  const [eTankNumber, setETankNumber] = useState("");
  const [eTankName, setETankName] = useState("");
  const [eTankEid, setETankEid] = useState("");
  const [eTankType, setETankType] = useState("inventory_tank");
  const [eCustomerId, setECustomerId] = useState<string | null>(null);
  const [eCustomerOptions, setECustomerOptions] = useState<{ id: string; name: string }[]>([]);
  const [eNitrogenStatus, setENitrogenStatus] = useState("wet");
  const [eLocationStatus, setELocationStatus] = useState("here");
  const [eTankModel, setETankModel] = useState("");
  const [eTankSerial, setETankSerial] = useState("");
  const [eTankDesc, setETankDesc] = useState("");
  const [eSaving, setESaving] = useState(false);

  // Fill dialog
  const [fillOpen, setFillOpen] = useState(false);
  const [fillDate, setFillDate] = useState<Date>(new Date());
  const [fillNotes, setFillNotes] = useState("");
  const [fillSaving, setFillSaving] = useState(false);

  // Auto-open the edit or fill dialog when navigated here from the tank
  // list's action menu via ?action=edit / ?action=fill. We consume the
  // param once so the dialog doesn't re-open on every render.
  useEffect(() => {
    const action = searchParams.get("action");
    if (action === "edit") {
      setEditOpen(true);
      searchParams.delete("action");
      setSearchParams(searchParams, { replace: true });
    } else if (action === "fill") {
      setFillDate(new Date());
      setFillNotes("");
      setFillOpen(true);
      searchParams.delete("action");
      setSearchParams(searchParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load customers for the edit dialog when type becomes customer_tank.
  useEffect(() => {
    if (eTankType !== "customer_tank" || !orgId) return;
    supabase
      .from("customers")
      .select("id, name")
      .eq("organization_id", orgId)
      .order("name")
      .then(({ data }) => setECustomerOptions(data ?? []));
  }, [eTankType, orgId]);

  // Movement dialog
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveType, setMoveType] = useState("picked_up");
  const [moveDate, setMoveDate] = useState<Date>(new Date());
  const [moveCustomerId, setMoveCustomerId] = useState("none");
  const [moveProjectId, setMoveProjectId] = useState("none");
  const [moveNotes, setMoveNotes] = useState("");
  const [moveSaving, setMoveSaving] = useState(false);

  // Manual add dialog
  const [showManualAdd, setShowManualAdd] = useState(false);
  const [manualBullName, setManualBullName] = useState("");
  const [manualBullCatalogId, setManualBullCatalogId] = useState<string | null>(null);
  const [manualBullCode, setManualBullCode] = useState("");
  const [manualUnits, setManualUnits] = useState<number>(0);
  const [manualCanister, setManualCanister] = useState("");
  const [manualNotes, setManualNotes] = useState("");
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [manualCustomerId, setManualCustomerId] = useState<string | null>(null);
  const [manualOwner, setManualOwner] = useState<"Select" | "CATL" | "">("");
  const [manualErrors, setManualErrors] = useState<Record<string, string>>({});
  const [fillHistoryOpen, setFillHistoryOpen] = useState(false);

  // Transfer dialog
  const [transferOpen, setTransferOpen] = useState(false);
  const [editBullId, setEditBullId] = useState<string | null>(null);
  const [transferRow, setTransferRow] = useState<any | null>(null);

  // Customer pickup dialog
  const [pickupOpen, setPickupOpen] = useState(false);
  const [pickupRow, setPickupRow] = useState<any | null>(null);

  // Fetch tank
  const { data: tank, isLoading } = useQuery({
    queryKey: ["tank_detail", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("tanks").select("*").eq("id", id!).single();
      if (error) throw error;
      return data;
    },
  });

  // Inventory
  const { data: inventory = [] } = useQuery({
    queryKey: ["tank_detail_inventory", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tank_inventory")
        .select("*, bulls_catalog!tank_inventory_bull_catalog_id_fkey(bull_name, naab_code, company, registration_number), customers!tank_inventory_customer_id_fkey(name)")
        .eq("tank_id", id!)
        .order("canister", { ascending: true })
        .order("sub_canister", { ascending: true })
        .limit(10000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const lastInventoried = useMemo(() => {
    if (!inventory || inventory.length === 0) return null;
    let latest: string | null = null;
    for (const row of inventory) {
      if (row.inventoried_at && (!latest || row.inventoried_at > latest)) {
        latest = row.inventoried_at;
      }
    }
    return latest;
  }, [inventory]);

  // Fills
  const { data: fills = [] } = useQuery({
    queryKey: ["tank_detail_fills", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tank_fills")
        .select("*")
        .eq("tank_id", id!)
        .order("fill_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Movements
  const { data: movements = [] } = useQuery({
    queryKey: ["tank_detail_movements", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tank_movements")
        .select("*, customers(name), projects(name)")
        .eq("tank_id", id!)
        .order("movement_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Transactions
  const { data: transactions = [] } = useQuery({
    queryKey: ["tank_detail_transactions", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_transactions")
        .select("*, bulls_catalog(bull_name), customers(name), projects(name), semen_orders(id, customers!semen_orders_customer_id_fkey(name))")
        .eq("tank_id", id!)
        .order("created_at", { ascending: false })
        .limit(10000);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Customers & projects for movement dialog
  const { data: customers = [] } = useQuery({
    queryKey: ["customers_list", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("id, name").eq("organization_id", orgId!).order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects_list", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("id, name").eq("organization_id", orgId!).order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Active packs query (a tank can have multiple active packs)
  const { data: activePacks } = useQuery({
    queryKey: ["tank_active_packs", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tank_packs")
        .select(`
          id, pack_type, status, packed_at, tracking_number, destination_name,
          tank_pack_projects(projects!tank_pack_projects_project_id_fkey(name))
        `)
        .eq("field_tank_id", id!)
        .in("status", ["packed", "in_field"])
        .order("packed_at", { ascending: false });
      if (error) {
        toast({ title: "Failed to load pack status", description: error.message, variant: "destructive" });
        return [];
      }
      return data ?? [];
    },
  });

  const [inventorySearch, setInventorySearch] = useState("");

  const matchesInventorySearch = (row: any, q: string) => {
    if (!q) return true;
    const needle = q.toLowerCase();
    const haystack = [
      row.bulls_catalog?.bull_name,
      row.bulls_catalog?.naab_code,
      row.bull_code,
      row.custom_bull_name,
    ]
      .filter(Boolean)
      .map((v: string) => v.toLowerCase());
    return haystack.some((s) => s.includes(needle));
  };

  // Grouped inventory by customer for communal tanks
  const isCommunal = tank?.tank_type === "communal_tank";
  const inventoryByCustomer = useMemo(() => {
    if (!isCommunal) return null;
    const map = new Map<string, { name: string; items: any[]; total: number }>();
    for (const inv of inventory) {
      if (!matchesInventorySearch(inv, inventorySearch)) continue;
      const cid = inv.customer_id || "__company__";
      const cname = inv.customers?.name || "Company Owned";
      if (!map.has(cid)) map.set(cid, { name: cname, items: [], total: 0 });
      const group = map.get(cid)!;
      group.items.push(inv);
      group.total += inv.units || 0;
    }
    return Array.from(map.values());
  }, [inventory, isCommunal, inventorySearch]);

  const activeRows = useMemo(
    () => inventory.filter((r: any) => (r.units ?? 0) > 0 && matchesInventorySearch(r, inventorySearch)),
    [inventory, inventorySearch],
  );
  const emptyRows = useMemo(
    () => inventory.filter((r: any) => (r.units ?? 0) === 0 && matchesInventorySearch(r, inventorySearch)),
    [inventory, inventorySearch],
  );
  const totalUnits = activeRows.reduce((s: number, i: any) => s + (i.units || 0), 0);

  const lastFill = fills.length > 0 ? fills[0] : null;
  const fillWarning = lastFill ? differenceInDays(new Date(), parseISO(lastFill.fill_date)) > 90 : false;

  // Edit handlers
  const openEdit = () => {
    if (!tank) return;
    setETankNumber(tank.tank_number || "");
    setETankName(tank.tank_name || "");
    setETankEid(tank.eid || "");
    setETankType(tank.tank_type || "inventory_tank");
    setECustomerId(tank.customer_id || null);
    setENitrogenStatus(tank.nitrogen_status || "wet");
    setELocationStatus(tank.location_status || "here");
    setETankModel(tank.model || "");
    setETankSerial(tank.serial_number || "");
    setETankDesc(tank.description || "");
    setEditOpen(true);
  };

  const handleDeleteTank = async () => {
    if (!tank?.id || !orgId) return;
    setDeletingTank(true);
    try {
      const { error } = await supabase.from("tanks").delete().eq("id", tank.id);
      if (error) throw error;
      toast({ title: "Tank deleted" });
      navigate("/tanks-dashboard?tab=tanks");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setDeletingTank(false);
    }
  };

  const handleEditSave = async () => {
    if (!eTankNumber.trim() || !id) return;
    if (eTankType === "customer_tank" && !eCustomerId) {
      toast({
        title: "Customer required",
        description: "Customer tanks must be assigned to a customer.",
        variant: "destructive",
      });
      return;
    }
    setESaving(true);
    const { error } = await supabase.from("tanks").update({
      tank_number: eTankNumber.trim(),
      tank_name: eTankName.trim() || null,
      eid: eTankEid.trim() || null,
      tank_type: eTankType,
      nitrogen_status: eNitrogenStatus,
      customer_id: eTankType === "customer_tank" ? eCustomerId : null,
      model: eTankModel.trim() || null,
      serial_number: eTankSerial.trim() || null,
      description: eTankDesc.trim() || null,
    }).eq("id", id);
    setESaving(false);
    if (error) {
      toast({ title: "Error", description: error.message || "Could not update tank.", variant: "destructive" });
    } else {
      queryClient.invalidateQueries({ queryKey: ["tank_detail", id] });
      queryClient.invalidateQueries({ queryKey: ["all_tanks"] });
      toast({ title: "Tank updated" });
      setEditOpen(false);
    }
  };

  const handleDryToggle = async () => {
    if (!id || !tank) return;
    const newNitrogen = tank.nitrogen_status === "dry" ? "wet" : "dry";
    const { data, error } = await supabase
      .from("tanks")
      .update({ nitrogen_status: newNitrogen })
      .eq("id", id)
      .select();
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    if (!data || data.length === 0) {
      toast({ title: "Error", description: "Update failed — you may not have permission to change this tank.", variant: "destructive" });
      return;
    }
    toast({ title: newNitrogen === "dry" ? "Tank marked as dry" : "Tank marked as wet" });
    queryClient.invalidateQueries({ queryKey: ["tank_detail", id] });
  };

  // Fill handler
  const handleFillSave = async () => {
    if (!id || !orgId) return;
    setFillSaving(true);
    const { error } = await supabase.from("tank_fills").insert({
      organization_id: orgId,
      tank_id: id,
      fill_date: format(fillDate, "yyyy-MM-dd"),
      filled_by: userId,
      notes: fillNotes.trim() || null,
    });
    setFillSaving(false);
    if (error) {
      toast({ title: "Error", description: "Could not record fill.", variant: "destructive" });
    } else {
      queryClient.invalidateQueries({ queryKey: ["tank_detail_fills", id] });
      toast({ title: "Fill recorded" });
      setFillOpen(false);
      setFillNotes("");
      setFillDate(new Date());
    }
  };

  // Movement handler
  const handleMoveSave = async () => {
    if (!id || !orgId) return;
    setMoveSaving(true);
    const custId = moveCustomerId === "none" ? null : moveCustomerId;
    const projId = moveProjectId === "none" ? null : moveProjectId;
    // Derive location from movement type — picked_up/shipped_out = out, returned/received_back = here
    const locationAfter = (moveType === "picked_up" || moveType === "shipped_out") ? "out" : "here";
    const { error: moveErr } = await supabase.from("tank_movements").insert({
      organization_id: orgId,
      tank_id: id,
      movement_type: moveType,
      movement_date: format(moveDate, "yyyy-MM-dd"),
      location_status_after: locationAfter,
      customer_id: custId,
      project_id: projId,
      performed_by: userId,
      notes: moveNotes.trim() || null,
    });
    if (moveErr) {
      setMoveSaving(false);
      toast({ title: "Error", description: "Could not record movement.", variant: "destructive" });
      return;
    }
    // Update the tank's location status to match the movement
    await supabase.from("tanks").update({ location_status: locationAfter }).eq("id", id);
    setMoveSaving(false);
    queryClient.invalidateQueries({ queryKey: ["tank_detail", id] });
    queryClient.invalidateQueries({ queryKey: ["tank_detail_movements", id] });
    queryClient.invalidateQueries({ queryKey: ["all_tanks"] });
    toast({ title: locationAfter === "out" ? "Tank marked as out" : "Tank marked as returned" });
    setMoveOpen(false);
    setMoveNotes("");
    setMoveType("picked_up");
    setMoveDate(new Date());
    setMoveCustomerId("none");
    setMoveProjectId("none");
  };

  // Manual add handler
  const handleManualAdd = async () => {
    if (!orgId || !tank) return;

    // Validate inline, not after the DB rejects us
    const errs: Record<string, string> = {};
    if (!manualBullName.trim()) {
      errs.bullName = "Required";
    } else if (!manualBullCatalogId) {
      // Bull text was typed but not linked to the catalog. The database now
      // requires every tank_inventory row to have a real bull_catalog_id.
      errs.bullName = "Pick from dropdown or use 'Add custom bull'";
    }
    if (!manualBullCode.trim()) errs.bullCode = "Required (NAAB or your own code)";
    if (manualUnits <= 0) errs.units = "Must be > 0";

    // Determine effective customer_id and storage_type
    const effectiveCustomerId = manualCustomerId || tank.customer_id || null;
    const storageType: "customer" | "communal" | "inventory" = effectiveCustomerId
      ? (tank.customer_id ? "customer" : "communal")
      : "inventory";

    // Owner is required when we're writing company inventory (no customer attribution)
    if (storageType === "inventory" && !manualOwner) {
      errs.owner = "Required — Select or CATL";
    }

    if (Object.keys(errs).length > 0) {
      setManualErrors(errs);
      return;
    }
    setManualErrors({});

    setManualSubmitting(true);
    try {
      const isCatalogBull = !!manualBullCatalogId;

      const insertRow: any = {
        tank_id: tank.id,
        customer_id: effectiveCustomerId,
        bull_catalog_id: isCatalogBull ? manualBullCatalogId : null,
        custom_bull_name: isCatalogBull ? null : manualBullName.trim(),
        bull_code: manualBullCode.trim(),
        units: manualUnits,
        canister: manualCanister.trim() || "1",
        organization_id: orgId,
        storage_type: storageType,
        owner: storageType === "inventory" ? manualOwner : null,
        source_type: "unknown",
        notes: manualNotes.trim() || null,
      };

      const { error: invErr } = await supabase
        .from("tank_inventory")
        .insert(insertRow)
        .select()
        .single();
      if (invErr) throw invErr;

      toast({ title: "Bull added to inventory" });
      setShowManualAdd(false);
      setManualBullName("");
      setManualBullCatalogId(null);
      setManualBullCode("");
      setManualUnits(0);
      setManualCanister("");
      setManualNotes("");
      setManualCustomerId(null);
      setManualOwner("");
      setManualErrors({});
      queryClient.invalidateQueries({ queryKey: ["tank_detail_inventory", id] });
      queryClient.invalidateQueries({ queryKey: ["tank_detail_transactions", id] });
      queryClient.invalidateQueries({ queryKey: ["tank_map"] });
    } catch (err: any) {
      setManualErrors({ submit: err.message || "Failed to add bull" });
      toast({ title: "Failed to add bull", description: err.message, variant: "destructive" });
    } finally {
      setManualSubmitting(false);
    }
  };

  const tankLabel = tank?.tank_name ? `${tank.tank_name} — ${tank.tank_number}` : tank?.tank_number || "Tank";

  if (isLoading) {
    return <div className="min-h-screen"><Navbar /><main className="container mx-auto px-4 py-8"><p className="text-muted-foreground">Loading…</p></main></div>;
  }
  if (!tank) {
    return <div className="min-h-screen"><Navbar /><main className="container mx-auto px-4 py-8"><p className="text-muted-foreground">Tank not found.</p></main></div>;
  }

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="container mx-auto px-4 py-8 space-y-8">
        {/* Breadcrumb */}
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem><BreadcrumbLink onClick={() => navigate("/tanks-dashboard?tab=tanks")} className="cursor-pointer">Tanks</BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbPage>{tankLabel}</BreadcrumbPage></BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="gap-1.5 mt-1">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            <div>
              <h1 className="text-2xl font-bold font-display tracking-tight">{tankLabel}</h1>
              <div className="flex flex-wrap gap-2 mt-1 items-center">
                <Badge variant="outline" className={TYPE_BADGE[tank.tank_type] || "bg-muted text-muted-foreground border-border"}>
                  {TYPE_LABELS[tank.tank_type] || tank.tank_type}
                </Badge>
                <Badge variant="outline" className={
                  tank.nitrogen_status === "wet" ? "bg-green-600/20 text-green-400 border-green-600/30" :
                  tank.nitrogen_status === "dry" ? "bg-yellow-600/20 text-yellow-400 border-yellow-600/30" :
                  "bg-muted text-muted-foreground border-border"
                }>
                  {tank.nitrogen_status || "unknown"}
                </Badge>
                <Badge variant="outline" className={
                  tank.location_status === "here" ? "bg-green-600/20 text-green-400 border-green-600/30" :
                  "bg-blue-600/20 text-blue-400 border-blue-600/30"
                }>
                  {tank.location_status === "here" ? "in shop" : "out with customer"}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-xs text-muted-foreground">
                {tank.model && <span>Model: {tank.model}</span>}
                {tank.serial_number && <span>S/N: {tank.serial_number}</span>}
                {tank.eid && <span>EID: {tank.eid}</span>}
                {lastInventoried && (
                  <span>Last Inventoried: {format(parseISO(lastInventoried), "MMM d, yyyy")}</span>
                )}
                {!lastInventoried && inventory.length > 0 && (
                  <span className="text-amber-400">Never inventoried</span>
                )}
              </div>
              {tank.nitrogen_status === "dry" && (
                <div className="mt-2 px-3 py-1.5 rounded-md bg-yellow-500/10 border border-yellow-500/30 text-yellow-500 text-xs font-medium">
                  This tank is currently dry — record a fill to mark it wet
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={openEdit} className="gap-1.5">
              <Pencil className="h-4 w-4" /> Edit Tank
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" className="gap-1.5">
                  <Trash2 className="h-4 w-4" /> Delete Tank
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Tank</AlertDialogTitle>
                  <AlertDialogDescription>
                    {inventory.length > 0
                      ? `This tank has ${inventory.length} inventory row${inventory.length > 1 ? "s" : ""}. Deleting it will remove the tank record but inventory rows may remain orphaned. Delete anyway?`
                      : "Delete this tank? This cannot be undone."}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDeleteTank}
                    disabled={deletingTank}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {deletingTank && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            {tank.nitrogen_status === "dry" ? (
              <Button size="sm" onClick={() => { setFillDate(new Date()); setFillNotes(""); setFillOpen(true); }} className="gap-1.5">
                <Droplets className="h-4 w-4" /> Record Fill
              </Button>
            ) : (
              <>
                <Button variant="outline" size="sm" onClick={() => handleDryToggle()} className="gap-1.5"><Sun className="h-4 w-4" /> Dry Off</Button>
                <Button variant="outline" size="sm" onClick={() => navigate(`/tanks/${id}/reinventory`)} className="gap-1.5"><RotateCcw className="h-4 w-4" /> Re-inventory</Button>
                <Button variant="outline" size="sm" onClick={() => { setFillDate(new Date()); setFillNotes(""); setFillOpen(true); }} className="gap-1.5"><Droplets className="h-4 w-4" /> Record Fill</Button>
              </>
            )}
            {tank.location_status === "here" ? (
              <Button variant="outline" size="sm" onClick={() => {
                setMoveDate(new Date());
                setMoveNotes("");
                setMoveType("picked_up");
                setMoveCustomerId(tank.customer_id || "none");
                setMoveProjectId("none");
                setMoveOpen(true);
              }} className="gap-1.5">
                <Truck className="h-4 w-4" /> Mark Out
              </Button>
            ) : (
              <Button size="sm" onClick={() => {
                setMoveDate(new Date());
                setMoveNotes("");
                setMoveType("returned");
                setMoveCustomerId(tank.customer_id || "none");
                setMoveProjectId("none");
                setMoveOpen(true);
              }} className="gap-1.5">
                <ArrowLeft className="h-4 w-4" /> Mark In
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setShowManualAdd(true)} className="gap-1.5"><Plus className="h-4 w-4" /> Add Bull to Inventory</Button>
          </div>
        </div>

        {/* ───── Out With Banner(s) ───── */}
        {activePacks && activePacks.length > 0 && (
          <div className="space-y-2">
            {activePacks.map((pack: any) => (
              <div key={pack.id} className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Package className="h-5 w-5 text-amber-400 shrink-0" />
                  <div>
                    <p className="font-semibold text-amber-300">
                      {pack.pack_type === "shipment"
                        ? `Out with ${pack.destination_name || "shipment"}`
                        : `Out for ${(pack.tank_pack_projects?.[0] as any)?.projects?.name || pack.destination_name || "project"}`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      <span className="capitalize">{pack.pack_type}</span> · {pack.status === "in_field" ? "In Field" : "Packed"} · Packed on {format(new Date(pack.packed_at), "MMM d, yyyy")}
                      {pack.tracking_number && ` · Tracking: ${pack.tracking_number}`}
                    </p>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => navigate(`/pack/${pack.id}`)}>View Pack</Button>
              </div>
            ))}
          </div>
        )}

        {/* ───── Inventory ───── */}
        <div>
          <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
            <h2 className="text-lg font-semibold">Inventory ({totalUnits} units)</h2>
            {!isCommunal && activeRows.length > 0 && (
              <ExportMenu
                config={{
                  title: `Tank Inventory — ${tankLabel}`,
                  subtitle: `${activeRows.length} ${activeRows.length === 1 ? "item" : "items"} • ${totalUnits} units`,
                  filenameBase: `tank_${(tank?.tank_number || "inventory").replace(/[^a-z0-9]+/gi, "_").toLowerCase()}_inventory`,
                  columns: [
                    { label: "Canister", value: (r: any) => r.canister },
                    { label: "Sub-can", value: (r: any) => r.sub_canister || "" },
                    { label: "Bull", value: (r: any) => getBullDisplayName(r) },
                    { label: "Bull Code", value: (r: any) => r.bull_code || "" },
                    { label: "Company", value: (r: any) => r.bulls_catalog?.company || "" },
                    { label: "Owner", value: (r: any) => r.owner || r.customers?.name || "" },
                    { label: "Units", value: (r: any) => r.units },
                    { label: "Storage Type", value: (r: any) => r.storage_type || "" },
                  ],
                } as ExportConfig<any>}
                rows={activeRows}
              />
            )}
          </div>

          <div className="mb-3 relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search bulls in this tank..."
              value={inventorySearch}
              onChange={(e) => setInventorySearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {inventorySearch && activeRows.length === 0 && (!isCommunal || (inventoryByCustomer?.length ?? 0) === 0) && (
            <p className="text-sm text-muted-foreground italic mb-3">
              No bulls matching "{inventorySearch}" in this tank.
            </p>
          )}

          {isCommunal && inventoryByCustomer ? (
            inventoryByCustomer.map((group, gi) => (
              <div key={gi} className="mb-4">
                <h3 className="text-sm font-semibold mb-1">{group.name} — {group.total} units</h3>
                <div className="rounded-lg border border-border/50 overflow-hidden mb-2">
                  <Table>
                    <TableHeader><TableRow className="bg-muted/10">
                      <TableHead>Canister</TableHead><TableHead>Sub-can</TableHead><TableHead>Bull</TableHead><TableHead>Bull Code</TableHead><TableHead>Company</TableHead><TableHead className="text-right">Units</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {group.items.map((inv: any) => (
                        <TableRow key={inv.id}>
                          <TableCell>{inv.canister}</TableCell>
                          <TableCell>{inv.sub_canister || "—"}</TableCell>
                          <TableCell>
                            <span className="inline-flex items-center gap-1">
                              <span>{getBullDisplayName(inv)}</span>
                              {inv.bull_catalog_id && (
                                <button onClick={(e) => { e.stopPropagation(); setEditBullId(inv.bull_catalog_id); }} className="inline-flex items-center text-muted-foreground hover:text-foreground transition-colors" title="Edit bull info">
                                  <Pencil className="h-3 w-3" />
                                </button>
                              )}
                            </span>
                            {inv.item_type === "embryo" && (
                              <Badge variant="outline" className="ml-2 bg-purple-500/15 text-purple-400 border-purple-500/30 text-xs">Embryo</Badge>
                            )}
                          </TableCell>
                          <TableCell>{inv.bull_code || "—"}</TableCell>
                          <TableCell>{inv.bulls_catalog?.company || "—"}</TableCell>
                          <TableCell className="text-right">{inv.units}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ))
          ) : (
            <>
              <div className="rounded-lg border border-border/50 overflow-hidden">
                <Table>
                  <TableHeader><TableRow className="bg-muted/10">
                    <TableHead>Canister</TableHead><TableHead>Sub-can</TableHead><TableHead>Bull</TableHead><TableHead>Bull Code</TableHead><TableHead>Company</TableHead><TableHead>Owner</TableHead><TableHead className="text-right">Units</TableHead><TableHead className="w-[60px]"></TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {activeRows.length === 0 ? (
                      <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No active inventory</TableCell></TableRow>
                    ) : (
                      <>
                        {activeRows.map((inv: any) => (
                          <TableRow key={inv.id}>
                            <TableCell>{inv.canister}</TableCell>
                            <TableCell>{inv.sub_canister || "—"}</TableCell>
                            <TableCell>
                              <span className="inline-flex items-center gap-1">
                                <span>{getBullDisplayName(inv)}</span>
                                {inv.bull_catalog_id && (
                                  <button onClick={(e) => { e.stopPropagation(); setEditBullId(inv.bull_catalog_id); }} className="inline-flex items-center text-muted-foreground hover:text-foreground transition-colors" title="Edit bull info">
                                    <Pencil className="h-3 w-3" />
                                  </button>
                                )}
                              </span>
                              {inv.item_type === "embryo" && (
                                <Badge variant="outline" className="ml-2 bg-purple-500/15 text-purple-400 border-purple-500/30 text-xs">Embryo</Badge>
                              )}
                            </TableCell>
                            <TableCell>{inv.bull_code || "—"}</TableCell>
                            <TableCell>{inv.bulls_catalog?.company || "—"}</TableCell>
                            <TableCell>{inv.owner || inv.customers?.name || "—"}</TableCell>
                            <TableCell className="text-right">{inv.units}</TableCell>
                            <TableCell className="text-right">
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
                                      onClick={() => { setTransferRow(inv); setTransferOpen(true); }}
                                    >
                                      <ArrowRightLeft className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Transfer to another tank</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                              {inv.customer_id && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-amber-500 hover:text-amber-600"
                                        onClick={() => { setPickupRow(inv); setPickupOpen(true); }}
                                      >
                                        <PackageOpen className="h-4 w-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Customer pickup</TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="bg-muted/20 font-semibold">
                          <TableCell colSpan={6}>Total</TableCell>
                          <TableCell className="text-right">{totalUnits}</TableCell>
                          <TableCell></TableCell>
                        </TableRow>
                      </>
                    )}
                  </TableBody>
                </Table>
              </div>

              {emptyRows.length > 0 && (
                <details className="mt-4">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground py-2">
                    Empty / Previously Held ({emptyRows.length})
                  </summary>
                  <div className="mt-2 opacity-60">
                    <div className="rounded-lg border border-border/50 overflow-hidden">
                      <Table>
                        <TableHeader><TableRow className="bg-muted/10">
                          <TableHead>Canister</TableHead><TableHead>Sub-can</TableHead><TableHead>Bull</TableHead><TableHead>Bull Code</TableHead><TableHead>Company</TableHead><TableHead>Owner</TableHead><TableHead className="text-right">Units</TableHead>
                        </TableRow></TableHeader>
                        <TableBody>
                          {emptyRows.map((inv: any) => (
                            <TableRow key={inv.id}>
                              <TableCell>{inv.canister}</TableCell>
                              <TableCell>{inv.sub_canister || "—"}</TableCell>
                              <TableCell>
                                <span className="inline-flex items-center gap-1">
                                  <span>{getBullDisplayName(inv)}</span>
                                  {inv.bull_catalog_id && (
                                    <button onClick={(e) => { e.stopPropagation(); setEditBullId(inv.bull_catalog_id); }} className="inline-flex items-center text-muted-foreground hover:text-foreground transition-colors" title="Edit bull info">
                                      <Pencil className="h-3 w-3" />
                                    </button>
                                  )}
                                </span>
                                {inv.item_type === "embryo" && (
                                  <Badge variant="outline" className="ml-2 bg-purple-500/15 text-purple-400 border-purple-500/30 text-xs">Embryo</Badge>
                                )}
                              </TableCell>
                              <TableCell>{inv.bull_code || "—"}</TableCell>
                              <TableCell>{inv.bulls_catalog?.company || "—"}</TableCell>
                              <TableCell>{inv.owner || inv.customers?.name || "—"}</TableCell>
                              <TableCell className="text-right">{inv.units}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </details>
              )}
            </>
          )}
        </div>

        {/* ───── Fill History (collapsible) ───── */}
        <div>
          <button
            type="button"
            onClick={() => setFillHistoryOpen((o) => !o)}
            className="flex items-center gap-2 text-lg font-semibold mb-3 hover:text-primary transition-colors"
          >
            {fillHistoryOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            Fill History
            <span className="text-sm text-muted-foreground font-normal">({fills.length})</span>
          </button>
          {fillHistoryOpen && (
            <div className="rounded-lg border border-border/50 overflow-hidden">
              <Table>
                <TableHeader><TableRow className="bg-muted/10">
                  <TableHead>Fill Date</TableHead><TableHead>Filled By</TableHead><TableHead>Notes</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {fills.length === 0 ? (
                    <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground">No fills recorded</TableCell></TableRow>
                  ) : fills.map((f: any, i: number) => (
                    <TableRow key={f.id} className={i === 0 && fillWarning ? "bg-amber-500/10" : ""}>
                      <TableCell className={cn("whitespace-nowrap", i === 0 && fillWarning && "text-orange-400")}>
                        {format(parseISO(f.fill_date), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">{f.filled_by ? f.filled_by.substring(0, 8) + "…" : "—"}</TableCell>
                      <TableCell>{f.notes || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        {/* ───── Movement History ───── */}
        <div>
          <h2 className="text-lg font-semibold mb-3">Movement History</h2>
          <div className="rounded-lg border border-border/50 overflow-hidden">
            <Table>
              <TableHeader><TableRow className="bg-muted/10">
                <TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead>Location After</TableHead><TableHead>Customer</TableHead><TableHead>Project</TableHead><TableHead>Notes</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {movements.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No movements recorded</TableCell></TableRow>
                ) : movements.map((m: any) => (
                  <TableRow key={m.id}>
                    <TableCell className="whitespace-nowrap">{format(parseISO(m.movement_date), "MMM d, yyyy")}</TableCell>
                    <TableCell><Badge variant="outline" className={MOVEMENT_BADGE[m.movement_type] || "bg-muted text-muted-foreground border-border"}>{m.movement_type.replace(/_/g, " ")}</Badge></TableCell>
                    <TableCell><Badge variant="outline" className={m.location_status_after === "here" ? "bg-green-600/20 text-green-400 border-green-600/30" : "bg-blue-600/20 text-blue-400 border-blue-600/30"}>{m.location_status_after === "here" ? "in shop" : "out"}</Badge></TableCell>
                    <TableCell>{m.customers?.name || "—"}</TableCell>
                    <TableCell>{m.projects?.name || "—"}</TableCell>
                    <TableCell>{m.notes || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* ───── Transaction History ───── */}
        <div>
          <h2 className="text-lg font-semibold mb-3">Transaction History</h2>
          <div className="rounded-lg border border-border/50 overflow-hidden">
            <Table>
              <TableHeader><TableRow className="bg-muted/10">
                <TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead>Bull</TableHead><TableHead className="text-right">Units</TableHead><TableHead>Customer</TableHead><TableHead>Project/Order</TableHead><TableHead>Reason</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {transactions.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No transactions recorded</TableCell></TableRow>
                ) : transactions.map((t: any) => {
                  const bullName = getBullDisplayLabel(t);
                  const projOrder = t.projects?.name || t.semen_orders?.customers?.name || "—";
                  return (
                    <TableRow key={t.id}>
                      <TableCell className="whitespace-nowrap">{format(parseISO(t.created_at), "MMM d, yyyy")}</TableCell>
                      <TableCell><Badge variant="outline" className={TXN_BADGE[t.transaction_type] || "bg-muted text-muted-foreground border-border"}>{t.transaction_type.replace(/_/g, " ")}</Badge></TableCell>
                      <TableCell>{bullName}</TableCell>
                      <TableCell className={cn("text-right font-medium", t.units_change < 0 ? "text-destructive" : "text-green-400")}>
                        {t.units_change > 0 ? `+${t.units_change}` : t.units_change}
                      </TableCell>
                      <TableCell>{t.customers?.name || "—"}</TableCell>
                      <TableCell>{projOrder}</TableCell>
                      <TableCell className="text-xs">{t.reason || "—"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* ───── Pack History (shipper tanks) ───── */}
        {tank.tank_type === "shipper" && <PackHistorySection tankId={id!} navigate={navigate} />}
      </main>

      {/* ───── Edit Tank Dialog ───── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Tank</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5"><Label>Tank Number *</Label><Input value={eTankNumber} onChange={(e) => setETankNumber(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Tank Name</Label><Input value={eTankName} onChange={(e) => setETankName(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>EID</Label><Input value={eTankEid} onChange={(e) => setETankEid(e.target.value)} /></div>
            <div className="space-y-1.5">
              <Label>Tank Type</Label>
              <Select value={eTankType} onValueChange={setETankType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TANK_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {eTankType === "customer_tank" && (
              <div className="space-y-1.5">
                <Label>Customer *</Label>
                <Select value={eCustomerId ?? ""} onValueChange={(v) => setECustomerId(v || null)}>
                  <SelectTrigger><SelectValue placeholder="Select customer…" /></SelectTrigger>
                  <SelectContent>
                    {eCustomerOptions.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex items-center justify-between gap-4">
              <Label className="text-sm">Nitrogen</Label>
              <Select value={eNitrogenStatus} onValueChange={setENitrogenStatus}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {NITROGEN_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between gap-4">
              <Label className="text-sm text-muted-foreground">Location</Label>
              <span className="text-sm">{eLocationStatus === "here" ? "In Shop" : "Out with Customer"}</span>
            </div>
            <div className="space-y-1.5"><Label>Model</Label><Input value={eTankModel} onChange={(e) => setETankModel(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Serial Number</Label><Input value={eTankSerial} onChange={(e) => setETankSerial(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Description</Label><Textarea value={eTankDesc} onChange={(e) => setETankDesc(e.target.value)} rows={2} /></div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
              <Button onClick={handleEditSave} disabled={eSaving || !eTankNumber.trim()}>{eSaving ? "Saving…" : "Save"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ───── Record Fill Dialog ───── */}
      <Dialog open={fillOpen} onOpenChange={setFillOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Record Fill</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Fill Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !fillDate && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {fillDate ? format(fillDate, "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={fillDate} onSelect={(d) => d && setFillDate(d)} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1.5"><Label>Notes</Label><Textarea value={fillNotes} onChange={(e) => setFillNotes(e.target.value)} rows={2} /></div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setFillOpen(false)}>Cancel</Button>
              <Button onClick={handleFillSave} disabled={fillSaving}>{fillSaving ? "Saving…" : "Save"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ───── Record Movement Dialog ───── */}
      <Dialog open={moveOpen} onOpenChange={setMoveOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{moveType === "picked_up" || moveType === "shipped_out" ? "Mark Tank Out" : "Mark Tank In"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Movement Type</Label>
              <Select value={moveType} onValueChange={setMoveType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="picked_up">Picked Up</SelectItem>
                  <SelectItem value="returned">Returned</SelectItem>
                  <SelectItem value="shipped_out">Shipped Out</SelectItem>
                  <SelectItem value="received_back">Received Back</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !moveDate && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {moveDate ? format(moveDate, "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={moveDate} onSelect={(d) => d && setMoveDate(d)} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1.5">
              <Label>Customer</Label>
              <Select value={moveCustomerId} onValueChange={setMoveCustomerId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {customers.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Project</Label>
              <Select value={moveProjectId} onValueChange={setMoveProjectId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {projects.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Notes</Label><Textarea value={moveNotes} onChange={(e) => setMoveNotes(e.target.value)} rows={2} /></div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setMoveOpen(false)}>Cancel</Button>
              <Button onClick={handleMoveSave} disabled={moveSaving}>{moveSaving ? "Saving…" : "Save"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Manual Add Dialog */}
      <Dialog open={showManualAdd} onOpenChange={(o) => { setShowManualAdd(o); if (!o) setManualErrors({}); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Bull to {tankLabel}</DialogTitle>
            <DialogDescription>Manually add semen that's already in this tank but not in the system.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {/* Customer — leave the picker in place for customer tanks or communal attribution */}
            <div className="grid grid-cols-[120px_1fr] gap-3 items-center">
              <Label className="text-right">Customer</Label>
              {orgId ? (
                <CustomerPicker value={manualCustomerId} onChange={setManualCustomerId} orgId={orgId} />
              ) : (
                <span className="text-sm text-muted-foreground">Loading...</span>
              )}
            </div>

            {/* Owner toggle — only visible when this will become a company inventory row */}
            {!tank?.customer_id && !manualCustomerId && (
              <div className="grid grid-cols-[120px_1fr] gap-3 items-start">
                <Label className="text-right pt-2">Owner *</Label>
                <div>
                  <Select value={manualOwner} onValueChange={(v) => setManualOwner(v as "Select" | "CATL")}>
                    <SelectTrigger className={cn(manualErrors.owner && "border-destructive")}>
                      <SelectValue placeholder="Select or CATL" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Select">Select</SelectItem>
                      <SelectItem value="CATL">CATL</SelectItem>
                    </SelectContent>
                  </Select>
                  {manualErrors.owner && <p className="text-xs text-destructive mt-1">{manualErrors.owner}</p>}
                </div>
              </div>
            )}

            {/* Bull picker (searchable catalog with NAAB auto-fill) */}
            <div className="grid grid-cols-[120px_1fr] gap-3 items-start">
              <Label className="text-right pt-2">Bull *</Label>
              <div>
                <BullCombobox
                  value={manualBullName}
                  catalogId={manualBullCatalogId}
                  onChange={(name, catId, naab) => {
                    setManualBullName(name);
                    setManualBullCatalogId(catId);
                    if (catId && naab) {
                      setManualBullCode(naab);
                    }
                  }}
                />
                {manualErrors.bullName && <p className="text-xs text-destructive mt-1">{manualErrors.bullName}</p>}
              </div>
            </div>

            {/* Bull code — required, auto-fills from picker when catalog bull chosen */}
            <div className="grid grid-cols-[120px_1fr] gap-3 items-start">
              <Label className="text-right pt-2">Bull Code *</Label>
              <div>
                <Input
                  value={manualBullCode}
                  onChange={(e) => setManualBullCode(e.target.value)}
                  placeholder="NAAB or custom code"
                  className={cn(manualErrors.bullCode && "border-destructive")}
                />
                {manualErrors.bullCode && <p className="text-xs text-destructive mt-1">{manualErrors.bullCode}</p>}
              </div>
            </div>

            {/* Units */}
            <div className="grid grid-cols-[120px_1fr] gap-3 items-start">
              <Label className="text-right pt-2">Units *</Label>
              <div>
                <Input
                  type="number"
                  min={1}
                  value={manualUnits || ""}
                  onChange={(e) => setManualUnits(parseInt(e.target.value) || 0)}
                  className={cn(manualErrors.units && "border-destructive")}
                />
                {manualErrors.units && <p className="text-xs text-destructive mt-1">{manualErrors.units}</p>}
              </div>
            </div>

            {/* Canister */}
            <div className="grid grid-cols-[120px_1fr] gap-3 items-center">
              <Label className="text-right">Canister</Label>
              <Input value={manualCanister} onChange={(e) => setManualCanister(e.target.value)} placeholder="optional (defaults to 1)" />
            </div>

            {/* Notes */}
            <div className="grid grid-cols-[120px_1fr] gap-3 items-start">
              <Label className="text-right pt-2">Notes</Label>
              <Textarea value={manualNotes} onChange={(e) => setManualNotes(e.target.value)} rows={2} />
            </div>

            {/* Submit-level error from the DB or elsewhere */}
            {manualErrors.submit && (
              <div className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded p-2">
                {manualErrors.submit}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowManualAdd(false); setManualErrors({}); }}>Cancel</Button>
            <Button onClick={handleManualAdd} disabled={manualSubmitting}>
              {manualSubmitting ? "Adding..." : "Add to Inventory"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TransferDialog
        open={transferOpen}
        onOpenChange={setTransferOpen}
        sourceRow={transferRow}
        sourceTankName={tank?.tank_name || tank?.tank_number || "Tank"}
        orgId={orgId}
        userId={userId}
        tankId={id!}
      />

      <Dialog open={pickupOpen} onOpenChange={setPickupOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Customer Pickup</DialogTitle>
            <DialogDescription>
              {pickupRow?.customers?.name || pickupRow?.owner || "Customer"} is picking up semen
            </DialogDescription>
          </DialogHeader>
          {pickupRow && (
            <PickupForm
              row={pickupRow}
              tankName={tank?.tank_name || tank?.tank_number || "Tank"}
              orgId={orgId}
              userId={userId}
              tankId={id!}
              onCancel={() => setPickupOpen(false)}
              onSuccess={() => {
                setPickupOpen(false);
                queryClient.invalidateQueries({ queryKey: ["tank_detail_inventory", id] });
                queryClient.invalidateQueries({ queryKey: ["tank_detail_transactions", id] });
                queryClient.invalidateQueries({ queryKey: ["tank_inventory_all"] });
                queryClient.invalidateQueries({ queryKey: ["customer_inventory"] });
                queryClient.invalidateQueries({ queryKey: ["tank_map"] });
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {editBullId && (
        <QuickBullEditDialog
          open={!!editBullId}
          onOpenChange={(open) => { if (!open) setEditBullId(null); }}
          bullCatalogId={editBullId}
        />
      )}
      <AppFooter />
    </div>
  );
};

export default TankDetail;
