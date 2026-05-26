import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  ArrowLeft, FileText, Tag, ClipboardList, PackageOpen, PackageCheck, Package,
  Truck, ExternalLink, Pencil, Loader2, Check, CalendarIcon, Trash2, Printer,
} from "lucide-react";

import Navbar from "@/components/Navbar";
import AppFooter from "@/components/AppFooter";
import { supabase } from "@/integrations/supabase/client";
import { getBullDisplayName } from "@/lib/bullDisplay";
import TeamMemberSelect from "@/components/TeamMemberSelect";
import QuickBullEditDialog from "@/components/bulls/QuickBullEditDialog";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useOrgRole } from "@/hooks/useOrgRole";

import { generatePackingSlipPdf } from "@/lib/generatePackingSlipPdf";
import { generatePackingLabelPdf } from "@/lib/generatePackingLabelPdf";
import { generateSessionSheetPdf } from "@/lib/generateSessionSheetPdf";
import { generateReturnSlipPdf } from "@/lib/generateReturnSlipPdf";
import { generateTankLabelPdf } from "@/lib/generateTankLabelPdf";

const SavedBadge = ({ visible }: { visible: boolean }) => (
  <span
    className={cn(
      "ml-2 inline-flex items-center gap-1 text-xs font-medium text-green-500 transition-opacity duration-300",
      visible ? "opacity-100" : "opacity-0 pointer-events-none"
    )}
    aria-live="polite"
  >
    <Check className="h-3.5 w-3.5" />
    Saved
  </span>
);

const STATUS_BADGE: Record<string, string> = {
  packed: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  in_field: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  unpacked: "bg-green-500/20 text-green-400 border-green-500/30",
  shipped: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  delivered: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  tank_returned: "bg-green-500/20 text-green-400 border-green-500/30",
  picked_up: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  cancelled: "bg-red-500/20 text-red-400 border-red-500/30",
};

const STATUS_LABEL: Record<string, string> = {
  packed: "Packed",
  in_field: "In Field",
  unpacked: "Unpacked",
  shipped: "Shipped",
  delivered: "Delivered",
  tank_returned: "Tank Returned",
  picked_up: "Picked Up",
  cancelled: "Cancelled",
};

