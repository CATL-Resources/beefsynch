import { useState, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Package, Archive, Dna, Plus, FileText, Droplets, ChevronDown, ChevronRight, Truck, Sun, Mail, Pencil, Trash2, ArrowRightLeft } from "lucide-react";
import { format, differenceInDays } from "date-fns";

import Navbar from "@/components/Navbar";
import AppFooter from "@/components/AppFooter";
import StatCard from "@/components/StatCard";
import BullCombobox from "@/components/BullCombobox";
import NewOrderDialog from "@/components/NewOrderDialog";
import { supabase } from "@/integrations/supabase/client";
import { generateCustomerInventoryPdf } from "@/lib/generateCustomerInventoryPdf";
import { getBullDisplayName } from "@/lib/bullDisplay";
import { useOrgRole } from "@/hooks/useOrgRole";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { cn } from "@/lib/utils";
import { getBadgeClass } from "@/lib/badgeStyles";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import TransferDialog from "@/components/inventory/TransferDialog";

const FULFILLMENT_COLORS: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  ordered: "bg-blue-600/20 text-blue-400",
  partially_fulfilled: "bg-yellow-600/20 text-yellow-400",
  shipped: "bg-purple-600/20 text-purple-400",
  fulfilled: "bg-green-600/20 text-green-400",
};

const BILLING_COLORS: Record<string, string> = {
  unbilled: "bg-muted text-muted-foreground",
  billed: "bg-blue-600/20 text-blue-400",
  paid: "bg-green-600/20 text-green-400",
};

const CustomerDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { orgId } = useOrgRole();
  const queryClient = useQueryClient();

  // Edit customer dialog
  const [editOpen, setEditOpen] = useState(false);
  const [newOrderOpen, setNewOrderOpen] = useState(false);
  const [deletingCustomer, setDeletingCustomer] = useState(false);
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

  // Add tank dialog
  const [tankDialogOpen, setTankDialogOpen] = useState(false);
  const [tankNumber, setTankNumber] = useState("");
  const [tankName, setTankName] = useState("");
  const [tankEid, setTankEid] = useState("");
  const [tankType, setTankType] = useState("customer_tank");
  const [tankStatus, setTankStatus] = useState("wet");
  const [tankModel, setTankModel] = useState("");
  const [tankSerial, setTankSerial] = useState("");
  const [tankDesc, setTankDesc] = useState("");
  const [tankSaving, setTankSaving] = useState(false);

  // Add semen dialog
  const [semenDialogOpen, setSemenDialogOpen] = useState(false);
  const [semenTankId, setSemenTankId] = useState<string | null>(null);
  const [semenCanister, setSemenCanister] = useState("");
  const [semenSubCanister, setSemenSubCanister] = useState("");
  const [semenBullName, setSemenBullName] = useState("");
  const [semenBullCatalogId, setSemenBullCatalogId] = useState<string | null>(null);
  const [semenBullCode, setSemenBullCode] = useState("");
  const [semenUnits, setSemenUnits] = useState("");
  const [semenStorageType, setSemenStorageType] = useState("customer");
  const [semenNotes, setSemenNotes] = useState("");
  const [semenSaving, setSemenSaving] = useState(false);

  // Mark Out / Mark In movement dialog
  const [custMoveOpen, setCustMoveOpen] = useState(false);
  const [custMoveTankId, setCustMoveTankId] = useState("");
  const [custMoveTankLabel, setCustMoveTankLabel] = useState("");
  const [custMoveType, setCustMoveType] = useState<"picked_up" | "returned">("picked_up");
  const [custMoveNotes, setCustMoveNotes] = useState("");
  const [custMoveSaving, setCustMoveSaving] = useState(false);

  // Expandable sections
  const [expandedSections, setExpandedSections] = useState<Record<string, Set<string>>>({});
  const [tanksOpen, setTanksOpen] = useState(false);

  // Transfer dialog
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferSource, setTransferSource] = useState<any>(null);
  const [transferSourceTank, setTransferSourceTank] = useState<any>(null);

  const { data: userId } = useQuery({
    queryKey: ["auth_user_id"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      return user?.id ?? null;
    },
  });

  const toggleSection = (tankId: string, section: string) => {
    setExpandedSections(prev => {
      const tankSections = new Set(prev[tankId] || []);
      if (tankSections.has(section)) tankSections.delete(section);
      else tankSections.add(section);
      return { ...prev, [tankId]: tankSections };
    });
  };

  const isSectionOpen = (tankId: string, section: string) =>
    expandedSections[tankId]?.has(section) ?? false;

  // Fetch customer
  const { data: customer, isLoading } = useQuery({
    queryKey: ["customer", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Fetch tanks owned by this customer
  const { data: ownedTanks = [] } = useQuery({
    queryKey: ["customer_tanks", id, orgId],
    enabled: !!id && !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tanks")
        .select("*")
        .eq("organization_id", orgId!)
        .eq("customer_id", id!);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Fetch inventory rows for this customer (to find communal tanks)
  // NOTE: This query is needed to identify tanks that a customer has semen in (communal tanks).
  // allInventory (below) fetches from all customer tanks but only for rows with this customer's items,
  // so we need this to first discover which communal tank IDs belong to this customer.
  const { data: customerInventory = [] } = useQuery({
    queryKey: ["customer_inventory", id, orgId],
    enabled: !!id && !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tank_inventory")
        .select("*, bulls_catalog!tank_inventory_bull_catalog_id_fkey(bull_name, company, registration_number)")
        .eq("organization_id", orgId!)
        .eq("customer_id", id!)
        .limit(10000);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Find communal tank IDs
  const communalTankIds = useMemo(() => {
    const ownedSet = new Set(ownedTanks.map((t: any) => t.id));
    const extra = new Set<string>();
    for (const inv of customerInventory) {
      if (!ownedSet.has(inv.tank_id)) extra.add(inv.tank_id);
    }
    return Array.from(extra);
  }, [ownedTanks, customerInventory]);

  // Fetch communal tanks
  const { data: communalTanks = [] } = useQuery({
    queryKey: ["communal_tanks", communalTankIds],
    enabled: communalTankIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tanks")
        .select("*")
        .in("id", communalTankIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  // All tanks combined
  const allTanks = useMemo(() => {
    const map = new Map<string, any>();
    for (const t of ownedTanks) map.set(t.id, t);
    for (const t of communalTanks) map.set(t.id, t);
    return Array.from(map.values());
  }, [ownedTanks, communalTanks]);

  const allTankIds = useMemo(() => allTanks.map((t: any) => t.id), [allTanks]);

  const { data: allInventory = [] } = useQuery({
    queryKey: ["tank_inventory_all", allTankIds, id],
    enabled: allTankIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tank_inventory")
        .select("*, bulls_catalog!tank_inventory_bull_catalog_id_fkey(bull_name, company, registration_number)")
        .in("tank_id", allTankIds)
        .eq("owner_customer_id", id)
        .limit(10000);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Fetch fill history for all customer tanks
  const { data: allFills = [] } = useQuery({
    queryKey: ["customer_tank_fills", id, orgId, allTankIds],
    enabled: !!id && !!orgId && allTankIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tank_fills")
        .select("*")
        .eq("organization_id", orgId!)
        .in("tank_id", allTankIds)
        .order("fill_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Fetch transaction history for all customer tanks
  const { data: allTransactions = [] } = useQuery({
    queryKey: ["customer_tank_transactions", id, orgId, allTankIds],
    enabled: !!id && !!orgId && allTankIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_transactions")
        .select("*, bulls_catalog(bull_name)")
        .eq("organization_id", orgId!)
        .in("tank_id", allTankIds)
        .order("created_at", { ascending: false })
        .limit(10000);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Fetch customer orders
  const { data: customerOrders = [] } = useQuery({
    queryKey: ["customer_orders", customer?.id, orgId],
    enabled: !!customer?.id && !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("semen_orders")
        .select("*, semen_companies!semen_orders_semen_company_id_fkey(name), customers!semen_orders_customer_id_fkey(id, name), semen_order_items(units, custom_bull_name, bull_catalog_id, bulls_catalog(bull_name))")
        .eq("organization_id", orgId!)
        .eq("customer_id", customer!.id)
        .order("order_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Fetch customer shipments
  const { data: customerShipments = [] } = useQuery({
    queryKey: ["customer_shipments", id, orgId],
    enabled: !!id && !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shipments")
        .select("*, semen_companies!shipments_semen_company_id_fkey(name)")
        .eq("organization_id", orgId!)
        .eq("customer_id", id!)
        .order("received_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Fetch customer pickups
  const { data: customerPickups = [] } = useQuery({
    queryKey: ["customer_pickups", customer?.id, orgId],
    enabled: !!customer?.id && !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tank_packs")
        .select("id, pack_type, status, packed_at, tank_pack_lines(bull_name, bull_code, units)")
        .eq("organization_id", orgId!)
        .eq("customer_id", customer!.id)
        .in("pack_type", ["pickup", "order"])
        .order("packed_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Fetch customer projects
  const { data: customerProjects = [] } = useQuery({
    queryKey: ["customer_projects", id, orgId],
    enabled: !!id && !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id, name, status, cattle_type, head_count, breeding_date, protocol, created_at")
        .eq("organization_id", orgId!)
        .eq("customer_id", id!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });


  const fillsByTank = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const f of allFills) {
      if (!map.has(f.tank_id)) map.set(f.tank_id, []);
      map.get(f.tank_id)!.push(f);
    }
    return map;
  }, [allFills]);

  const txnsByTank = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const t of allTransactions) {
      if (!map.has(t.tank_id)) map.set(t.tank_id, []);
      map.get(t.tank_id)!.push(t);
    }
    return map;
  }, [allTransactions]);

  // Group inventory by tank
  const inventoryByTank = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const inv of allInventory) {
      const arr = map.get(inv.tank_id) || [];
      arr.push(inv);
      map.set(inv.tank_id, arr);
    }
    for (const [, arr] of map) {
      arr.sort((a: any, b: any) => {
        const ca = (a.canister || "").localeCompare(b.canister || "");
        if (ca !== 0) return ca;
        return (a.sub_canister || "").localeCompare(b.sub_canister || "");
      });
    }
    return map;
  }, [allInventory]);

  // Stats
  const totalTanks = allTanks.length;
  const totalUnits = allInventory.reduce((s: number, i: any) => s + (i.units || 0), 0);
  const bullsOnHand = useMemo(() => {
    const names = new Set<string>();
    for (const inv of allInventory) {
      const name = inv.bulls_catalog?.bull_name || inv.custom_bull_name;
      if (name) names.add(name);
    }
    return names.size;
  }, [allInventory]);

  const lastFillDate = useMemo(() => {
    if (allFills.length === 0) return null;
    return allFills[0]?.fill_date ?? null;
  }, [allFills]);

  // Edit customer handlers
  const handleDeleteCustomer = async () => {
    if (!id || !orgId) return;
    setDeletingCustomer(true);
    try {
      const { error } = await supabase.from("customers").delete().eq("id", id);
      if (error) throw error;
      toast({ title: "Customer deleted" });
      navigate("/tanks-dashboard?tab=customers");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setDeletingCustomer(false);
    }
  };

  const openEdit = () => {
    if (!customer) return;
    setFormName(customer.name || "");
    setFormCompanyName(customer.company_name || "");
    setFormPhone(customer.phone || "");
    setFormEmail(customer.email || "");
    setFormAddressLine1(customer.address_line1 || "");
    setFormAddressLine2(customer.address_line2 || "");
    setFormCity(customer.city || "");
    setFormState(customer.state || "");
    setFormZip(customer.zip || "");
    setFormNotes(customer.notes || "");
    setEditOpen(true);
  };

  const handleEditSave = async () => {
    if (!formName.trim() || !id) return;

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
    const { error } = await supabase
      .from("customers")
      .update({
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
      })
      .eq("id", id);
    setSaving(false);
    if (error) {
      toast({ title: "Error", description: "Could not update customer.", variant: "destructive" });
    } else {
      queryClient.invalidateQueries({ queryKey: ["customer", id] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast({ title: "Customer updated" });
      setEditOpen(false);
    }
  };

  // Add tank handler
  const handleAddTank = async () => {
    if (!tankNumber.trim() || !orgId || !id) return;
    setTankSaving(true);
    const { error } = await supabase
      .from("tanks")
      .insert({
        organization_id: orgId,
        customer_id: id,
        tank_number: tankNumber.trim(),
        tank_name: tankName.trim() || null,
        eid: tankEid.trim() || null,
        tank_type: tankType,
        nitrogen_status: tankStatus,
        location_status: "here",
        model: tankModel.trim() || null,
        serial_number: tankSerial.trim() || null,
        description: tankDesc.trim() || null,
      });
    setTankSaving(false);
    if (error) {
      toast({ title: "Error", description: error.message || "Could not add tank.", variant: "destructive" });
    } else {
      queryClient.invalidateQueries({ queryKey: ["customer_tanks"] });
      queryClient.invalidateQueries({ queryKey: ["tank_inventory_all"] });
      queryClient.invalidateQueries({ queryKey: ["customer_inventory"] });
      queryClient.invalidateQueries({ queryKey: ["tank_map"] });
      toast({ title: "Tank added" });
      setTankDialogOpen(false);
      resetTankForm();
    }
  };

  const resetTankForm = () => {
    setTankNumber(""); setTankName(""); setTankEid("");
    setTankType("customer_tank"); setTankStatus("wet");
    setTankModel(""); setTankSerial(""); setTankDesc("");
  };

  // Add semen handler
  const handleAddSemen = async () => {
    if (!semenCanister.trim() || !semenTankId || !orgId) return;
    // Validate units
    const units = parseInt(semenUnits);
    if (isNaN(units) || units < 1) {
      toast({ title: "Error", description: "Units must be a number greater than 0", variant: "destructive" });
      return;
    }
    // Block save if the bull isn't linked to the catalog. The database now
    // requires every tank_inventory row to have a real bull_catalog_id.
    if (!semenBullCatalogId) {
      toast({
        title: "Bull not in catalog",
        description: semenBullName?.trim()
          ? `"${semenBullName.trim()}" isn't linked to your catalog. Click the Bull field, then either pick from the dropdown or use "Add custom bull" to create it. If you don't know what's in this canister, pick "Miscellaneous (placeholder)".`
          : `Click the Bull field and pick from the dropdown, or use "Add custom bull" to create it. If you don't know what's in this canister, pick "Miscellaneous (placeholder)".`,
        variant: "destructive",
      });
      return;
    }
    setSemenSaving(true);
    const { error } = await supabase
      .from("tank_inventory")
      .insert({
        organization_id: orgId,
        tank_id: semenTankId,
        customer_id: id,
        canister: semenCanister.trim(),
        sub_canister: semenSubCanister.trim() || null,
        bull_catalog_id: semenBullCatalogId || null,
        custom_bull_name: semenBullCatalogId ? null : semenBullName.trim() || null,
        bull_code: semenBullCode.trim() || null,
        units: units,
        storage_type: semenStorageType,
        notes: semenNotes.trim() || null,
      });
    setSemenSaving(false);
    if (error) {
      toast({ title: "Error", description: "Could not add semen.", variant: "destructive" });
    } else {
      queryClient.invalidateQueries({ queryKey: ["tank_inventory_all"] });
      queryClient.invalidateQueries({ queryKey: ["customer_inventory"] });
      queryClient.invalidateQueries({ queryKey: ["tank_map"] });
      toast({ title: "Semen added" });
      setSemenDialogOpen(false);
      resetSemenForm();
    }
  };

  const resetSemenForm = () => {
    setSemenCanister(""); setSemenSubCanister(""); setSemenBullName("");
    setSemenBullCatalogId(null); setSemenBullCode(""); setSemenUnits("");
    setSemenStorageType("customer"); setSemenNotes("");
  };

  const handleDryToggle = async (tankId: string, currentStatus: string) => {
    const newStatus = currentStatus === "dry" ? "wet" : "dry";
    const { data, error } = await supabase
      .from("tanks")
      .update({ nitrogen_status: newStatus })
      .eq("id", tankId)
      .select();
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    if (!data || data.length === 0) {
      toast({ title: "Error", description: "Update failed — you may not have permission to change this tank.", variant: "destructive" });
      return;
    }
    toast({ title: newStatus === "dry" ? "Tank marked as dry" : "Tank marked as wet" });
    queryClient.invalidateQueries({ queryKey: ["customer_tanks"] });
  };

  const handleMovement = async () => {
    if (!custMoveTankId || !orgId) return;
    setCustMoveSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const locationAfter = custMoveType === "picked_up" ? "out" : "here";

    const { error: moveErr } = await supabase.from("tank_movements").insert({
      organization_id: orgId,
      tank_id: custMoveTankId,
      movement_type: custMoveType,
      movement_date: format(new Date(), "yyyy-MM-dd"),
      location_status_after: locationAfter,
      customer_id: id,
      performed_by: user?.id || null,
      notes: custMoveNotes.trim() || null,
    });

    if (moveErr) {
      setCustMoveSaving(false);
      toast({ title: "Error", description: "Could not record movement.", variant: "destructive" });
      return;
    }

    const { data, error } = await supabase.from("tanks").update({ location_status: locationAfter }).eq("id", custMoveTankId).select();
    if (error || !data || data.length === 0) {
      setCustMoveSaving(false);
      toast({ title: "Error", description: "Movement recorded but tank status update failed.", variant: "destructive" });
      return;
    }

    setCustMoveSaving(false);
    toast({ title: locationAfter === "out" ? "Tank marked as out" : "Tank marked as in" });
    queryClient.invalidateQueries({ queryKey: ["customer_tanks"] });
    setCustMoveOpen(false);
    setCustMoveNotes("");
  };

  const handleFillTank = async (tankId: string, tankNumber: string, tankName: string | null) => {
    if (!orgId) return;
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("tank_fills").insert({
      organization_id: orgId,
      tank_id: tankId,
      fill_date: format(new Date(), "yyyy-MM-dd"),
      filled_by: user?.id ?? null,
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Fill recorded", description: `${tankNumber} ${tankName || ""}`.trim() });
      queryClient.invalidateQueries({ queryKey: ["all_tank_fills"] });
      queryClient.invalidateQueries({ queryKey: ["customer_tank_fills"] });
    }
  };

  const openAddSemen = (tankId: string) => {
    resetSemenForm();
    setSemenTankId(tankId);
    setSemenDialogOpen(true);
  };

  const statusBadge = (status: string) => {
    const cls = getBadgeClass("tankStatus", status.toLowerCase());
    return <Badge variant="outline" className={cls}>{status}</Badge>;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen">
        <Navbar />
        <main className="container mx-auto px-4 py-8">
          <p className="text-muted-foreground">Loading…</p>
        </main>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="min-h-screen">
        <Navbar />
        <main className="container mx-auto px-4 py-8">
          <p className="text-muted-foreground">Customer not found.</p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="container mx-auto px-4 py-8 space-y-8">
        {/* Breadcrumb */}
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink onClick={() => navigate("/tanks-dashboard?tab=customers")} className="cursor-pointer">Customers</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{customer.name}</BreadcrumbPage>
            </BreadcrumbItem>
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
              <h1 className="text-2xl font-bold font-display tracking-tight">{customer.name}</h1>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-sm text-muted-foreground">
                {customer.phone && <a href={`tel:${customer.phone}`} className="hover:underline">{customer.phone}</a>}
                {customer.email && <a href={`mailto:${customer.email}`} className="text-primary hover:underline">{customer.email}</a>}
              </div>
              {(() => {
                const hasStructuredAddress = !!(customer.company_name || customer.address_line1 || customer.city || customer.state || customer.zip);
                if (hasStructuredAddress) {
                  const cityStateZip = [customer.city, customer.state].filter(Boolean).join(", ") + (customer.zip ? ` ${customer.zip}` : "");
                  return (
                    <div className="text-sm text-muted-foreground mt-1 space-y-0.5">
                      {customer.company_name && <p className="font-medium">{customer.company_name}</p>}
                      {customer.address_line1 && <p>{customer.address_line1}</p>}
                      {customer.address_line2 && <p>{customer.address_line2}</p>}
                      {cityStateZip.trim() && <p>{cityStateZip.trim()}</p>}
                    </div>
                  );
                }
                return customer.address ? <p className="text-sm text-muted-foreground mt-1">{customer.address}</p> : null;
              })()}
              {customer.notes && (
                <p className="text-sm text-muted-foreground italic mt-1">{customer.notes}</p>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={async () => {
              if (!customer) return;
              // Fetch per-order billable units so the PDF's Orders section shows what
              // the customer was actually billed for (not what they ordered).
              const ordersWithBillable = await Promise.all(
                (customerOrders ?? []).map(async (o: any) => {
                  const { data } = await supabase.rpc("get_billable_units_for_order", { _order_id: o.id });
                  const billable_units = ((data ?? []) as any[]).map((r) => ({
                    bull_name: r.bull_name || "Unknown",
                    units: r.units || 0,
                  }));
                  return { ...o, billable_units };
                })
              );
              generateCustomerInventoryPdf(
                customer,
                allTanks,
                inventoryByTank,
                allTanks.map((t: any) => t.id),
                ordersWithBillable,
                customerShipments,
                customerPickups
              );
              toast({ title: "PDF downloaded" });
            }} className="gap-2">
              <FileText className="h-4 w-4" /> Print Report
            </Button>
            {customer.email && (
              <Button variant="outline" onClick={() => window.location.href = `mailto:${customer.email}`} className="gap-2">
                <Mail className="h-4 w-4" /> Email
              </Button>
            )}
            <Button variant="outline" onClick={openEdit} className="gap-2">
              <Pencil className="h-4 w-4" /> Edit Customer
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="gap-2">
                  <Trash2 className="h-4 w-4" /> Delete Customer
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Customer</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete {customer.name} and all associated data. This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDeleteCustomer}
                    disabled={deletingCustomer}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {deletingCustomer ? "Deleting…" : "Delete"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard title="Tanks" value={totalTanks} delay={0} index={0} icon={Package} />
          <StatCard title="Total Units" value={totalUnits} delay={100} index={1} icon={Archive} />
          <StatCard title="Bulls on Hand" value={bullsOnHand} delay={200} index={2} icon={Dna} />
          <StatCard
            title="Last Fill"
            value={lastFillDate ? format(new Date(lastFillDate + "T00:00:00"), "MMM d, yyyy") : "Never"}
            delay={300}
            index={3}
            icon={Droplets}
          />
        </div>

        {/* Tanks section */}
        {allTanks.length === 0 ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Tanks</h2>
              <Button className="gap-2" onClick={() => { resetTankForm(); setTankDialogOpen(true); }}>
                <Plus className="h-4 w-4" /> Add Tank
              </Button>
            </div>
            <p className="text-muted-foreground text-sm">No tanks currently with this customer.</p>
          </div>
        ) : (
          <Collapsible open={tanksOpen} onOpenChange={setTanksOpen} className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <CollapsibleTrigger className="flex items-center gap-2 text-left hover:opacity-80 transition-opacity flex-1">
                {tanksOpen ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                <h2 className="text-lg font-semibold">Tanks at this customer ({allTanks.length})</h2>
              </CollapsibleTrigger>
              <Button className="gap-2" onClick={() => { resetTankForm(); setTankDialogOpen(true); }}>
                <Plus className="h-4 w-4" /> Add Tank
              </Button>
            </div>
            <CollapsibleContent className="space-y-3">
              {
          allTanks.map((tank: any) => {
            const inv = inventoryByTank.get(tank.id) || [];
            const tankTotal = inv.reduce((s: number, i: any) => s + (i.units || 0), 0);
            const tankFills = fillsByTank.get(tank.id) || [];
            const tankTxns = txnsByTank.get(tank.id) || [];
            const lastTankFill = tankFills[0];
            const fillOverdue = lastTankFill
              ? differenceInDays(new Date(), new Date(lastTankFill.fill_date + "T00:00:00")) >= 90
              : false;

            return (
              <div key={tank.id} className="rounded-lg border border-border/50 overflow-hidden">
                {/* Tank header */}
                <div className={cn("flex items-center justify-between px-4 py-3", tank.nitrogen_status === "dry" ? "bg-yellow-500/10" : "bg-muted/30")}>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">
                        {tank.tank_name ? `${tank.tank_name} — ${tank.tank_number}` : tank.tank_number}
                      </span>
                      {statusBadge(tank.nitrogen_status || "unknown")}
                      <Badge variant="outline" className={
                        tank.location_status === "here"
                          ? "bg-green-600/20 text-green-400 border-green-600/30"
                          : "bg-blue-600/20 text-blue-400 border-blue-600/30"
                      }>
                        {tank.location_status === "here" ? "in shop" : "out"}
                      </Badge>
                    </div>
                    <div className="flex gap-3 text-xs text-muted-foreground mt-0.5">
                      {tank.model && <span>Model: {tank.model}</span>}
                      {tank.eid && <span>EID: {tank.eid}</span>}
                      {tank.serial_number && <span>S/N: {tank.serial_number}</span>}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {tank.location_status === "here" ? (
                      <Button variant="outline" size="sm" onClick={() => {
                        setCustMoveTankId(tank.id);
                        setCustMoveTankLabel(tank.tank_name ? `${tank.tank_name} — ${tank.tank_number}` : tank.tank_number);
                        setCustMoveType("picked_up");
                        setCustMoveNotes("");
                        setCustMoveOpen(true);
                      }} className="gap-1">
                        <Truck className="h-4 w-4" /> Mark Out
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" onClick={() => {
                        setCustMoveTankId(tank.id);
                        setCustMoveTankLabel(tank.tank_name ? `${tank.tank_name} — ${tank.tank_number}` : tank.tank_number);
                        setCustMoveType("returned");
                        setCustMoveNotes("");
                        setCustMoveOpen(true);
                      }} className="gap-1">
                        <ArrowLeft className="h-4 w-4" /> Mark In
                      </Button>
                    )}
                    {tank.nitrogen_status === "dry" ? (
                      <Button size="sm" onClick={() => handleDryToggle(tank.id, tank.nitrogen_status)} className="gap-1">
                        <Droplets className="h-4 w-4" /> Mark Wet
                      </Button>
                    ) : (
                      <>
                        <Button variant="outline" size="sm" onClick={() => handleDryToggle(tank.id, tank.nitrogen_status)} className="gap-1">
                          <Sun className="h-4 w-4" /> Dry Off
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handleFillTank(tank.id, tank.tank_number, tank.tank_name)} className="gap-1">
                          <Droplets className="h-4 w-4" /> Fill
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => navigate(`/tanks/${tank.id}/reinventory?customer_id=${id}`)}>
                          Re-inventory
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => openAddSemen(tank.id)}>
                          Add Semen
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                {/* Inventory table */}
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/10">
                      <TableHead>Canister</TableHead>
                      <TableHead>Sub-can</TableHead>
                      <TableHead>Bull</TableHead>
                      <TableHead>Bull Code</TableHead>
                      <TableHead>Company</TableHead>
                      <TableHead className="text-right">Units</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inv.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-6 text-muted-foreground">No inventory</TableCell>
                      </TableRow>
                    ) : (
                      <>
                        {inv.map((item: any) => (
                          <TableRow key={item.id}>
                            <TableCell>{item.canister}</TableCell>
                            <TableCell>{item.sub_canister || "—"}</TableCell>
                            <TableCell>
                              {getBullDisplayName(item)}
                              {item.item_type === "embryo" && (
                                <Badge variant="outline" className="ml-2 bg-purple-500/15 text-purple-400 border-purple-500/30 text-xs">Embryo</Badge>
                              )}
                            </TableCell>
                            <TableCell>{item.bull_code || "—"}</TableCell>
                            <TableCell>{item.bulls_catalog?.company || "—"}</TableCell>
                            <TableCell className="text-right">{item.units}</TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setTransferSource(item);
                                  setTransferSourceTank(tank);
                                  setTransferOpen(true);
                                }}
                                className="h-7 w-7 p-0"
                                title="Transfer to another tank"
                              >
                                <ArrowRightLeft className="h-3.5 w-3.5" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="bg-muted/20 font-semibold">
                          <TableCell colSpan={5}>Total</TableCell>
                          <TableCell className="text-right">{tankTotal}</TableCell>
                          <TableCell></TableCell>
                        </TableRow>
                      </>
                    )}
                  </TableBody>
                </Table>

                {/* Expandable: Fill History */}
                <div className="border-t border-border">
                  <button
                    onClick={() => toggleSection(tank.id, "fills")}
                    className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-muted/20 transition-colors text-left"
                  >
                    <div className="flex items-center gap-2 text-sm">
                      {isSectionOpen(tank.id, "fills") ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      <span className="font-medium">Fill History ({tankFills.length})</span>
                      {lastTankFill && (
                        <span className="text-xs text-muted-foreground">
                          Last fill: {format(new Date(lastTankFill.fill_date + "T00:00:00"), "MMM d, yyyy")}
                        </span>
                      )}
                    </div>
                  </button>
                  {isSectionOpen(tank.id, "fills") && (
                    <div className="overflow-x-auto">
                      {tankFills.length === 0 ? (
                        <p className="px-4 py-3 text-sm text-muted-foreground">No fills recorded</p>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/5">
                              <TableHead>Fill Date</TableHead>
                              <TableHead>Fill Type</TableHead>
                              <TableHead>Notes</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {tankFills.slice(0, 20).map((fill: any, idx: number) => (
                              <TableRow key={fill.id} className={cn(idx === 0 && fillOverdue && "bg-amber-500/10")}>
                                <TableCell className="text-sm">{format(new Date(fill.fill_date + "T00:00:00"), "MMM d, yyyy")}</TableCell>
                                <TableCell className="text-sm">{fill.fill_type || "—"}</TableCell>
                                <TableCell className="text-sm text-muted-foreground">{fill.notes || "—"}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                      {tankFills.length > 20 && (
                        <div className="px-4 py-2">
                          <Link to={`/tanks/${tank.id}`} className="text-xs text-primary hover:underline">
                            View all on tank page →
                          </Link>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Expandable: Transaction History */}
                <div className="border-t border-border">
                  <button
                    onClick={() => toggleSection(tank.id, "txns")}
                    className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-muted/20 transition-colors text-left"
                  >
                    <div className="flex items-center gap-2 text-sm">
                      {isSectionOpen(tank.id, "txns") ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      <span className="font-medium">Transaction History ({tankTxns.length})</span>
                    </div>
                  </button>
                  {isSectionOpen(tank.id, "txns") && (
                    <div className="overflow-x-auto">
                      {tankTxns.length === 0 ? (
                        <p className="px-4 py-3 text-sm text-muted-foreground">No transactions recorded</p>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/5">
                              <TableHead>Date</TableHead>
                              <TableHead>Type</TableHead>
                              <TableHead>Bull</TableHead>
                              <TableHead className="text-right">Units</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {tankTxns.slice(0, 20).map((txn: any) => (
                              <TableRow key={txn.id}>
                                <TableCell className="text-sm">{format(new Date(txn.created_at), "MMM d, yyyy")}</TableCell>
                                <TableCell className="text-sm capitalize">{(txn.transaction_type || "").replace(/_/g, " ")}</TableCell>
                                <TableCell className="text-sm">{getBullDisplayLabel(txn)}</TableCell>
                                <TableCell className={cn("text-right text-sm font-medium", txn.units_change > 0 ? "text-primary" : "text-destructive")}>
                                  {txn.units_change > 0 ? "+" : ""}{txn.units_change}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                      {tankTxns.length > 20 && (
                        <div className="px-4 py-2">
                          <Link to={`/tanks/${tank.id}`} className="text-xs text-primary hover:underline">
                            View all on tank page →
                          </Link>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Projects */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Projects</h2>
          <div className="rounded-lg border border-border/50 overflow-hidden">
            {customerProjects.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground text-center">No projects yet for this customer.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/10">
                      <TableHead>Project</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Cattle</TableHead>
                      <TableHead className="text-right">Head</TableHead>
                      <TableHead>Breeding Date</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customerProjects.map((p: any) => (
                      <TableRow key={p.id} className="cursor-pointer hover:bg-secondary/50" onClick={() => navigate(`/project/${p.id}`)}>
                        <TableCell className="text-sm font-medium">{p.name}</TableCell>
                        <TableCell>
                          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${getBadgeClass('projectStatus', p.status)}`}>
                            {p.status}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{p.cattle_type || "—"}</TableCell>
                        <TableCell className="text-sm text-right">{p.head_count ?? 0}</TableCell>
                        <TableCell className="text-sm">
                          {p.breeding_date ? format(new Date(p.breeding_date + "T00:00:00"), "MMM d, yyyy") : "—"}
                        </TableCell>
                        <TableCell><span className="text-xs text-primary hover:underline">View →</span></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </div>

        {/* Orders & Shipments */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Truck className="h-5 w-5" /> Orders & Shipments
          </h2>

          {/* Recent Orders */}
          <div className="rounded-lg border border-border/50 overflow-hidden">
            <div className="px-4 py-2.5 bg-muted/30 font-medium text-sm flex items-center justify-between">
              Recent Orders
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setNewOrderOpen(true)}
              >
                + New Order
              </Button>
            </div>
            {customerOrders.length === 0 ? (
              <p className="px-4 py-4 text-sm text-muted-foreground">No orders found for this customer</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/10">
                      <TableHead>Order Date</TableHead>
                      <TableHead>Company</TableHead>
                      <TableHead>Fulfillment</TableHead>
                      <TableHead>Billing</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customerOrders.map((order: any) => (
                      <TableRow key={order.id} className="cursor-pointer hover:bg-secondary/50" onClick={() => navigate(`/semen-orders/${order.id}`)}>
                        <TableCell className="text-sm">{format(new Date(order.order_date + "T00:00:00"), "MMM d, yyyy")}</TableCell>
                        <TableCell className="text-sm">{order.semen_companies?.name || "—"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={FULFILLMENT_COLORS[order.fulfillment_status] || "bg-muted text-muted-foreground"}>
                            {(order.fulfillment_status || "").replace(/_/g, " ")}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={BILLING_COLORS[order.billing_status] || "bg-muted text-muted-foreground"}>
                            {order.billing_status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-primary hover:underline">View →</span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          {/* Recent Shipments */}
          <div className="rounded-lg border border-border/50 overflow-hidden">
            <div className="px-4 py-2.5 bg-muted/30 font-medium text-sm">Recent Shipments</div>
            {customerShipments.length === 0 ? (
              <p className="px-4 py-4 text-sm text-muted-foreground">No shipments found for this customer</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/10">
                      <TableHead>Received Date</TableHead>
                      <TableHead>From</TableHead>
                      <TableHead>Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customerShipments.map((ship: any) => (
                      <TableRow key={ship.id}>
                        <TableCell className="text-sm">{format(new Date(ship.received_date + "T00:00:00"), "MMM d, yyyy")}</TableCell>
                        <TableCell className="text-sm">{ship.semen_companies?.name || "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{ship.notes || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Edit Customer Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Customer</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-[140px_1fr] items-center gap-x-4 gap-y-3">
            <Label className="text-right text-sm">Display Name *</Label>
            <Input value={formName} onChange={(e) => setFormName(e.target.value)} />
            <Label className="text-right text-sm">Company Name</Label>
            <Input value={formCompanyName} onChange={(e) => setFormCompanyName(e.target.value)} />
            <Label className="text-right text-sm">Email</Label>
            <Input type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} />
            <Label className="text-right text-sm">Phone</Label>
            <Input value={formPhone} onChange={(e) => setFormPhone(e.target.value)} />
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
            <Textarea value={formNotes} onChange={(e) => setFormNotes(e.target.value)} rows={3} />
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleEditSave} disabled={saving || !formName.trim()}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Tank Dialog */}
      <Dialog open={tankDialogOpen} onOpenChange={setTankDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Tank</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Tank Number *</Label>
              <Input value={tankNumber} onChange={(e) => setTankNumber(e.target.value)} placeholder="e.g. T-001" />
            </div>
            <div className="space-y-1.5">
              <Label>Tank Name</Label>
              <Input value={tankName} onChange={(e) => setTankName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>EID</Label>
              <Input value={tankEid} onChange={(e) => setTankEid(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Tank Type</Label>
                <Select value={tankType} onValueChange={setTankType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="customer_tank">Customer Tank</SelectItem>
                    <SelectItem value="rental_tank">Rental Tank</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={tankStatus} onValueChange={setTankStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="wet">Wet</SelectItem>
                    <SelectItem value="dry">Dry</SelectItem>
                    <SelectItem value="out">Out</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Model</Label>
              <Input value={tankModel} onChange={(e) => setTankModel(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Serial Number</Label>
              <Input value={tankSerial} onChange={(e) => setTankSerial(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea value={tankDesc} onChange={(e) => setTankDesc(e.target.value)} rows={2} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setTankDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleAddTank} disabled={tankSaving || !tankNumber.trim()}>
                {tankSaving ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Semen Dialog */}
      <Dialog open={semenDialogOpen} onOpenChange={setSemenDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Semen</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Canister *</Label>
              <Input value={semenCanister} onChange={(e) => setSemenCanister(e.target.value)} placeholder="e.g. 1" />
            </div>
            <div className="space-y-1.5">
              <Label>Sub-canister</Label>
              <Input value={semenSubCanister} onChange={(e) => setSemenSubCanister(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Bull</Label>
              <BullCombobox
                value={semenBullName}
                catalogId={semenBullCatalogId}
                onChange={(name, catId) => { setSemenBullName(name); setSemenBullCatalogId(catId); }}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Bull Code</Label>
              <Input value={semenBullCode} onChange={(e) => setSemenBullCode(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Units</Label>
                <Input type="number" value={semenUnits} onChange={(e) => setSemenUnits(e.target.value)} min="0" />
              </div>
              <div className="space-y-1.5">
                <Label>Storage Type</Label>
                <Select value={semenStorageType} onValueChange={setSemenStorageType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="customer">Customer</SelectItem>
                    <SelectItem value="communal">Communal</SelectItem>
                    <SelectItem value="rental">Rental</SelectItem>
                    <SelectItem value="inventory">Inventory</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={semenNotes} onChange={(e) => setSemenNotes(e.target.value)} rows={2} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setSemenDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleAddSemen} disabled={semenSaving || !semenCanister.trim()}>
                {semenSaving ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Mark Out / Mark In Dialog */}
      <Dialog open={custMoveOpen} onOpenChange={setCustMoveOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{custMoveType === "picked_up" ? "Mark Tank Out" : "Mark Tank In"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              {custMoveTankLabel} — {custMoveType === "picked_up" ? "leaving the shop" : "coming back to the shop"}
            </div>
            <div className="space-y-1.5">
              <Label>Notes (optional)</Label>
              <Textarea
                value={custMoveNotes}
                onChange={(e) => setCustMoveNotes(e.target.value)}
                rows={2}
                placeholder={custMoveType === "picked_up" ? "e.g. Customer picked up for breeding season" : "e.g. Returned after spring breeding"}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setCustMoveOpen(false)}>Cancel</Button>
              <Button onClick={handleMovement} disabled={custMoveSaving}>
                {custMoveSaving ? "Saving…" : custMoveType === "picked_up" ? "Mark Out" : "Mark In"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {transferSource && (
        <TransferDialog
          open={transferOpen}
          onOpenChange={setTransferOpen}
          sourceRow={transferSource}
          sourceTankName={transferSourceTank?.tank_name || transferSourceTank?.tank_number || "Tank"}
          orgId={orgId}
          userId={userId ?? null}
          tankId={transferSourceTank?.id || ""}
          defaultCustomerId={id}
          defaultCustomerName={customer?.name}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ["tank_inventory_all"] });
            queryClient.invalidateQueries({ queryKey: ["customer_inventory"] });
            queryClient.invalidateQueries({ queryKey: ["tank_map"] });
          }}
        />
      )}

      {customer && (
        <NewOrderDialog
          open={newOrderOpen}
          onOpenChange={setNewOrderOpen}
          initialOrderType="customer"
          initialCustomerId={customer.id}
        />
      )}

      <AppFooter />
    </div>
  );
};

export default CustomerDetail;