function getTrackingUrl(carrier: string | null, trackingNumber: string): string | null {
  if (!trackingNumber) return null;
  const num = trackingNumber.trim();
  switch (carrier?.toLowerCase()) {
    case "ups":
      return `https://www.ups.com/track?tracknum=${encodeURIComponent(num)}`;
    case "fedex":
      return `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(num)}`;
    case "usps":
      return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(num)}`;
    default:
      return null;
  }
}

const PackDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { orgId } = useOrgRole();

  const [editingTracking, setEditingTracking] = useState(false);
  const [editBullId, setEditBullId] = useState<string | null>(null);
  const [editCarrier, setEditCarrier] = useState("");
  const [editTrackingNumber, setEditTrackingNumber] = useState("");
  const [savingTracking, setSavingTracking] = useState(false);

  const [editingReturnTracking, setEditingReturnTracking] = useState(false);
  const [editReturnCarrier, setEditReturnCarrier] = useState("");
  const [editReturnTrackingNumber, setEditReturnTrackingNumber] = useState("");
  const [savingReturnTracking, setSavingReturnTracking] = useState(false);

  const [closeOutOpen, setCloseOutOpen] = useState(false);
  const [closingOut, setClosingOut] = useState(false);
  const [closeOutDate, setCloseOutDate] = useState<Date>(new Date());
  const [closeOutBy, setCloseOutBy] = useState("");
  const [closeOutNotes, setCloseOutNotes] = useState("");
  
  const [deleting, setDeleting] = useState(false);

  const [advanceDialogOpen, setAdvanceDialogOpen] = useState(false);
  const [advanceTarget, setAdvanceTarget] = useState("");
  const [advanceDate, setAdvanceDate] = useState<Date>(new Date());
  const [advanceCarrier, setAdvanceCarrier] = useState("");
  const [advanceTracking, setAdvanceTracking] = useState("");
  const [advancePickupBy, setAdvancePickupBy] = useState("");
  const [advancing, setAdvancing] = useState(false);

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editFieldTankId, setEditFieldTankId] = useState<string>("");
  const [editFieldTankOpen, setEditFieldTankOpen] = useState(false);
  const [editFieldTankSearch, setEditFieldTankSearch] = useState("");
  const [editCustomerId, setEditCustomerId] = useState<string>("");
  const [editDestinationName, setEditDestinationName] = useState("");
  const [editPackedBy, setEditPackedBy] = useState("");
  const [editPackedAt, setEditPackedAt] = useState<Date | undefined>(undefined);
  const [editNotes, setEditNotes] = useState("");
  const [editPackedAtOpen, setEditPackedAtOpen] = useState(false);

  const [lineDialogOpen, setLineDialogOpen] = useState(false);
  const [lineDialogMode, setLineDialogMode] = useState<"add" | "edit">("add");
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [lineSubmitting, setLineSubmitting] = useState(false);
  const [lineDeleteId, setLineDeleteId] = useState<string | null>(null);
  const [lineDeleting, setLineDeleting] = useState(false);
  const [crossCustomerConfirm, setCrossCustomerConfirm] = useState<Record<string, any> | null>(null);

  const [lineSourceTankId, setLineSourceTankId] = useState<string>("");
  const [lineSourceTankOpen, setLineSourceTankOpen] = useState(false);
  const [lineSourceTankSearch, setLineSourceTankSearch] = useState("");
  const [lineBullCatalogId, setLineBullCatalogId] = useState<string>("");
  const [lineBullName, setLineBullName] = useState<string>("");
  const [lineBullCode, setLineBullCode] = useState<string>("");
  const [lineUnits, setLineUnits] = useState<string>("");
  const [lineSourceCanister, setLineSourceCanister] = useState<string>("");
  const [lineFieldCanister, setLineFieldCanister] = useState<string>("");
  const [lineBullOpen, setLineBullOpen] = useState(false);
  const [lineBullSearch, setLineBullSearch] = useState("");

  const [recentlySaved, setRecentlySaved] = useState<string | null>(null);

  // Fetch pack with field tank
  const { data: pack, isLoading } = useQuery({
    queryKey: ["pack_detail", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tank_packs")
        .select("*, tanks!tank_packs_field_tank_id_fkey(tank_name, tank_number), customers!tank_packs_customer_id_fkey(name)")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Fetch pack lines with source tank info
  const { data: packLines = [] } = useQuery({
    queryKey: ["pack_lines", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tank_pack_lines")
        .select("*, tanks!tank_pack_lines_source_tank_id_fkey(tank_name, tank_number)")
        .eq("tank_pack_id", id!)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Fetch pack projects
  const { data: packProjects = [] } = useQuery({
    queryKey: ["pack_projects", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tank_pack_projects")
        .select("*, projects!tank_pack_projects_project_id_fkey(name)")
        .eq("tank_pack_id", id!);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Fetch pack orders
  const { data: packOrders = [] } = useQuery({
    queryKey: ["pack_orders", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tank_pack_orders")
        .select("semen_order_id, semen_orders(id, order_date, fulfillment_status, customers!semen_orders_customer_id_fkey(name))")
        .eq("tank_pack_id", id!);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Fetch unpack lines if unpacked
  const { data: unpackLines = [] } = useQuery({
    queryKey: ["unpack_lines", id],
    enabled: !!id && pack?.status === "unpacked",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tank_unpack_lines")
        .select("*, tanks!tank_unpack_lines_destination_tank_id_fkey(tank_name, tank_number)")
        .eq("tank_pack_id", id!);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: availableTanks = [] } = useQuery({
    queryKey: ["available_field_tanks", pack?.organization_id],
    queryFn: async () => {
      if (!pack?.organization_id) return [];
      const { data, error } = await (supabase
        .from("tanks")
        .select("id, tank_name, tank_number") as any)
        .eq("organization_id", pack.organization_id)
        .eq("location_status", "here")
        .eq("nitrogen_status", "wet")
        .order("tank_number", { ascending: true });
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: editDialogOpen && !!pack?.organization_id,
  });

  const { data: availableCustomers = [] } = useQuery({
    queryKey: ["available_customers", pack?.organization_id],
    queryFn: async () => {
      if (!pack?.organization_id) return [];
      const { data, error } = await supabase
        .from("customers")
        .select("id, name")
        .eq("organization_id", pack.organization_id)
        .order("name", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: editDialogOpen && !!pack?.organization_id,
  });

  const { data: allSourceTanks = [] } = useQuery({
    queryKey: ["all_source_tanks", pack?.organization_id],
    queryFn: async () => {
      if (!pack?.organization_id) return [];
      const { data, error } = await supabase
        .from("tanks")
        .select("id, tank_name, tank_number, location_status")
        .eq("organization_id", pack.organization_id)
        .order("tank_number", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: lineDialogOpen && !!pack?.organization_id,
  });

  const { data: sourceTankInventory = [] } = useQuery({
    queryKey: ["source_tank_inventory", lineSourceTankId, pack?.organization_id],
    queryFn: async () => {
      if (!lineSourceTankId || !pack?.organization_id) return [];
      const { data, error } = await supabase
        .from("tank_inventory")
        .select("id, units, canister, bull_catalog_id, bull_code, custom_bull_name, bulls_catalog!tank_inventory_bull_catalog_id_fkey(bull_name, registration_number)")
        .eq("tank_id", lineSourceTankId)
        .eq("organization_id", pack.organization_id)
        .gt("units", 0)
        .order("units", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: lineDialogOpen && !!lineSourceTankId && !!pack?.organization_id,
  });

  const fieldTankName = pack?.tanks?.tank_name || pack?.tanks?.tank_number || "Unknown";
  const projectNames = packProjects.map((pp: any) => pp.projects?.name).filter(Boolean);
  const totalPackedUnits = packLines.reduce((s: number, l: any) => s + (l.units || 0), 0);
  const packTypeValue = pack?.pack_type || "project";
  const isShipment = packTypeValue === "shipment";
  const isOrder = packTypeValue === "order";
  const isPickup = packTypeValue === "pickup";
  const pickupCustomerName = (pack?.customers as any)?.name;

  const handleSaveTracking = async () => {
    setSavingTracking(true);
    try {
      await supabase.from("tank_packs").update({
        shipping_carrier: editCarrier || null,
        tracking_number: editTrackingNumber.trim() || null,
      }).eq("id", pack.id);
      queryClient.invalidateQueries({ queryKey: ["pack_detail", id] });
      setEditingTracking(false);
      toast({ title: "Tracking updated" });
      flashSaved("tracking");
    } catch (err: any) {
      toast({ title: "Error", description: err?.message, variant: "destructive" });
    } finally {
      setSavingTracking(false);
    }
  };

  const handleSaveReturnTracking = async () => {
    setSavingReturnTracking(true);
    try {
      await supabase.from("tank_packs").update({
        return_carrier: editReturnCarrier || null,
        return_tracking_number: editReturnTrackingNumber.trim() || null,
      }).eq("id", pack.id);
      queryClient.invalidateQueries({ queryKey: ["pack_detail", id] });
      setEditingReturnTracking(false);
      toast({ title: "Return tracking updated" });
      flashSaved("return_tracking");
    } catch (err: any) {
      toast({ title: "Error", description: err?.message, variant: "destructive" });
    } finally {
      setSavingReturnTracking(false);
    }
  };

  const handlePrintSlip = () => {
    generatePackingSlipPdf(
      {
        fieldTankName,
        packedAt: pack.packed_at,
        packedBy: pack.packed_by,
        projectNames: isShipment ? [] : projectNames,
        notes: pack.notes,
        packType: packTypeValue,
        destinationName: pack.destination_name,
        destinationAddress: pack.destination_address,
        trackingNumber: pack.tracking_number,
        shippingCarrier: pack.shipping_carrier,
      },
      packLines.map((l: any) => ({
        bullName: l.bull_name,
        bullCode: l.bull_code,
        sourceTankName: l.tanks?.tank_name || l.tanks?.tank_number || "—",
        sourceCanister: l.source_canister,
        fieldCanister: l.field_canister,
        units: l.units,
      }))
    );
  };

  const handlePrintLabel = () => {
    generatePackingLabelPdf(
      {
        fieldTankName,
        packedAt: pack.packed_at,
        projectNames: isShipment ? [] : projectNames,
        packType: packTypeValue,
        destinationName: pack.destination_name,
      },
      packLines.map((l: any) => ({
        bullName: l.bull_name,
        fieldCanister: l.field_canister,
        units: l.units,
      }))
    );
  };

  const handlePrintSession = () => {
    generateSessionSheetPdf(
      { fieldTankName, packedAt: pack.packed_at, projectNames },
      packLines.map((l: any) => ({
        bullName: l.bull_name,
        fieldCanister: l.field_canister,
        units: l.units,
      }))
    );
  };

  const handlePrintReturn = () => {
    const packedMap = new Map<string, number>();
    for (const pl of packLines) {
      const key = pl.bull_catalog_id || pl.bull_name;
      packedMap.set(key, (packedMap.get(key) || 0) + pl.units);
    }

    generateReturnSlipPdf(
      {
        fieldTankName,
        packedAt: pack.packed_at,
        unpackedAt: pack.unpacked_at,
        packedBy: pack.packed_by,
        unpackedBy: pack.unpacked_by,
        projectNames,
        notes: pack.notes,
      },
      unpackLines.map((ul: any) => {
        const key = ul.bull_catalog_id || ul.bull_name;
        const unitsPacked = packedMap.get(key) || 0;
        return {
          bullName: ul.bull_name,
          bullCode: ul.bull_code,
          unitsPacked,
          unitsReturned: ul.units_returned,
          destinationTankName: ul.tanks?.tank_name || ul.tanks?.tank_number || "—",
          destinationCanister: ul.destination_canister,
        };
      })
    );
  };

  const handleCloseOut = async () => {
    if (!pack || !orgId) return;
    setClosingOut(true);
    try {
      const { data, error } = await supabase.rpc("close_out_tank_pack", {
        _pack_id: pack.id,
        _closed_at: closeOutDate.toISOString(),
        _closed_by: closeOutBy.trim() || null,
        _close_notes: closeOutNotes.trim() || null,
      });
      if (error) throw error;
      const result = data as { ok?: boolean; new_status?: string; lines_processed?: number } | null;
      toast({
        title: "Pack closed out",
        description: result?.new_status === "tank_returned"
          ? "Tank marked as returned. All semen recorded as used in field."
          : "Pack marked as unpacked. All semen recorded as used in field.",
      });
      queryClient.invalidateQueries({ queryKey: ["pack_detail", id] });
      queryClient.invalidateQueries({ queryKey: ["tank_map"] });
      setCloseOutOpen(false);
    } catch (err: any) {
      toast({
        title: "Failed to close out pack",
        description: err?.message || "Unknown error. Please try again or contact support.",
        variant: "destructive",
      });
    } finally {
      setClosingOut(false);
    }
  };

  const handleAdvance = async () => {
    if (!id || !pack || !advanceTarget) return;
    setAdvancing(true);
    try {
      const updates: any = { status: advanceTarget };
      const isoDate = format(advanceDate, "yyyy-MM-dd");

      if (advanceTarget === "shipped") {
        updates.shipped_at = isoDate;
        if (advanceCarrier) updates.shipping_carrier = advanceCarrier;
        if (advanceTracking) updates.tracking_number = advanceTracking;
      } else if (advanceTarget === "delivered") {
        updates.delivered_at = isoDate;
      } else if (advanceTarget === "picked_up") {
        updates.picked_up_at = isoDate;
        if (advancePickupBy) updates.pickup_by = advancePickupBy;
      } else if (advanceTarget === "tank_returned") {
        updates.tank_returned_at = isoDate;
      }

      const { error: updErr } = await supabase
        .from("tank_packs")
        .update(updates)
        .eq("id", id);
      if (updErr) throw updErr;

      if (advanceTarget === "tank_returned" && pack.field_tank_id) {
        const { error: tankErr } = await supabase
          .from("tanks")
          .update({ location_status: "here" })
          .eq("id", pack.field_tank_id);
        if (tankErr) throw new Error(`Pack updated but field tank location not reset: ${tankErr.message}`);
      }

      toast({ title: `Pack marked ${STATUS_LABEL[advanceTarget] || advanceTarget}` });
      setAdvanceDialogOpen(false);
      setAdvanceTarget("");
      setAdvanceCarrier("");
      setAdvanceTracking("");
      setAdvancePickupBy("");
      queryClient.invalidateQueries({ queryKey: ["pack_detail", id] });
    } catch (err: any) {
      toast({ title: "Failed to advance pack", description: err?.message || "Unknown error", variant: "destructive" });
    } finally {
      setAdvancing(false);
    }
  };

  const openAdvanceDialog = (target: string) => {
    setAdvanceTarget(target);
    setAdvanceDate(new Date());
    setAdvanceCarrier("");
    setAdvanceTracking("");
    setAdvancePickupBy("");
    setAdvanceDialogOpen(true);
  };

  const flashSaved = (fieldId: string) => {
    setRecentlySaved(fieldId);
    setTimeout(() => {
      setRecentlySaved((current) => (current === fieldId ? null : current));
    }, 2000);
  };

  const openEditDialog = () => {
    if (!pack) return;
    setEditFieldTankId(pack.field_tank_id || "");
    setEditCustomerId(pack.customer_id || "");
    setEditDestinationName(pack.destination_name || "");
    setEditPackedBy(pack.packed_by || "");
    setEditPackedAt(pack.packed_at ? new Date(pack.packed_at) : undefined);
    setEditNotes(pack.notes || "");
    setEditDialogOpen(true);
  };

  const handleEditSubmit = async () => {
    if (!pack) return;
    setEditSubmitting(true);
    try {
      const payload: Record<string, any> = {
        pack_id: pack.id,
        customer_id: editCustomerId || null,
        destination_name: editDestinationName.trim() || null,
        packed_by: editPackedBy.trim() || null,
        packed_at: editPackedAt ? editPackedAt.toISOString() : pack.packed_at,
        notes: editNotes.trim() || null,
      };
      if (pack.status === "packed" && editFieldTankId && editFieldTankId !== pack.field_tank_id) {
        payload.field_tank_id = editFieldTankId;
      }

      const { data, error } = await supabase.rpc("edit_tank_pack", { _input: payload });
      if (error) throw error;

      const result = data as { ok?: boolean; field_tank_changed?: boolean } | null;
      if (!result?.ok) throw new Error("Edit failed: invalid response from server");

      toast({
        title: "Pack updated",
        description: result.field_tank_changed
          ? "Field tank changed and inventory moved."
          : "Pack details saved.",
      });
      setEditDialogOpen(false);
      flashSaved("edit_pack");
      queryClient.invalidateQueries({ queryKey: ["pack_detail", id] });
      queryClient.invalidateQueries({ queryKey: ["pack_lines", id] });
      queryClient.invalidateQueries({ queryKey: ["tank_map"] });
    } catch (err: any) {
      toast({
        title: "Failed to update pack",
        description: err?.message || "Unknown error",
        variant: "destructive",
      });
    } finally {
      setEditSubmitting(false);
    }
  };

  const openAddLineDialog = () => {
    setLineDialogMode("add");
    setEditingLineId(null);
    setLineSourceTankId("");
    setLineBullCatalogId("");
    setLineBullName("");
    setLineBullCode("");
    setLineUnits("");
    setLineSourceCanister("");
    setLineFieldCanister("");
    setLineDialogOpen(true);
  };

  const openEditLineDialog = (line: any) => {
    setLineDialogMode("edit");
    setEditingLineId(line.id);
    setLineSourceTankId(line.source_tank_id || "");
    setLineBullCatalogId(line.bull_catalog_id || "");
    setLineBullName(line.bull_name || "");
    setLineBullCode(line.bull_code || "");
    setLineUnits(String(line.units || ""));
    setLineSourceCanister(line.source_canister || "");
    setLineFieldCanister(line.field_canister || "");
    setLineDialogOpen(true);
  };

  const handleLineSubmit = async () => {
    if (!pack) return;
    if (!lineSourceTankId) { toast({ title: "Pick a source tank", variant: "destructive" }); return; }
    if (!lineBullName.trim()) { toast({ title: "Pick a bull", variant: "destructive" }); return; }
    const unitsNum = parseInt(lineUnits, 10);
    if (isNaN(unitsNum) || unitsNum <= 0) { toast({ title: "Units must be a positive number", variant: "destructive" }); return; }

    setLineSubmitting(true);
    const payload: Record<string, any> = {
      source_tank_id: lineSourceTankId,
      bull_catalog_id: lineBullCatalogId || null,
      bull_name: lineBullName.trim(),
      bull_code: lineBullCode.trim() || null,
      units: unitsNum,
      source_canister: lineSourceCanister.trim() || null,
      field_canister: lineFieldCanister.trim() || null,
    };
    try {

      if (lineDialogMode === "add") {
        payload.pack_id = pack.id;
        const { data, error } = await supabase.rpc("add_pack_line", { _input: payload });
        if (error) throw error;
        if (!data?.ok) throw new Error("Add failed");
        toast({ title: "Line added" });
      } else {
        payload.line_id = editingLineId;
        const { data, error } = await supabase.rpc("update_pack_line", { _input: payload });
        if (error) throw error;
        if (!data?.ok) throw new Error("Update failed");
        toast({ title: "Line updated" });
      }

      setLineDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["pack_lines", id] });
      queryClient.invalidateQueries({ queryKey: ["pack_detail", id] });
      queryClient.invalidateQueries({ queryKey: ["tank_map"] });
    } catch (err: any) {
      const msg = err?.message || "";
      if (msg.includes("belongs to a different customer") && lineDialogMode === "add") {
        setCrossCustomerConfirm(payload);
      } else {
        toast({ title: "Error", description: msg || "Unknown error", variant: "destructive" });
      }
    } finally {
      setLineSubmitting(false);
    }
  };

  const handleCrossCustomerConfirm = async () => {
    if (!crossCustomerConfirm) return;
    setLineSubmitting(true);
    try {
      const overridePayload = { ...crossCustomerConfirm, allow_cross_customer: true };
      const { data, error } = await supabase.rpc("add_pack_line", { _input: overridePayload });
      if (error) throw error;
      if (!data?.ok) throw new Error("Add failed");
      toast({ title: "Line added", description: "Cross-customer override applied." });
      setCrossCustomerConfirm(null);
      setLineDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["pack_lines", id] });
      queryClient.invalidateQueries({ queryKey: ["pack_detail", id] });
      queryClient.invalidateQueries({ queryKey: ["tank_map"] });
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Unknown error", variant: "destructive" });
    } finally {
      setLineSubmitting(false);
    }
  };

  const handleLineDelete = async () => {
    if (!lineDeleteId || !pack) return;
    setLineDeleting(true);
    try {
      const { data, error } = await supabase.rpc("delete_pack_line", { _input: { line_id: lineDeleteId } });
      if (error) throw error;
      if (!data?.ok) throw new Error("Delete failed");
      toast({ title: "Line removed", description: "Inventory restored to source tank." });
      setLineDeleteId(null);
      queryClient.invalidateQueries({ queryKey: ["pack_lines", id] });
      queryClient.invalidateQueries({ queryKey: ["pack_detail", id] });
      queryClient.invalidateQueries({ queryKey: ["tank_map"] });
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Unknown error", variant: "destructive" });
    } finally {
      setLineDeleting(false);
    }
  };

  const isPackEditable = pack?.status === "packed";

  if (isLoading) {
    return <div className="min-h-screen"><Navbar /><main className="container mx-auto px-4 py-8"><p className="text-muted-foreground">Loading…</p></main></div>;
  }
  if (!pack) {
    return <div className="min-h-screen"><Navbar /><main className="container mx-auto px-4 py-8"><p className="text-muted-foreground">Pack not found.</p></main></div>;
  }

  const trackingUrl = getTrackingUrl(pack.shipping_carrier, pack.tracking_number || "");

  const handleDeletePack = async () => {
    if (!id || !pack) return;
    setDeleting(true);
    try {
      const { data, error } = await supabase.rpc("delete_tank_pack", {
        _pack_id: id,
      });
      if (error) throw error;
      const result = data as { ok?: boolean; lines_processed?: number } | null;
      toast({
        title: "Pack deleted",
        description: result?.lines_processed
          ? `Pack removed and ${result.lines_processed} inventory line(s) restored to source tank.`
          : "Pack removed and inventory restored.",
      });
      queryClient.invalidateQueries({ queryKey: ["tank_map"] });
      navigate("/operations?tab=packing");
    } catch (err: any) {
      toast({
        title: "Failed to delete pack",
        description: err?.message || "Unknown error. Please try again or contact support.",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="container mx-auto px-4 py-8 max-w-4xl space-y-6">
        {/* Back + Header */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="gap-1.5">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            <h2 className="text-2xl font-bold font-display tracking-tight">Pack — {fieldTankName}</h2>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {/* Status badges (information) */}
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={isShipment ? "bg-blue-600/20 text-blue-400 border-blue-600/30" : isOrder ? "bg-amber-600/20 text-amber-400 border-amber-600/30" : isPickup ? "bg-violet-600/20 text-violet-400 border-violet-600/30" : "bg-teal-600/20 text-teal-400 border-teal-600/30"}>
                {isShipment ? <><Truck className="h-3 w-3 mr-1" /> Shipment</> : isOrder ? <><ClipboardList className="h-3 w-3 mr-1" /> Order</> : isPickup ? <><Package className="h-3 w-3 mr-1" /> Pickup</> : <><ClipboardList className="h-3 w-3 mr-1" /> Project</>}
              </Badge>
              <Badge variant="outline" className={STATUS_BADGE[pack.status] || "bg-muted text-muted-foreground border-border"}>
                {STATUS_LABEL[pack.status] || pack.status}
              </Badge>
            </div>

            {/* Visual divider between info badges and action buttons */}
            <div className="h-6 w-px bg-border/60" aria-hidden="true" />

            {/* Action buttons */}
            <div className="flex items-center gap-2">
            {/* Lifecycle advance buttons */}
            {pack.pack_type === "shipment" && pack.status === "packed" && (
              <Button size="sm" onClick={() => openAdvanceDialog("shipped")}>Mark Shipped</Button>
            )}
            {pack.pack_type === "shipment" && pack.status === "shipped" && (
              <Button size="sm" onClick={() => openAdvanceDialog("delivered")}>Mark Delivered</Button>
            )}
            {pack.pack_type === "shipment" && pack.status === "delivered" && (
              <Button size="sm" onClick={() => openAdvanceDialog("tank_returned")}>Mark Tank Returned</Button>
            )}
            {pack.pack_type === "pickup" && pack.status === "packed" && (
              <Button size="sm" onClick={() => openAdvanceDialog("picked_up")}>Mark Picked Up</Button>
            )}
            {pack.pack_type === "pickup" && pack.status === "picked_up" && (
              <Button size="sm" variant="outline" onClick={() => openAdvanceDialog("tank_returned")}>Mark Tank Returned</Button>
            )}
            {pack.pack_type === "order" && pack.status === "packed" && (
              <Button size="sm" onClick={() => openAdvanceDialog("picked_up")}>Mark Picked Up</Button>
            )}
            {pack.pack_type === "order" && pack.status === "picked_up" && (
              <Button size="sm" variant="outline" onClick={() => openAdvanceDialog("tank_returned")}>Mark Tank Returned</Button>
            )}
            {pack.pack_type === "project" && pack.status === "packed" && (
              <Button size="sm" onClick={() => openAdvanceDialog("in_field")}>Mark In Field</Button>
            )}
            <div className="flex items-center">
              <Button variant="outline" size="sm" onClick={openEditDialog} className="gap-1.5">
                <Pencil className="h-3.5 w-3.5" />
                Edit Pack
              </Button>
              <SavedBadge visible={recentlySaved === "edit_pack"} />
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" className="gap-1.5">
                  <Trash2 className="h-4 w-4" /> Delete Pack
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Pack</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete the pack, restore the packed semen back to the source tank,
                    mark the field tank as available again, and remove the pack's inventory ledger entries. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDeletePack}
                    disabled={deleting}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            </div>
          </div>
        </div>

        {/* Details Card */}
        <Card>
          <CardContent className="pt-6 space-y-2 text-sm">
            <div className="flex gap-2"><span className="font-semibold w-28 shrink-0">Field Tank:</span><span>{fieldTankName}</span></div>
            <div className="flex gap-2"><span className="font-semibold w-28 shrink-0">Date Packed:</span><span>{format(new Date(pack.packed_at), "MMMM d, yyyy")}</span></div>
            <div className="flex gap-2"><span className="font-semibold w-28 shrink-0">Packed By:</span><span>{pack.packed_by || "—"}</span></div>

            {/* Conditional: Project vs Shipment details */}
            {isShipment ? (
              <>
                <div className="flex gap-2"><span className="font-semibold w-28 shrink-0">Ship To:</span><span>{pack.destination_name || "—"}</span></div>
                {pack.destination_address && (
                  <div className="flex gap-2"><span className="font-semibold w-28 shrink-0">Address:</span><span>{pack.destination_address}</span></div>
                )}
                <div className="flex gap-2"><span className="font-semibold w-28 shrink-0">Carrier:</span><span>{pack.shipping_carrier || "—"}</span></div>
                <div className="flex gap-2 items-start">
                  <span className="font-semibold w-28 shrink-0">Tracking<SavedBadge visible={recentlySaved === "tracking"} /></span>
                  {editingTracking ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Select value={editCarrier} onValueChange={setEditCarrier}>
                        <SelectTrigger className="w-28 h-8 text-sm">
                          <SelectValue placeholder="Carrier" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="UPS">UPS</SelectItem>
                          <SelectItem value="FedEx">FedEx</SelectItem>
                          <SelectItem value="USPS">USPS</SelectItem>
                          <SelectItem value="Other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        className="w-48 h-8 text-sm"
                        placeholder="Tracking number"
                        value={editTrackingNumber}
                        onChange={e => setEditTrackingNumber(e.target.value)}
                      />
                      <Button size="sm" variant="outline" onClick={handleSaveTracking} disabled={savingTracking} className="gap-1 h-8">
                        {savingTracking ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Save
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingTracking(false)} className="h-8">Cancel</Button>
                    </div>
                  ) : pack.tracking_number ? (
                    <div className="flex items-center gap-2">
                      {trackingUrl ? (
                        <a href={trackingUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1">
                          {pack.tracking_number} <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <span>{pack.tracking_number}</span>
                      )}
                      {pack.shipping_carrier && <span className="text-muted-foreground">({pack.shipping_carrier})</span>}
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => { setEditCarrier(pack.shipping_carrier || ""); setEditTrackingNumber(pack.tracking_number || ""); setEditingTracking(true); }}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <Button size="sm" variant="ghost" className="h-auto p-0 text-primary hover:underline" onClick={() => { setEditCarrier(pack.shipping_carrier || ""); setEditTrackingNumber(""); setEditingTracking(true); }}>
                      <Pencil className="h-3 w-3 mr-1" /> Add tracking
                    </Button>
                  )}
                </div>
                <div className="flex gap-2 items-center">
                  <span className="font-semibold w-28 shrink-0">Tank Return:</span>
                  {pack.tank_return_expected ? (
                    <Badge variant="outline" className="bg-green-600/20 text-green-400 border-green-600/30">Expected</Badge>
                  ) : (
                    <Badge variant="outline" className="bg-amber-600/20 text-amber-400 border-amber-600/30">Not returning</Badge>
                  )}
                </div>
                <div className="flex gap-2 items-start">
                  <span className="font-semibold w-28 shrink-0">Return Track<SavedBadge visible={recentlySaved === "return_tracking"} /></span>
                  {editingReturnTracking ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Select value={editReturnCarrier} onValueChange={setEditReturnCarrier}>
                        <SelectTrigger className="w-28 h-8 text-sm">
                          <SelectValue placeholder="Carrier" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="UPS">UPS</SelectItem>
                          <SelectItem value="FedEx">FedEx</SelectItem>
                          <SelectItem value="USPS">USPS</SelectItem>
                          <SelectItem value="Other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        className="w-48 h-8 text-sm"
                        placeholder="Return tracking number"
                        value={editReturnTrackingNumber}
                        onChange={e => setEditReturnTrackingNumber(e.target.value)}
                      />
                      <Button size="sm" variant="outline" onClick={handleSaveReturnTracking} disabled={savingReturnTracking} className="gap-1 h-8">
                        {savingReturnTracking ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Save
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingReturnTracking(false)} className="h-8">Cancel</Button>
                    </div>
                  ) : (pack as any).return_tracking_number ? (
                    <div className="flex items-center gap-2">
                      {(() => {
                        const returnUrl = getTrackingUrl((pack as any).return_carrier, (pack as any).return_tracking_number || "");
                        return returnUrl ? (
                          <a href={returnUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1">
                            {(pack as any).return_tracking_number} <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          <span>{(pack as any).return_tracking_number}</span>
                        );
                      })()}
                      {(pack as any).return_carrier && <span className="text-muted-foreground">({(pack as any).return_carrier})</span>}
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => { setEditReturnCarrier((pack as any).return_carrier || ""); setEditReturnTrackingNumber((pack as any).return_tracking_number || ""); setEditingReturnTracking(true); }}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <Button size="sm" variant="ghost" className="h-auto p-0 text-primary hover:underline" onClick={() => { setEditReturnCarrier((pack as any).return_carrier || ""); setEditReturnTrackingNumber(""); setEditingReturnTracking(true); }}>
                      <Pencil className="h-3 w-3 mr-1" /> Add return tracking
                    </Button>
                  )}
                </div>
              </>
            ) : isOrder ? (
              <div className="flex gap-2 items-start"><span className="font-semibold w-28 shrink-0">Orders:</span>
                <div className="flex flex-wrap gap-1">
                  {packOrders.map((link: any) => (
                    <Badge
                      key={link.semen_order_id}
                      variant="secondary"
                      className="cursor-pointer hover:bg-secondary/80"
                      onClick={() => navigate(`/semen-orders/${link.semen_order_id}`)}
                    >
                      {(link.semen_orders as any)?.customers?.name || "Order"}{" "}
                      <ExternalLink className="h-3 w-3 ml-1 inline" />
                    </Badge>
                  ))}
                </div>
              </div>
            ) : isPickup ? (
              <>
                <div className="flex gap-2"><span className="font-semibold w-28 shrink-0">Picked up by:</span><span>{pickupCustomerName || "—"}</span></div>
                <div className="flex gap-2"><span className="font-semibold w-28 shrink-0">Pickup Date:</span><span>{format(new Date(pack.packed_at), "MMMM d, yyyy")}</span></div>
                {pack.tank_return_expected ? (
                  <div className="flex gap-2 items-center">
                    <span className="font-semibold w-28 shrink-0">Tank Return:</span>
                    <Badge variant="outline" className="bg-green-600/20 text-green-400 border-green-600/30">Expected</Badge>
                  </div>
                ) : (
                  <div className="flex gap-2 items-center">
                    <span className="font-semibold w-28 shrink-0">Tank Return:</span>
                    <Badge variant="outline" className="bg-muted text-muted-foreground border-border">Not returning</Badge>
                  </div>
                )}
                {packOrders.length > 0 && (
                  <div className="flex gap-2 items-start"><span className="font-semibold w-28 shrink-0">Orders:</span>
                    <div className="flex flex-wrap gap-1">
                      {packOrders.map((link: any) => (
                        <Badge
                          key={link.semen_order_id}
                          variant="secondary"
                          className="cursor-pointer hover:bg-secondary/80"
                          onClick={() => navigate(`/semen-orders/${link.semen_order_id}`)}
                        >
                          {link.semen_orders?.order_date ? format(new Date(link.semen_orders.order_date + "T00:00"), "MMM d, yyyy") : "Order"}{" "}
                          <ExternalLink className="h-3 w-3 ml-1 inline" />
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="flex gap-2 items-start"><span className="font-semibold w-28 shrink-0">Projects:</span>
                <div className="flex flex-wrap gap-1">
                  {projectNames.map((name: string, i: number) => (
                    <Badge key={i} variant="secondary">{name}</Badge>
                  ))}
                </div>
              </div>
            )}

            {pack.notes && <div className="flex gap-2"><span className="font-semibold w-28 shrink-0">Notes:</span><span>{pack.notes}</span></div>}
          </CardContent>
        </Card>

        {/* Pack Lines Table */}
        <div className="rounded-lg border border-border/50 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead>Source Tank</TableHead>
                <TableHead>Bull</TableHead>
                <TableHead>Bull Code</TableHead>
                <TableHead>Src Can.</TableHead>
                <TableHead>Field Can.</TableHead>
                <TableHead className="text-right">Units</TableHead>
                <TableHead className="w-[100px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {packLines.map((l: any) => {
                const billable = l.is_billable ?? false;
                const dim = "";
                return (
                <TableRow key={l.id} className="hover:bg-muted/20">
                  <TableCell className={dim}>{l.tanks?.tank_name || l.tanks?.tank_number || "—"}</TableCell>
                  <TableCell className="font-medium">
                    <span className="inline-flex items-center gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          const next = !billable;
                          const { error: lineErr } = await (supabase
                            .from("tank_pack_lines") as any)
                            .update({ is_billable: next })
                            .eq("id", l.id);
                          if (lineErr) {
                            toast({ title: "Failed to update", description: lineErr.message, variant: "destructive" });
                            return;
                          }
                          const txnUpdate = (supabase
                            .from("inventory_transactions") as any)
                            .update({ is_billable: next })
                            .eq("tank_pack_id", id)
                            .eq("transaction_type", "pack_out");
                          const { error: txnErr } = l.bull_catalog_id
                            ? await txnUpdate.eq("bull_catalog_id", l.bull_catalog_id)
                            : await txnUpdate.is("bull_catalog_id", null).eq("custom_bull_name", l.bull_name);
                          if (txnErr) {
                            toast({ title: "Failed to sync transaction", description: txnErr.message, variant: "destructive" });
                            return;
                          }
                          queryClient.invalidateQueries({ queryKey: ["pack_lines", id] });
                          toast({ title: next ? "Marked billable" : "Marked not billable" });
                        }}
                        className="shrink-0"
                        title="Click to toggle billable status"
                      >
                        {billable ? (
                          <span className="inline-flex items-center rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-0.5 text-[10px] font-medium">Billable</span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 px-2 py-0.5 text-[10px] font-medium">Not billable</span>
                        )}
                      </button>
                      <span className={cn("inline-flex items-center gap-1", dim)}>
                        <span>{l.bull_name}</span>
                        {l.bull_catalog_id && (
                          <button onClick={(e) => { e.stopPropagation(); setEditBullId(l.bull_catalog_id); }} className="inline-flex items-center text-muted-foreground hover:text-foreground transition-colors" title="Edit bull info">
                            <Pencil className="h-3 w-3" />
                          </button>
                        )}
                      </span>
                    </span>
                  </TableCell>
                  <TableCell className={dim}>{l.bull_code || "—"}</TableCell>
                  <TableCell className={dim}>{l.source_canister || "—"}</TableCell>
                  <TableCell className={dim}>{l.field_canister || "—"}</TableCell>
                  <TableCell className={cn("text-right", dim)}>{l.units}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => generateTankLabelPdf(l.bull_name, l.units)}
                        title="Print tank label"
                        disabled={!l.bull_name || !l.units}
                      >
                        <Printer className="h-3.5 w-3.5" />
                      </Button>
                      {isPackEditable && (
                        <>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditLineDialog(l)} title="Edit line">
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setLineDeleteId(l.id)} title="Delete line">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
                );
              })}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={6} className="text-right font-semibold">Total</TableCell>
                <TableCell className="text-right font-bold">{totalPackedUnits}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>

        {isPackEditable && (
          <div className="flex justify-start">
            <Button variant="outline" size="sm" onClick={openAddLineDialog} className="gap-1.5">
              <Package className="h-3.5 w-3.5" />
              Add Line
            </Button>
          </div>
        )}
        {!isPackEditable && pack && (
          <p className="text-xs text-muted-foreground">
            Pack lines can only be edited while pack status is "packed". Current status: <span className="font-medium">{pack.status}</span>
          </p>
        )}

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2">
          <Button onClick={handlePrintSlip} className="gap-2"><FileText className="h-4 w-4" /> Print Packing Slip</Button>
          <Button variant="outline" onClick={handlePrintLabel} className="gap-2"><Tag className="h-4 w-4" /> Print Label (2×4)</Button>
          {!isShipment && (
            <Button variant="outline" onClick={handlePrintSession} className="gap-2"><ClipboardList className="h-4 w-4" /> Print Session Sheet</Button>
          )}
          {isShipment && (
            <Button variant="outline" onClick={() => window.open("https://www.ups.com/ship/guided/origin", "_blank")} className="gap-2">
              <Truck className="h-4 w-4" /> Create UPS Shipment
            </Button>
          )}
          {pack.tank_return_expected !== false && pack.status !== "unpacked" && pack.status !== "tank_returned" && pack.status !== "cancelled" && (
            <Button variant="outline" onClick={() => setCloseOutOpen(true)} className="gap-2">
              <PackageCheck className="h-4 w-4" /> Close Out
            </Button>
          )}
        </div>

        {/* Close Out Dialog */}
        <AlertDialog open={closeOutOpen} onOpenChange={setCloseOutOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Close Out Pack</AlertDialogTitle>
              <AlertDialogDescription>
                This marks the pack as complete — all semen was used in the field and the tank has been returned.
                Field tank inventory will be zeroed out and transactions logged as "used in field."
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <label className="text-sm font-medium">Return Date</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal mt-1", !closeOutDate && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {format(closeOutDate, "MMMM d, yyyy")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={closeOutDate} onSelect={(d) => d && setCloseOutDate(d)} className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <label className="text-sm font-medium">Returned By</label>
                <Input value={closeOutBy} onChange={(e) => setCloseOutBy(e.target.value)} placeholder="Who confirmed the return?" className="mt-1" />
              </div>
              <div>
                <label className="text-sm font-medium">Notes (optional)</label>
                <Textarea value={closeOutNotes} onChange={(e) => setCloseOutNotes(e.target.value)} placeholder="e.g., Tank empty, good condition" className="mt-1" />
              </div>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleCloseOut} disabled={closingOut}>
                {closingOut && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Close Out Pack
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Unpack Details (if unpacked) */}
        {pack.status === "unpacked" && (
          <>
            <Card>
              <CardHeader><CardTitle>Unpack Details</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex gap-2"><span className="font-semibold w-32 shrink-0">Date Unpacked:</span><span>{pack.unpacked_at ? format(new Date(pack.unpacked_at), "MMMM d, yyyy") : "—"}</span></div>
                <div className="flex gap-2"><span className="font-semibold w-32 shrink-0">Unpacked By:</span><span>{pack.unpacked_by || "—"}</span></div>
              </CardContent>
            </Card>

            <div className="rounded-lg border border-border/50 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead>Bull</TableHead>
                    <TableHead>Bull Code</TableHead>
                    <TableHead className="text-right">Packed</TableHead>
                    <TableHead className="text-right">Returned</TableHead>
                    <TableHead className="text-right">Used</TableHead>
                    <TableHead>Dest. Tank</TableHead>
                    <TableHead>Canister</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {unpackLines.map((ul: any) => {
                    const packed = packLines.find((pl: any) =>
                      (pl.bull_catalog_id && pl.bull_catalog_id === ul.bull_catalog_id) ||
                      (!pl.bull_catalog_id && pl.bull_name === ul.bull_name)
                    );
                    const unitsPacked = packed?.units || 0;
                    return (
                      <TableRow key={ul.id} className="hover:bg-muted/20">
                        <TableCell className="font-medium">{ul.bull_name}</TableCell>
                        <TableCell>{ul.bull_code || "—"}</TableCell>
                        <TableCell className="text-right">{unitsPacked}</TableCell>
                        <TableCell className="text-right">{ul.units_returned}</TableCell>
                        <TableCell className="text-right">{unitsPacked - ul.units_returned}</TableCell>
                        <TableCell>{ul.tanks?.tank_name || ul.tanks?.tank_number || "—"}</TableCell>
                        <TableCell>{ul.destination_canister || "—"}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={2} className="text-right font-semibold">Total</TableCell>
                    <TableCell className="text-right font-bold">{totalPackedUnits}</TableCell>
                    <TableCell className="text-right font-bold">{unpackLines.reduce((s: number, ul: any) => s + (ul.units_returned || 0), 0)}</TableCell>
                    <TableCell className="text-right font-bold">{totalPackedUnits - unpackLines.reduce((s: number, ul: any) => s + (ul.units_returned || 0), 0)}</TableCell>
                    <TableCell colSpan={2} />
                  </TableRow>
                </TableFooter>
              </Table>
            </div>

            <div className="flex">
              <Button onClick={handlePrintReturn} className="gap-2"><FileText className="h-4 w-4" /> Print Return Slip</Button>
            </div>
          </>
        )}

        {/* Close Out Details (shown when close-out has been recorded) */}
        {pack.closed_at && (
          <Card>
            <CardHeader><CardTitle>Close Out Details</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex gap-2"><span className="font-semibold w-32 shrink-0">Date Returned:</span><span>{format(new Date(pack.closed_at), "MMMM d, yyyy")}</span></div>
              <div className="flex gap-2"><span className="font-semibold w-32 shrink-0">Returned By:</span><span>{(pack as any).closed_by || "—"}</span></div>
              <div className="flex gap-2"><span className="font-semibold w-32 shrink-0">Outcome:</span><span>All semen used in field</span></div>
            </CardContent>
          </Card>
        )}

        {/* Advance lifecycle dialog */}
        <Dialog open={advanceDialogOpen} onOpenChange={setAdvanceDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Mark pack as {STATUS_LABEL[advanceTarget] || advanceTarget}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <Label className="text-sm font-medium">Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal mt-1")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {format(advanceDate, "PPP")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={advanceDate} onSelect={(d) => d && setAdvanceDate(d)} initialFocus className="pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>

              {advanceTarget === "shipped" && (
                <>
                  <div>
                    <Label className="text-sm font-medium">Carrier (optional)</Label>
                    <Input value={advanceCarrier} onChange={(e) => setAdvanceCarrier(e.target.value)} placeholder="UPS, FedEx, etc." className="mt-1" />
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Tracking number (optional)</Label>
                    <Input value={advanceTracking} onChange={(e) => setAdvanceTracking(e.target.value)} placeholder="1Z..." className="mt-1" />
                  </div>
                </>
              )}

              {advanceTarget === "picked_up" && (
                <div>
                  <Label className="text-sm font-medium">Picked up by (optional)</Label>
                  <Input value={advancePickupBy} onChange={(e) => setAdvancePickupBy(e.target.value)} placeholder="Customer name" className="mt-1" />
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAdvanceDialogOpen(false)} disabled={advancing}>Cancel</Button>
              <Button onClick={handleAdvance} disabled={advancing}>
                {advancing ? "Saving..." : "Confirm"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Line Add/Edit Dialog */}
        <Dialog open={lineDialogOpen} onOpenChange={setLineDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{lineDialogMode === "add" ? "Add Pack Line" : "Edit Pack Line"}</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-2">
              {/* Source tank picker */}
              <div className="space-y-1.5">
                <Label htmlFor="line-source-tank">Source tank</Label>
                <Popover open={lineSourceTankOpen} onOpenChange={setLineSourceTankOpen}>
                  <PopoverTrigger asChild>
                    <Button id="line-source-tank" variant="outline" role="combobox" className="w-full justify-between font-normal">
                      {(() => {
                        const t = allSourceTanks.find((x: any) => x.id === lineSourceTankId);
                        return t ? (t.tank_name ? `${t.tank_name} (#${t.tank_number})` : t.tank_number) : "Select tank…";
                      })()}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
                    <div className="p-2 border-b">
                      <Input placeholder="Search tanks…" value={lineSourceTankSearch} onChange={(e) => setLineSourceTankSearch(e.target.value)} className="h-8" />
                    </div>
                    <div className="max-h-60 overflow-y-auto">
                      {allSourceTanks
                        .filter((t: any) => lineDialogMode === "edit" || t.location_status === "here")
                        .filter((t: any) => {
                          const q = lineSourceTankSearch.toLowerCase();
                          if (!q) return true;
                          return (t.tank_name || "").toLowerCase().includes(q) || (t.tank_number || "").toLowerCase().includes(q);
                        })
                        .map((t: any) => (
                          <button
                            key={t.id}
                            type="button"
                            className={cn("w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center gap-2", lineSourceTankId === t.id && "bg-accent")}
                            onClick={() => {
                              setLineSourceTankId(t.id);
                              setLineSourceTankOpen(false);
                              setLineSourceTankSearch("");
                              if (lineDialogMode === "add") {
                                setLineBullCatalogId("");
                                setLineBullName("");
                                setLineBullCode("");
                                setLineSourceCanister("");
                              }
                            }}
                          >
                            {lineSourceTankId === t.id && <Check className="h-4 w-4" />}
                            <span>{t.tank_name ? `${t.tank_name} (#${t.tank_number})` : t.tank_number}</span>
                          </button>
                        ))}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              {/* Bull picker */}
              <div className="space-y-1.5">
                <Label htmlFor="line-bull">Bull</Label>
                <Popover open={lineBullOpen} onOpenChange={setLineBullOpen}>
                  <PopoverTrigger asChild>
                    <Button id="line-bull" variant="outline" role="combobox" className="w-full justify-between font-normal" disabled={!lineSourceTankId}>
                      {lineBullName || (lineSourceTankId ? "Select bull from this tank's inventory…" : "Pick a source tank first")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
                    <div className="p-2 border-b">
                      <Input placeholder="Search bulls in this tank…" value={lineBullSearch} onChange={(e) => setLineBullSearch(e.target.value)} className="h-8" />
                    </div>
                    <div className="max-h-60 overflow-y-auto">
                      {sourceTankInventory.length === 0 ? (
                        <div className="px-3 py-4 text-sm text-muted-foreground text-center">
                          {lineSourceTankId ? "No inventory in this tank" : "Pick a source tank first"}
                        </div>
                      ) : (
                        sourceTankInventory
                          .filter((inv: any) => {
                            const q = lineBullSearch.toLowerCase();
                            if (!q) return true;
                            const name = (inv.bulls_catalog?.bull_name || inv.custom_bull_name || "").toLowerCase();
                            const code = (inv.bull_code || "").toLowerCase();
                            return name.includes(q) || code.includes(q);
                          })
                          .map((inv: any) => {
                            const displayName = getBullDisplayName(inv);
                            return (
                              <button
                                key={inv.id}
                                type="button"
                                className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center justify-between gap-2"
                                onClick={() => {
                                  setLineBullCatalogId(inv.bull_catalog_id || "");
                                  setLineBullName(displayName);
                                  setLineBullCode(inv.bull_code || "");
                                  setLineSourceCanister(inv.canister || "");
                                  setLineBullOpen(false);
                                  setLineBullSearch("");
                                }}
                              >
                                <span className="flex flex-col">
                                  <span className="font-medium">{displayName}</span>
                                  <span className="text-xs text-muted-foreground">
                                    {inv.bull_code && `${inv.bull_code} · `}Canister {inv.canister || "—"}
                                  </span>
                                </span>
                                <Badge variant="outline" className="text-xs whitespace-nowrap">{inv.units} units</Badge>
                              </button>
                            );
                          })
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              {/* Units */}
              <div className="space-y-1.5">
                <Label htmlFor="line-units">Units</Label>
                <Input id="line-units" type="text" inputMode="numeric" value={lineUnits} onChange={(e) => setLineUnits(e.target.value.replace(/[^0-9]/g, ""))} placeholder="e.g. 5" />
                {lineSourceTankId && lineBullName && (() => {
                  const matched = sourceTankInventory.find((inv: any) => {
                    const n = inv.bulls_catalog?.bull_name || inv.custom_bull_name;
                    return n === lineBullName;
                  });
                  return matched ? <p className="text-xs text-muted-foreground">Available in source: {matched.units} units</p> : null;
                })()}
              </div>

              {/* Source canister */}
              <div className="space-y-1.5">
                <Label htmlFor="line-src-can">Source canister {lineSourceCanister ? "" : "(auto-fills when you pick a bull)"}</Label>
                <Input id="line-src-can" value={lineSourceCanister} onChange={(e) => setLineSourceCanister(e.target.value)} placeholder="e.g. 1" />
              </div>

              {/* Field canister */}
              <div className="space-y-1.5">
                <Label htmlFor="line-fld-can">Field canister (optional)</Label>
                <Input id="line-fld-can" value={lineFieldCanister} onChange={(e) => setLineFieldCanister(e.target.value)} placeholder="e.g. 1" />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setLineDialogOpen(false)} disabled={lineSubmitting}>Cancel</Button>
              <Button onClick={handleLineSubmit} disabled={lineSubmitting}>
                {lineSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {lineDialogMode === "add" ? "Add line" : "Save changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Line delete confirmation */}
        <AlertDialog open={!!lineDeleteId} onOpenChange={(open) => !open && setLineDeleteId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this line?</AlertDialogTitle>
              <AlertDialogDescription>
                This will remove the line from the pack and restore the units back to the source tank. The change will be logged in the inventory transaction log.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={lineDeleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => { e.preventDefault(); handleLineDelete(); }}
                disabled={lineDeleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {lineDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Delete line
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Edit Pack Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Edit Pack</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-2">
              {/* Field tank — only editable while pack is in 'packed' status */}
              <div className="space-y-1.5">
                <Label htmlFor="edit-field-tank">Field tank</Label>
                {pack && pack.status === "packed" ? (
                  <Popover open={editFieldTankOpen} onOpenChange={setEditFieldTankOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        id="edit-field-tank"
                        variant="outline"
                        role="combobox"
                        aria-expanded={editFieldTankOpen}
                        className="w-full justify-between font-normal"
                      >
                        {(() => {
                          const t = availableTanks.find((x: any) => x.id === editFieldTankId);
                          if (t) return t.tank_name ? `${t.tank_name} (#${t.tank_number})` : t.tank_number;
                          if (editFieldTankId === pack.field_tank_id) {
                            return `${fieldTankName} (current)`;
                          }
                          return "Select tank…";
                        })()}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
                      <div className="p-2 border-b">
                        <Input
                          placeholder="Search tanks…"
                          value={editFieldTankSearch}
                          onChange={(e) => setEditFieldTankSearch(e.target.value)}
                          className="h-8"
                        />
                      </div>
                      <div className="max-h-60 overflow-y-auto">
                        {availableTanks
                          .filter((t: any) => {
                            const q = editFieldTankSearch.toLowerCase();
                            if (!q) return true;
                            return (t.tank_name || "").toLowerCase().includes(q) ||
                                   (t.tank_number || "").toLowerCase().includes(q);
                          })
                          .map((t: any) => (
                            <button
                              key={t.id}
                              type="button"
                              className={cn(
                                "w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center gap-2",
                                editFieldTankId === t.id && "bg-accent"
                              )}
                              onClick={() => {
                                setEditFieldTankId(t.id);
                                setEditFieldTankOpen(false);
                                setEditFieldTankSearch("");
                              }}
                            >
                              {editFieldTankId === t.id && <Check className="h-4 w-4" />}
                              <span>{t.tank_name ? `${t.tank_name} (#${t.tank_number})` : t.tank_number}</span>
                            </button>
                          ))}
                        {availableTanks.length === 0 && (
                          <div className="px-3 py-4 text-sm text-muted-foreground text-center">
                            No available tanks (location: here, nitrogen: wet)
                          </div>
                        )}
                      </div>
                    </PopoverContent>
                  </Popover>
                ) : (
                  <div className="text-sm text-muted-foreground border rounded-md px-3 py-2 bg-muted/30">
                    Field tank can only be changed while pack status is "packed". Current status: <span className="font-medium">{pack?.status}</span>
                  </div>
                )}
              </div>

              {/* Customer */}
              <div className="space-y-1.5">
                <Label htmlFor="edit-customer">Customer (optional)</Label>
                <Select value={editCustomerId || "_none_"} onValueChange={(v) => setEditCustomerId(v === "_none_" ? "" : v)}>
                  <SelectTrigger id="edit-customer"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none_">— None (company) —</SelectItem>
                    {availableCustomers.map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Destination name */}
              <div className="space-y-1.5">
                <Label htmlFor="edit-destination">Destination name</Label>
                <Input
                  id="edit-destination"
                  value={editDestinationName}
                  onChange={(e) => setEditDestinationName(e.target.value)}
                  placeholder="e.g. ranch name, customer name, project name"
                />
              </div>

              {/* Packed by */}
              <div className="space-y-1.5">
                <Label htmlFor="edit-packed-by">Packed by</Label>
                <TeamMemberSelect
                  value={editPackedBy}
                  onValueChange={setEditPackedBy}
                  placeholder="Name of person who packed"
                />
              </div>

              {/* Packed at date */}
              <div className="space-y-1.5">
                <Label>Packed on</Label>
                <Popover open={editPackedAtOpen} onOpenChange={setEditPackedAtOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start font-normal">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {editPackedAt ? format(editPackedAt, "PPP") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={editPackedAt}
                      onSelect={(d) => { setEditPackedAt(d); setEditPackedAtOpen(false); }}
                      initialFocus
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Notes */}
              <div className="space-y-1.5">
                <Label htmlFor="edit-notes">Notes</Label>
                <Textarea
                  id="edit-notes"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  rows={3}
                  placeholder="Internal notes about this pack"
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setEditDialogOpen(false)} disabled={editSubmitting}>
                Cancel
              </Button>
              <Button onClick={handleEditSubmit} disabled={editSubmitting}>
                {editSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
      {editBullId && (
        <QuickBullEditDialog
          open={!!editBullId}
          onOpenChange={(open) => { if (!open) setEditBullId(null); }}
          bullCatalogId={editBullId}
        />
      )}
      <AlertDialog open={!!crossCustomerConfirm} onOpenChange={(open) => { if (!open) setCrossCustomerConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Different customer</AlertDialogTitle>
            <AlertDialogDescription>
              This semen belongs to a different customer than this pack. This can happen with family members or ranch partnerships sharing communal storage. Pack it anyway?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setCrossCustomerConfirm(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleCrossCustomerConfirm} disabled={lineSubmitting}>
              {lineSubmitting ? "Packing..." : "Yes, pack it"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AppFooter />
    </div>
  );
};

export default PackDetail;
