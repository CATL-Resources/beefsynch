import { useState, useMemo, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Plus, Trash2, Package, CalendarDays, Loader2, X, Search,
  Truck, ClipboardList, Printer, Check, ChevronsUpDown, Map as MapIcon, AlertTriangle,
} from "lucide-react";

import Navbar from "@/components/Navbar";
import AppFooter from "@/components/AppFooter";
import BackButton from "@/components/BackButton";
import InventoryBullPicker from "@/components/InventoryBullPicker";
import TeamMemberSelect from "@/components/TeamMemberSelect";
import { supabase } from "@/integrations/supabase/client";
import { getBullDisplayName, getBullDisplayLabel } from "@/lib/bullDisplay";
import { useOrgRole } from "@/hooks/useOrgRole";
import { useIsMobile } from "@/hooks/use-mobile";
import { generateTankLabelPdf } from "@/lib/generateTankLabelPdf";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Command, CommandInput, CommandList, CommandEmpty, CommandItem, CommandGroup,
} from "@/components/ui/command";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface PackLine {
  key: string;
  sourceTankId: string;
  bullName: string;
  bullCatalogId: string | null;
  bullCode: string | null;
  sourceCanister: string;
  fieldCanister: string;
  units: number | "";
  availableUnits: number | null;
}

const emptyLine = (): PackLine => ({
  key: crypto.randomUUID(),
  sourceTankId: "",
  bullName: "",
  bullCatalogId: null,
  bullCode: null,
  sourceCanister: "",
  fieldCanister: "",
  units: "",
  availableUnits: null,
});

const PackTank = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { orgId } = useOrgRole();
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();

  const preselectedTankId = searchParams.get("tankId") || "";
  const preselectedProjectId = searchParams.get("projectId") || "";
  const preselectedPackType = searchParams.get("packType") || "";
  const preselectedOrderId = searchParams.get("orderId") || "";

  const [packType, setPackType] = useState<"project" | "shipment" | "order" | "pickup">(
    (["project", "shipment", "order", "pickup"].includes(preselectedPackType) ? preselectedPackType : "project") as "project" | "shipment" | "order" | "pickup"
  );
  const [selectedTankId, setSelectedTankId] = useState(preselectedTankId);
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  const [packedBy, setPackedBy] = useState("");
  const [packedDate, setPackedDate] = useState<Date>(new Date());
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<PackLine[]>([emptyLine()]);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [projectSearch, setProjectSearch] = useState("");
  const [projectPopoverOpen, setProjectPopoverOpen] = useState(false);
  const [fieldTankOpen, setFieldTankOpen] = useState(false);
  const [fieldTankSearch, setFieldTankSearch] = useState("");
  const [sourcePopoverOpen, setSourcePopoverOpen] = useState<Record<number, boolean>>({});

  // Order fields
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
  const [orderPopoverOpen, setOrderPopoverOpen] = useState(false);
  const [orderSearch, setOrderSearch] = useState("");

  // Shipment fields
  const [destinationName, setDestinationName] = useState("");
  const [destinationAddress, setDestinationAddress] = useState("");
  const [shippingCarrier, setShippingCarrier] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [tankReturnExpected, setTankReturnExpected] = useState(true);

  // Pickup fields
  const [pickupCustomerId, setPickupCustomerId] = useState("");
  const [pickupCustomerSearch, setPickupCustomerSearch] = useState("");
  const [pickupCustomerOpen, setPickupCustomerOpen] = useState(false);
  const [tankReturnExpectedPickup, setTankReturnExpectedPickup] = useState(true);

  // Pickup source toggle
  const [pickupSource, setPickupSource] = useState<"inventory" | "order" | "mixed">("inventory");
  const [pickupSelectedOrders, setPickupSelectedOrders] = useState<string[]>([]);
  const [pickupOrderPopoverOpen, setPickupOrderPopoverOpen] = useState(false);
  const [pickupOrderSearch, setPickupOrderSearch] = useState("");

  // Add Tank dialog state
  const [addTankOpen, setAddTankOpen] = useState(false);
  const [newTankNumber, setNewTankNumber] = useState("");
  const [newTankName, setNewTankName] = useState("");
  const [newTankType, setNewTankType] = useState("shipper");
  const [savingTank, setSavingTank] = useState(false);

  // Auto-fill state
  const [pendingAutoFill, setPendingAutoFill] = useState<string | null>(null);
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [didPreselect, setDidPreselect] = useState(false);

  // Fetch all active tanks (for project packs)
  const { data: allActiveTanks = [] } = useQuery({
    queryKey: ["all_active_tanks", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tanks")
        .select("id, tank_name, tank_number, tank_type, nitrogen_status, location_status, customer_id")
        .eq("organization_id", orgId!)
        .eq("location_status", "here")
        .eq("nitrogen_status", "wet")
        .order("tank_number");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Auto-fill pickup customer from the selected Customer Tank's customer_id.
  // User can still override by typing or selecting a different customer.
  // Only fires on pickup packs, and only when pickupCustomerId is currently empty
  // (so we don't override a user's manual selection).
  useEffect(() => {
    if (packType !== "pickup") return;
    if (!selectedTankId) return;
    if (pickupCustomerId) return;

    const tank = (allActiveTanks).find((t: any) => t.id === selectedTankId);
    if (tank?.customer_id) {
      setPickupCustomerId(tank.customer_id);
    }
  }, [selectedTankId, packType, allActiveTanks, pickupCustomerId]);

  // Fetch shipper tanks only (for shipment packs)
  const { data: shipperTanks = [] } = useQuery({
    queryKey: ["shipper_tanks", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tanks")
        .select("id, tank_name, tank_number, tank_type, nitrogen_status, location_status")
        .eq("organization_id", orgId!)
        .eq("tank_type", "shipper")
        .eq("location_status", "here")
        .eq("nitrogen_status", "wet")
        .order("tank_number");
      if (error) throw error;
      return data ?? [];
    },
  });

  const fieldTankOptions = packType === "shipment" ? shipperTanks : allActiveTanks;

  // Fetch customers for pickup
  const { data: customers = [] } = useQuery({
    queryKey: ["customers_for_pickup", orgId],
    enabled: !!orgId && packType === "pickup",
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

  const filteredPickupCustomers = useMemo(() => {
    if (!pickupCustomerSearch) return customers;
    const q = pickupCustomerSearch.toLowerCase();
    return customers.filter((c: any) => c.name.toLowerCase().includes(q));
  }, [customers, pickupCustomerSearch]);

  // Fetch customer's open orders for pickup
  const { data: pickupAvailableOrders = [] } = useQuery({
    queryKey: ["pickup-customer-orders", orgId, pickupCustomerId],
    queryFn: async () => {
      if (!orgId || !pickupCustomerId) return [];
      const { data } = await supabase
        .from("semen_orders")
        .select("id, order_date, fulfillment_status, customer_id, customers!semen_orders_customer_id_fkey(name), semen_order_items(id, units, custom_bull_name, bull_catalog_id, bulls_catalog(bull_name))")
        .eq("organization_id", orgId)
        .eq("customer_id", pickupCustomerId)
        .not("fulfillment_status", "in", "(delivered,cancelled)")
        .order("order_date", { ascending: false })
        .limit(100);
      return data ?? [];
    },
    enabled: !!orgId && !!pickupCustomerId && (pickupSource === "order" || pickupSource === "mixed"),
  });

  const filteredPickupOrders = useMemo(() => {
    if (!pickupOrderSearch) return pickupAvailableOrders;
    const q = pickupOrderSearch.toLowerCase();
    return pickupAvailableOrders.filter((o: any) => {
      const dateStr = o.order_date ? format(new Date(o.order_date + "T00:00"), "MMM d, yyyy") : "";
      return dateStr.toLowerCase().includes(q) || ((o as any).customers?.name || "").toLowerCase().includes(q);
    });
  }, [pickupAvailableOrders, pickupOrderSearch]);

  const togglePickupOrder = (orderId: string) => {
    setPickupSelectedOrders(prev =>
      prev.includes(orderId) ? prev.filter(id => id !== orderId) : [...prev, orderId]
    );
  };

  // Fetch orders for "order" pack type
  const { data: availableOrders = [] } = useQuery({
    queryKey: ["orders-for-pack", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data } = await supabase
        .from("semen_orders")
        .select("id, order_date, fulfillment_status, customer_id, customers!semen_orders_customer_id_fkey(name), semen_order_items(id, units, custom_bull_name, bull_catalog_id, bulls_catalog(bull_name))")
        .eq("organization_id", orgId)
        .not("fulfillment_status", "in", "(delivered,cancelled)")
        .order("order_date", { ascending: false })
        .limit(200);
      return data ?? [];
    },
    enabled: !!orgId && packType === "order",
  });

  const filteredOrders = useMemo(() => {
    if (!orderSearch) return availableOrders;
    const q = orderSearch.toLowerCase();
    return availableOrders.filter((o: any) => {
      if (((o as any).customers?.name || "").toLowerCase().includes(q)) return true;
      return (o.semen_order_items || []).some((i: any) =>
        (i.bulls_catalog?.bull_name || i.custom_bull_name || "").toLowerCase().includes(q)
      );
    });
  }, [availableOrders, orderSearch]);

  // Fetch all tanks with inventory for source tank dropdown
  const { data: sourceTanks = [] } = useQuery({
    queryKey: ["source_tanks_with_inventory", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data: tanks, error } = await supabase
        .from("tanks")
        .select("id, tank_name, tank_number")
        .eq("organization_id", orgId!)
        .order("tank_number");
      if (error) throw error;
      return tanks ?? [];
    },
  });

  // Fetch projects
  const { data: projects = [] } = useQuery({
    queryKey: ["projects_for_pack", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id, name, head_count")
        .eq("organization_id", orgId!)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const filteredProjects = useMemo(() => {
    if (!projectSearch) return projects;
    const q = projectSearch.toLowerCase();
    return projects.filter((p: any) => p.name.toLowerCase().includes(q));
  }, [projects, projectSearch]);

  // Inventory summary: bull -> list of { tankName, canister, units }
  const [inventorySummary, setInventorySummary] = useState<Record<string, { bullName: string; locations: { tankName: string; canister: string; units: number }[] }>>({});
  const [projectBullUnits, setProjectBullUnits] = useState<{ bullName: string; units: number }[]>([]);

  const loadInventorySummary = async (projectId: string) => {
    if (!orgId) return;
    const [{ data: proj }, { data: projBulls, error }] = await Promise.all([
      supabase.from("projects").select("customer_id").eq("id", projectId).maybeSingle(),
      supabase
        .from("project_bulls")
        .select("bull_catalog_id, custom_bull_name, units, semen_source, bulls_catalog(bull_name, naab_code)")
        .eq("project_id", projectId),
    ]);
    if (error || !projBulls) return;
    const projCustomerId = (proj as any)?.customer_id ?? null;

    const summary: Record<string, { bullName: string; locations: { tankName: string; canister: string; units: number }[] }> = {};

    for (const pb of projBulls) {
      const bullName = getBullDisplayName(pb as any);
      const bullKey = (pb as any).bull_catalog_id || bullName;
      const isCustomerSupplied = (pb as any).semen_source === "customer";

      let q = supabase
        .from("tank_inventory")
        .select("canister, units, customer_id, tanks!inner(tank_name, tank_number)")
        .eq("organization_id", orgId)
        .gt("units", 0)
        .order("units", { ascending: false });
      if ((pb as any).bull_catalog_id) q = q.eq("bull_catalog_id", (pb as any).bull_catalog_id);
      else q = q.eq("custom_bull_name", bullName);
      if (isCustomerSupplied && projCustomerId) {
        q = q.eq("customer_id", projCustomerId);
      } else {
        q = q.is("customer_id", null);
      }
      const { data } = await q;
      const invRows = data ?? [];

      summary[bullKey] = {
        bullName,
        locations: invRows.map((r: any) => ({
          tankName: r.tanks?.tank_name || `Tank #${r.tanks?.tank_number}` || "Unknown Tank",
          canister: r.canister,
          units: r.units,
        })),
      };
    }
    setInventorySummary(summary);

    const bullUnitsList = (projBulls ?? []).map((b: any) => ({
      bullName: getBullDisplayName(b),
      units: b.units ?? 0,
    }));
    setProjectBullUnits(bullUnitsList);
  };

  // Auto-fill from project bulls
  const autoFillFromProject = async (projectId: string) => {
    if (!orgId) return;

    const [{ data: proj }, { data: projBulls, error }] = await Promise.all([
      supabase.from("projects").select("customer_id").eq("id", projectId).maybeSingle(),
      supabase
        .from("project_bulls")
        .select("bull_catalog_id, custom_bull_name, units, semen_source, bulls_catalog(bull_name, naab_code)")
        .eq("project_id", projectId),
    ]);

    if (error || !projBulls || projBulls.length === 0) {
      toast({ title: "No bulls found", description: "This project has no bulls assigned.", variant: "destructive" });
      return;
    }
    const projCustomerId = (proj as any)?.customer_id ?? null;

    const newLines: PackLine[] = [];

    // Helper: pick the best source row for a bull, scoped to either company stock
    // (semen_source = 'company') or the project customer's own stock (semen_source = 'customer').
    const pickSource = async (
      column: "bull_catalog_id" | "bull_code" | "custom_bull_name",
      value: string,
      ownership: "company" | "customer"
    ) => {
      let q = supabase
        .from("tank_inventory")
        .select("tank_id, canister, units, tanks!inner(tank_name, tank_number)")
        .eq("organization_id", orgId)
        .eq(column, value)
        .gt("units", 0)
        .order("units", { ascending: false })
        .limit(1);
      if (ownership === "customer" && projCustomerId) {
        q = q.eq("customer_id", projCustomerId);
      } else {
        q = q.is("customer_id", null);
      }
      const { data } = await q;
      return data && data.length > 0 ? data[0] : null;
    };

    for (const pb of projBulls) {
      const catalog = pb.bulls_catalog as any;
      const bullName = getBullDisplayName(pb as any);
      const bullCode = catalog?.naab_code || null;
      const bullCatalogId = pb.bull_catalog_id;
      const ownership: "company" | "customer" = (pb as any).semen_source === "customer" ? "customer" : "company";

      let bestSource: any = null;
      if (bullCatalogId) bestSource = await pickSource("bull_catalog_id", bullCatalogId, ownership);
      if (!bestSource && bullCode) bestSource = await pickSource("bull_code", bullCode, ownership);
      if (!bestSource) bestSource = await pickSource("custom_bull_name", bullName, ownership);

      newLines.push({
        key: crypto.randomUUID(),
        sourceTankId: bestSource?.tank_id || "",
        bullName,
        bullCatalogId,
        bullCode,
        sourceCanister: bestSource?.canister || "",
        fieldCanister: "",
        units: "",
        availableUnits: bestSource?.units ?? null,
      });
    }

    setLines(prev => {
      const hasContent = prev.some(l => l.bullName || l.sourceTankId || getUnits(l.units) > 0);
      return hasContent ? [...prev, ...newLines] : newLines;
    });

    toast({ title: "Lines auto-filled", description: `${newLines.length} bull(s) loaded from project.` });
    await loadInventorySummary(projectId);
  };

  // Process pending auto-fill
  useEffect(() => {
    if (pendingAutoFill && orgId) {
      autoFillFromProject(pendingAutoFill);
      setPendingAutoFill(null);
    }
  }, [pendingAutoFill, orgId]);

  // Pre-select project from URL param
  useEffect(() => {
    if (preselectedProjectId && orgId && !didPreselect) {
      setDidPreselect(true);
      setSelectedProjects([preselectedProjectId]);
      setPendingAutoFill(preselectedProjectId);
    }
  }, [preselectedProjectId, orgId, didPreselect]);

  // Pre-select order from URL param
  useEffect(() => {
    if (preselectedOrderId && orgId && packType === "order" && selectedOrders.length === 0) {
      setSelectedOrders([preselectedOrderId]);
    }
  }, [preselectedOrderId, orgId, packType]);

  // Look up the best CATL/Select inventory source location for a bull.
  // Returns the single location with the most units, or null if none.
  const findInventorySourceForBull = async (params: {
    bullCatalogId: string | null;
    bullCode: string | null;
    customBullName: string | null;
  }) => {
    if (!orgId) return null;

    let query = supabase
      .from("tank_inventory")
      .select("tank_id, canister, units, owner, tanks!tank_inventory_tank_id_fkey(tank_name, tank_number)")
      .eq("organization_id", orgId)
      .is("customer_id", null)
      .gt("units", 0)
      .order("units", { ascending: false });

    if (params.bullCatalogId) {
      query = query.eq("bull_catalog_id", params.bullCatalogId);
    } else if (params.customBullName) {
      query = query.is("bull_catalog_id", null).eq("custom_bull_name", params.customBullName);
    } else if (params.bullCode) {
      query = query.eq("bull_code", params.bullCode);
    } else {
      return null;
    }

    const { data } = await query;
    if (!data || data.length === 0) return null;

    return {
      best: {
        tank_id: data[0].tank_id,
        canister: data[0].canister,
        units: data[0].units,
      },
      allLocations: (data || []).map((r) => ({
        tank_id: r.tank_id,
        tank_name: r.tanks?.tank_name || r.tanks?.tank_number || "—",
        canister: r.canister,
        units: r.units,
        owner: r.owner,
      })),
    };
  };

  // Pre-fill pack lines from selected orders
  useEffect(() => {
    if (packType !== "order" || selectedOrders.length === 0) return;

    (async () => {
      const { data: items } = await supabase
        .from("semen_order_items")
        .select("semen_order_id, bull_catalog_id, custom_bull_name, units, bulls_catalog(bull_name, naab_code)")
        .in("semen_order_id", selectedOrders);

      if (!items || items.length === 0) return;

      const bullMap = new Map<string, { bullName: string; bullCatalogId: string | null; bullCode: string | null; orderCount: number }>();
      for (const item of items) {
        const key = item.bull_catalog_id ?? `custom:${item.custom_bull_name}`;
        const existing = bullMap.get(key);
        if (existing) {
          existing.orderCount += 1;
        } else {
          bullMap.set(key, {
            bullName: getBullDisplayName(item),
            bullCatalogId: item.bull_catalog_id,
            bullCode: item.bulls_catalog?.naab_code ?? null,
            orderCount: 1,
          });
        }
      }

      // For each unique bull on the order, look up where it currently lives in
      // CATL/Select inventory (largest-units location wins).
      const bullsArray = Array.from(bullMap.values());
      const sourceLookups = await Promise.all(
        bullsArray.map((b) =>
          findInventorySourceForBull({
            bullCatalogId: b.bullCatalogId,
            bullCode: b.bullCode,
            customBullName: b.bullCatalogId ? null : b.bullName,
          })
        )
      );

      const newLines: PackLine[] = bullsArray.map((b, idx) => {
        const lookup = sourceLookups[idx];
        return {
          key: crypto.randomUUID(),
          sourceTankId: lookup?.best.tank_id ?? "",
          bullName: b.orderCount > 1 ? `${b.bullName} (from ${b.orderCount} orders)` : b.bullName,
          bullCatalogId: b.bullCatalogId,
          bullCode: b.bullCode,
          sourceCanister: lookup?.best.canister ?? "",
          fieldCanister: "",
          units: "",
          availableUnits: lookup?.best.units ?? null,
        };
      });

      setLines(newLines.length > 0 ? newLines : [emptyLine()]);
    })();
  }, [packType, selectedOrders.join(",")]);

  // Pre-fill pack lines from selected pickup orders
  useEffect(() => {
    if (packType !== "pickup" || pickupSelectedOrders.length === 0) return;
    if (pickupSource !== "order" && pickupSource !== "mixed") return;

    (async () => {
      const { data: items } = await supabase
        .from("semen_order_items")
        .select("semen_order_id, bull_catalog_id, custom_bull_name, units, bulls_catalog(bull_name, naab_code)")
        .in("semen_order_id", pickupSelectedOrders);

      if (!items || items.length === 0) return;

      const bullMap = new Map<string, { bullName: string; bullCatalogId: string | null; bullCode: string | null; totalUnits: number }>();
      for (const item of items) {
        const key = item.bull_catalog_id ?? `custom:${item.custom_bull_name}`;
        const existing = bullMap.get(key);
        if (existing) {
          existing.totalUnits += item.units || 0;
        } else {
          bullMap.set(key, {
            bullName: getBullDisplayName(item),
            bullCatalogId: item.bull_catalog_id,
            bullCode: item.bulls_catalog?.naab_code ?? null,
            totalUnits: item.units || 0,
          });
        }
      }

      const newLines: PackLine[] = Array.from(bullMap.values()).map((b) => ({
        key: crypto.randomUUID(),
        sourceTankId: "",
        bullName: b.bullName,
        bullCatalogId: b.bullCatalogId,
        bullCode: b.bullCode,
        sourceCanister: "",
        fieldCanister: "",
        units: "",
        availableUnits: null,
      }));

      setLines(prev => {
        if (pickupSource === "mixed") {
          const hasContent = prev.some(l => l.bullName || l.sourceTankId || getUnits(l.units) > 0);
          return hasContent ? [...prev, ...newLines] : newLines;
        }
        return newLines.length > 0 ? newLines : [emptyLine()];
      });
    })();
  }, [packType, pickupSelectedOrders.join(","), pickupSource]);

  const toggleProject = (projId: string) => {
    setSelectedProjects(prev => {
      const next = prev.includes(projId) ? prev.filter(id => id !== projId) : [...prev, projId];
      if (next.length > prev.length) {
        if (next.length === 1) {
          setPendingAutoFill(next[0]);
        } else {
          setShowProjectPicker(true);
        }
      }
      if (next.length === 0) {
        setInventorySummary({});
        setProjectBullUnits([]);
      }
      return next;
    });
  };

  const toggleOrder = (orderId: string) => {
    setSelectedOrders(prev =>
      prev.includes(orderId) ? prev.filter(id => id !== orderId) : [...prev, orderId]
    );
  };

  const updateLine = (index: number, updates: Partial<PackLine>) => {
    setLines(prev => prev.map((l, i) => i === index ? { ...l, ...updates } : l));
  };

  const removeLine = (index: number) => {
    setLines(prev => prev.filter((_, i) => i !== index));
  };

  // Compute remaining available units for a line, subtracting what other lines
  // have already committed from the same source tank + bull combination
  const getUnits = (u: number | ""): number => typeof u === "number" ? u : parseInt(String(u)) || 0;

  const computeAvailable = (line: PackLine, lineIndex: number): number => {
    if (line.availableUnits === null) return 0;
    const committed = lines.reduce((sum, l, i) => {
      if (i === lineIndex) return sum;
      const sameTank = l.sourceTankId === line.sourceTankId;
      const sameBull = line.bullCatalogId
        ? l.bullCatalogId === line.bullCatalogId
        : l.bullName === line.bullName;
      const sameCanister = line.sourceCanister
        ? l.sourceCanister === line.sourceCanister
        : true;
      return sameTank && sameBull && sameCanister ? sum + getUnits(l.units) : sum;
    }, 0);
    return Math.max(0, line.availableUnits - committed);
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!selectedTankId) errs.fieldTank = "Select a field tank";
    if (packType === "project") {
      if (selectedProjects.length === 0) errs.projects = "Select at least one project";
    } else if (packType === "shipment") {
      if (!destinationName.trim()) errs.destinationName = "Destination name is required";
    } else if (packType === "order") {
      if (selectedOrders.length === 0) errs.orders = "Select at least one order";
    } else if (packType === "pickup") {
      if (!pickupCustomerId) errs.pickupCustomer = "Select a customer";
    }
    lines.forEach((line, i) => {
      if (!line.sourceTankId) errs[`line_${i}_source`] = "Required";
      if (!line.bullName.trim()) errs[`line_${i}_bull`] = "Required";
      const u = getUnits(line.units);
      if (u <= 0) errs[`line_${i}_units`] = "Must be > 0";
      if (line.availableUnits !== null && u > computeAvailable(line, i)) errs[`line_${i}_units`] = `Max ${computeAvailable(line, i)} units available`;
    });
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSaveNewTank = async () => {
    if (!newTankNumber.trim() || !orgId) return;
    setSavingTank(true);
    try {
      const { data: newTank, error } = await supabase
        .from("tanks")
        .insert({
          organization_id: orgId,
          tank_number: newTankNumber.trim(),
          tank_name: newTankName.trim() || null,
          tank_type: newTankType,
          nitrogen_status: "wet",
        })
        .select()
        .single();
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["all_active_tanks"] });
      queryClient.invalidateQueries({ queryKey: ["shipper_tanks"] });
      queryClient.invalidateQueries({ queryKey: ["source_tanks_with_inventory"] });
      setSelectedTankId(newTank.id);
      setAddTankOpen(false);
      setNewTankNumber("");
      setNewTankName("");
      setNewTankType("shipper");
      toast({ title: "Tank added" });
    } catch (err: any) {
      toast({ title: "Error", description: err?.message, variant: "destructive" });
    } finally {
      setSavingTank(false);
    }
  };

  const handleSubmit = async () => {
    if (!validate() || !orgId) return;
    setSubmitting(true);

    try {
      const payload = {
        organization_id: orgId,
        pack_type: packType,
        field_tank_id: selectedTankId,
        packed_at: packedDate.toISOString(),
        packed_by: packedBy.trim() || null,
        notes: notes.trim() || null,
        destination_name: packType === "shipment" ? destinationName.trim() : null,
        destination_address: packType === "shipment" ? destinationAddress.trim() || null : null,
        shipping_carrier: packType === "shipment" ? shippingCarrier || null : null,
        tracking_number: packType === "shipment" ? trackingNumber.trim() || null : null,
        tank_return_expected:
          packType === "shipment" ? tankReturnExpected
          : packType === "pickup" ? tankReturnExpectedPickup
          : true,
        pickup_customer_id: packType === "pickup" ? pickupCustomerId : null,
        project_ids: packType === "project" ? selectedProjects : [],
        order_ids: packType === "order" ? selectedOrders : [],
        pickup_order_ids: packType === "pickup" ? pickupSelectedOrders : [],
        lines: lines.map(line => ({
          source_tank_id: line.sourceTankId,
          bull_catalog_id: line.bullCatalogId,
          bull_name: line.bullName,
          bull_code: line.bullCode,
          source_canister: line.sourceCanister || null,
          field_canister: line.fieldCanister || null,
          units: getUnits(line.units),
        })),
      };

      const { data, error } = await supabase.rpc("pack_tank", { _input: payload });
      if (error) throw error;

      const result = data as { ok?: boolean; pack_id?: string; lines_processed?: number } | null;
      if (!result?.ok || !result?.pack_id) {
        throw new Error("Pack failed: invalid response from server");
      }

      queryClient.invalidateQueries({ queryKey: ["tank_map"] });
      toast({ title: "Tank packed", description: "Packing slip ready to print." });
      navigate(`/pack/${result.pack_id}`);
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Failed to pack tank.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const TYPE_LABELS: Record<string, string> = {
    customer_tank: "Customer", inventory_tank: "Inventory", shipper: "Shipper",
    mushroom: "Mushroom", rental_tank: "Rental", communal_tank: "Communal", freeze_branding: "Freeze",
  };

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="container mx-auto px-4 py-8 max-w-4xl space-y-6">
        <BackButton />
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-2xl font-bold font-display tracking-tight">Pack Tank</h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open("/operations?tab=inventory", "_blank")}
            title="Open the Tank Map in a new tab to see where each bull is currently stored"
          >
            <MapIcon className="h-3.5 w-3.5 mr-1.5" /> Tank map
          </Button>
        </div>

        {/* Pack Type Toggle */}
        <div className="inline-flex rounded-lg border border-border/50 overflow-hidden flex-wrap">
          <button
            className={cn("flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors",
              packType === "project" ? "bg-primary text-primary-foreground" : "bg-muted/30 text-muted-foreground hover:bg-muted/50"
            )}
            onClick={() => { setPackType("project"); setSelectedTankId(""); setSelectedOrders([]); setPickupCustomerId(""); }}
          >
            <ClipboardList className="h-4 w-4" /> Project
          </button>
          <button
            className={cn("flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors",
              packType === "order" ? "bg-primary text-primary-foreground" : "bg-muted/30 text-muted-foreground hover:bg-muted/50"
            )}
            onClick={() => { setPackType("order"); setSelectedTankId(""); setSelectedProjects([]); setInventorySummary({}); setProjectBullUnits([]); setPickupCustomerId(""); }}
          >
            <ClipboardList className="h-4 w-4" /> Order
          </button>
          <button
            className={cn("flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors",
              packType === "shipment" ? "bg-primary text-primary-foreground" : "bg-muted/30 text-muted-foreground hover:bg-muted/50"
            )}
            onClick={() => { setPackType("shipment"); setSelectedTankId(""); setSelectedOrders([]); setSelectedProjects([]); setPickupCustomerId(""); }}
          >
            <Truck className="h-4 w-4" /> Shipment
          </button>
          <button
            className={cn("flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors",
              packType === "pickup" ? "bg-primary text-primary-foreground" : "bg-muted/30 text-muted-foreground hover:bg-muted/50"
            )}
            onClick={() => {
              setPackType("pickup");
              setSelectedTankId("");
              setSelectedOrders([]);
              setSelectedProjects([]);
              setInventorySummary({});
              setProjectBullUnits([]);
              setPickupCustomerId("");
              setPickupSource("inventory");
              setPickupSelectedOrders([]);
            }}
          >
            <Package className="h-4 w-4" /> Pickup
          </button>
        </div>

        {/* Section 1: Pack Details */}
        <Card>
          <CardHeader><CardTitle>Pack Details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {/* Field Tank */}
            <div className="flex items-start gap-4">
              <Label className="w-28 shrink-0 text-right pt-2">{packType === "shipment" ? "Shipper Tank *" : packType === "pickup" ? "Customer Tank *" : "Field Tank *"}</Label>
              <div className="flex items-center gap-2 flex-1">
                <div className="flex-1">
                  <Popover open={fieldTankOpen} onOpenChange={setFieldTankOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" role="combobox" aria-expanded={fieldTankOpen} className={cn("w-full justify-between font-normal", errors.fieldTank && "border-destructive", !selectedTankId && "text-muted-foreground")}>
                        {selectedTankId
                          ? (() => { const t = fieldTankOptions.find((t: any) => t.id === selectedTankId); return t ? (t.tank_name ? `${t.tank_name} (#${t.tank_number})` : t.tank_number) : "Select tank…"; })()
                          : (packType === "shipment" ? "Select shipper tank…" : packType === "pickup" ? "Select customer tank…" : "Select tank…")}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                      <Command filter={(value, search) => value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0}>
                        <CommandInput placeholder="Search tanks…" />
                        <CommandList>
                          <CommandEmpty>No tanks found.</CommandEmpty>
                          <CommandGroup heading="Your tanks">
                          {fieldTankOptions.filter((t: any) => t.tank_type !== "customer_tank").map((t: any) => {
                            const label = t.tank_name ? `${t.tank_name} (#${t.tank_number})` : t.tank_number;
                            return (
                              <CommandItem
                                key={t.id}
                                value={`${t.tank_name || ""} ${t.tank_number}`}
                                onSelect={() => { setSelectedTankId(t.id); setFieldTankOpen(false); }}
                              >
                                <Check className={cn("mr-2 h-4 w-4", selectedTankId === t.id ? "opacity-100" : "opacity-0")} />
                                {label}
                                {packType === "project" && (
                                  <Badge variant="outline" className="ml-2 text-[10px] px-1 py-0">{TYPE_LABELS[t.tank_type] || t.tank_type}</Badge>
                                )}
                              </CommandItem>
                            );
                          })}
                          </CommandGroup>
                          {fieldTankOptions.some((t: any) => t.tank_type === "customer_tank") && (
                            <CommandGroup heading="Customer tanks">
                            {fieldTankOptions.filter((t: any) => t.tank_type === "customer_tank").map((t: any) => {
                              const label = t.tank_name ? `${t.tank_name} (#${t.tank_number})` : t.tank_number;
                              return (
                                <CommandItem
                                  key={t.id}
                                  value={`${t.tank_name || ""} ${t.tank_number}`}
                                  onSelect={() => { setSelectedTankId(t.id); setFieldTankOpen(false); }}
                                >
                                  <Check className={cn("mr-2 h-4 w-4", selectedTankId === t.id ? "opacity-100" : "opacity-0")} />
                                  {label}
                                  <Badge variant="outline" className="ml-2 text-[10px] px-1 py-0">Customer</Badge>
                                </CommandItem>
                              );
                            })}
                            </CommandGroup>
                          )}
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
                <Button variant="outline" size="sm" onClick={() => setAddTankOpen(true)}>
                  <Plus className="h-4 w-4 mr-1" /> Add Tank
                </Button>
              </div>
            </div>
            {errors.fieldTank && <p className="text-xs text-destructive pl-32">{errors.fieldTank}</p>}

            {/* Project fields */}
            {packType === "project" && (
              <div className="space-y-1.5">
                <div className="flex items-start gap-4">
              <Label className="w-28 shrink-0 text-right pt-2">Projects *</Label>
              <div className="flex-1">
                <Popover open={projectPopoverOpen} onOpenChange={setProjectPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", errors.projects && "border-destructive", selectedProjects.length === 0 && "text-muted-foreground")}>
                      {selectedProjects.length === 0
                        ? "Select projects…"
                        : `${selectedProjects.length} project${selectedProjects.length > 1 ? "s" : ""} selected`}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 p-2" align="start">
                    <div className="relative mb-2">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search projects…"
                        value={projectSearch}
                        onChange={e => setProjectSearch(e.target.value)}
                        className="pl-8 h-8 text-sm"
                      />
                    </div>
                    <div className="max-h-48 overflow-y-auto space-y-1">
                      {filteredProjects.map((p: any) => (
                        <label key={p.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50 cursor-pointer text-sm">
                          <Checkbox
                            checked={selectedProjects.includes(p.id)}
                            onCheckedChange={() => toggleProject(p.id)}
                          />
                          {p.name}
                        </label>
                      ))}
                      {filteredProjects.length === 0 && (
                        <p className="text-xs text-muted-foreground px-2 py-2">No projects found.</p>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
                {errors.projects && <p className="text-xs text-destructive">{errors.projects}</p>}
                {selectedProjects.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {selectedProjects.map(pid => {
                      const proj = projects.find((p: any) => p.id === pid);
                      return (
                        <Badge key={pid} variant="secondary" className="gap-1">
                          {proj?.name || pid}
                          <X className="h-3 w-3 cursor-pointer" onClick={() => toggleProject(pid)} />
                        </Badge>
                      );
                    })}
                  </div>
                 )}
                {projectBullUnits.length > 0 && (() => {
                  const proj = projects.find((p: any) => p.id === selectedProjects[0]);
                  const headCount = proj?.head_count;
                  return (
                    <div className="mt-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm space-y-1">
                      {headCount != null && (
                        <p className="text-muted-foreground font-medium">{headCount} head</p>
                      )}
                      {projectBullUnits.map((b, i) => (
                        <div key={i} className="flex justify-between text-muted-foreground">
                          <span>{b.bullName}</span>
                          <span>{b.units} units assigned</span>
                        </div>
                      ))}
                    </div>
                  );
                })()}

                {/* Multi-project picker for auto-fill */}
                {showProjectPicker && selectedProjects.length > 1 && (
                  <Card className="mt-2">
                    <CardContent className="p-3 space-y-2">
                      <p className="text-sm text-muted-foreground">Which project should we pull the semen list from?</p>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedProjects.map(pid => {
                          const proj = projects.find((p: any) => p.id === pid);
                          return (
                            <Button
                              key={pid}
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setPendingAutoFill(pid);
                                setShowProjectPicker(false);
                              }}
                            >
                              {proj?.name || "Unknown"}
                            </Button>
                          );
                        })}
                        <Button variant="ghost" size="sm" onClick={() => setShowProjectPicker(false)}>
                          Skip
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
              </div>
            </div>
            )}

            {/* Shipment fields */}
            {packType === "shipment" && (
              <>
                <div className="flex items-start gap-4">
                  <Label className="w-28 shrink-0 text-right pt-2">Ship To *</Label>
                  <div className="flex-1">
                    <Input
                      value={destinationName}
                      onChange={e => setDestinationName(e.target.value)}
                      placeholder="Recipient name or ranch"
                      className={cn(errors.destinationName && "border-destructive")}
                    />
                    {errors.destinationName && <p className="text-xs text-destructive mt-1">{errors.destinationName}</p>}
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <Label className="w-28 shrink-0 text-right pt-2">Shipping Address</Label>
                  <div className="flex-1">
                    <Input
                      value={destinationAddress}
                      onChange={e => setDestinationAddress(e.target.value)}
                      placeholder="Full shipping address"
                    />
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <Label className="w-28 shrink-0 text-right pt-2">Carrier</Label>
                  <div className="flex-1">
                    <Select value={shippingCarrier} onValueChange={setShippingCarrier}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select carrier..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="UPS">UPS</SelectItem>
                        <SelectItem value="FedEx">FedEx</SelectItem>
                        <SelectItem value="USPS">USPS</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <Label className="w-28 shrink-0 text-right pt-2">Tracking Number</Label>
                  <div className="flex-1">
                    <Input
                      value={trackingNumber}
                      onChange={e => setTrackingNumber(e.target.value)}
                      placeholder="Enter after shipping"
                    />
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <Label className="w-28 shrink-0 text-right pt-2">Tank Return</Label>
                  <div className="flex-1 flex items-center gap-2 pt-2">
                    <Checkbox
                      checked={tankReturnExpected}
                      onCheckedChange={(checked) => setTankReturnExpected(!!checked)}
                    />
                    <Label className="cursor-pointer" onClick={() => setTankReturnExpected(!tankReturnExpected)}>
                      Tank will be returned to us
                    </Label>
                  </div>
                </div>
              </>
            )}

            {/* Order fields */}
            {packType === "order" && (
              <div className="space-y-1.5">
                <div className="flex items-start gap-4">
                  <Label className="w-28 shrink-0 text-right pt-2">Orders *</Label>
                  <div className="flex-1">
                    <Popover open={orderPopoverOpen} onOpenChange={setOrderPopoverOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn("w-full justify-start text-left font-normal", errors.orders && "border-destructive", selectedOrders.length === 0 && "text-muted-foreground")}>
                          {selectedOrders.length === 0
                            ? "Select orders…"
                            : `${selectedOrders.length} order${selectedOrders.length > 1 ? "s" : ""} selected`}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-80 p-2" align="start">
                        <div className="relative mb-2">
                          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            placeholder="Search orders…"
                            value={orderSearch}
                            onChange={e => setOrderSearch(e.target.value)}
                            className="pl-8 h-8 text-sm"
                          />
                        </div>
                        <div className="max-h-48 overflow-y-auto space-y-1">
                          {filteredOrders.map((o: any) => (
                            <label key={o.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50 cursor-pointer text-sm">
                              <Checkbox
                                checked={selectedOrders.includes(o.id)}
                                onCheckedChange={() => toggleOrder(o.id)}
                              />
                              <span className="flex-1">
                                <span className="block">
                                  {(o as any).customers?.name || "No customer"}
                                  <span className="text-muted-foreground ml-1 text-xs">
                                    {o.order_date && format(new Date(o.order_date + "T00:00"), "MMM d, yyyy")}
                                  </span>
                                </span>
                                <span className="block text-xs text-muted-foreground truncate max-w-[280px]">
                                  {(o.semen_order_items || []).map((i: any) => `${getBullDisplayLabel(i)} ×${i.units}`).join(", ") || "No items"}
                                </span>
                              </span>
                              <Badge variant="outline" className="text-[10px] px-1 py-0">{o.fulfillment_status}</Badge>
                            </label>
                          ))}
                          {filteredOrders.length === 0 && (
                            <p className="text-xs text-muted-foreground px-2 py-2">No open orders found.</p>
                          )}
                        </div>
                      </PopoverContent>
                    </Popover>
                    {errors.orders && <p className="text-xs text-destructive">{errors.orders}</p>}
                    {selectedOrders.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {selectedOrders.map(oid => {
                          const order = availableOrders.find((o: any) => o.id === oid);
                          return (
                            <Badge key={oid} variant="secondary" className="gap-1">
                              {(order as any)?.customers?.name || "Order"}
                              <X className="h-3 w-3 cursor-pointer" onClick={() => toggleOrder(oid)} />
                            </Badge>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Pickup fields */}
            {packType === "pickup" && (
              <div className="space-y-4">
                {/* Customer selector */}
                <div className="flex items-start gap-4">
                  <Label className="w-28 shrink-0 text-right pt-2">Customer *</Label>
                  <div className="flex-1">
                    <Popover open={pickupCustomerOpen} onOpenChange={setPickupCustomerOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn("w-full justify-between font-normal", errors.pickupCustomer && "border-destructive", !pickupCustomerId && "text-muted-foreground")}
                        >
                          {pickupCustomerId
                            ? customers.find((c: any) => c.id === pickupCustomerId)?.name ?? "Select customer…"
                            : "Select customer…"}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                        <Command shouldFilter={false}>
                          <CommandInput
                            placeholder="Search customers…"
                            value={pickupCustomerSearch}
                            onValueChange={setPickupCustomerSearch}
                          />
                          <CommandList>
                            <CommandEmpty>No customers found.</CommandEmpty>
                            {filteredPickupCustomers.map((c: any) => (
                              <CommandItem
                                key={c.id}
                                value={c.name}
                                onSelect={() => {
                                  setPickupCustomerId(c.id);
                                  setPickupCustomerOpen(false);
                                  setPickupCustomerSearch("");
                                  setLines([emptyLine()]);
                      setPickupSelectedOrders([]);
                      setPickupSource("inventory");
                                }}
                              >
                                <Check className={cn("mr-2 h-4 w-4", pickupCustomerId === c.id ? "opacity-100" : "opacity-0")} />
                                {c.name}
                              </CommandItem>
                            ))}
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    {errors.pickupCustomer && <p className="text-xs text-destructive mt-1">{errors.pickupCustomer}</p>}
                  </div>
                </div>

                {/* Source toggle */}
                {pickupCustomerId && (
                  <div className="flex items-start gap-4">
                    <Label className="w-28 shrink-0 text-right pt-2">Source</Label>
                    <div className="flex-1">
                      <div className="inline-flex rounded-lg border border-border/50 overflow-hidden">
                        <button
                          className={cn("px-3 py-1.5 text-xs font-medium transition-colors",
                            pickupSource === "inventory" ? "bg-primary text-primary-foreground" : "bg-muted/30 text-muted-foreground hover:bg-muted/50"
                          )}
                          onClick={() => { setPickupSource("inventory"); setPickupSelectedOrders([]); setLines([emptyLine()]); }}
                        >
                          Existing Inventory
                        </button>
                        <button
                          className={cn("px-3 py-1.5 text-xs font-medium transition-colors",
                            pickupSource === "order" ? "bg-primary text-primary-foreground" : "bg-muted/30 text-muted-foreground hover:bg-muted/50"
                          )}
                          onClick={() => { setPickupSource("order"); setPickupSelectedOrders([]); setLines([emptyLine()]); }}
                        >
                          From Order
                        </button>
                        <button
                          className={cn("px-3 py-1.5 text-xs font-medium transition-colors",
                            pickupSource === "mixed" ? "bg-primary text-primary-foreground" : "bg-muted/30 text-muted-foreground hover:bg-muted/50"
                          )}
                          onClick={() => { setPickupSource("mixed"); setPickupSelectedOrders([]); }}
                        >
                          Mixed
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Pickup order picker */}
                {pickupCustomerId && (pickupSource === "order" || pickupSource === "mixed") && (
                  <div className="flex items-start gap-4">
                    <Label className="w-28 shrink-0 text-right pt-2">Orders</Label>
                    <div className="flex-1">
                      <Popover open={pickupOrderPopoverOpen} onOpenChange={setPickupOrderPopoverOpen}>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className={cn("w-full justify-start text-left font-normal", pickupSelectedOrders.length === 0 && "text-muted-foreground")}>
                            {pickupSelectedOrders.length === 0
                              ? "Select orders…"
                              : `${pickupSelectedOrders.length} order${pickupSelectedOrders.length > 1 ? "s" : ""} selected`}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-80 p-2" align="start">
                          <div className="relative mb-2">
                            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                              placeholder="Search orders…"
                              value={pickupOrderSearch}
                              onChange={e => setPickupOrderSearch(e.target.value)}
                              className="pl-8 h-8 text-sm"
                            />
                          </div>
                          <div className="max-h-48 overflow-y-auto space-y-1">
                            {filteredPickupOrders.length === 0 ? (
                              <p className="text-xs text-muted-foreground px-2 py-2">No open orders for this customer.</p>
                            ) : filteredPickupOrders.map((o: any) => {
                              const totalUnits = (o.semen_order_items || []).reduce((s: number, item: any) => s + (item.units || 0), 0);
                              return (
                                <label key={o.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50 cursor-pointer text-sm">
                                  <Checkbox
                                    checked={pickupSelectedOrders.includes(o.id)}
                                    onCheckedChange={() => togglePickupOrder(o.id)}
                                  />
                                  <span className="flex-1">
                                    <span className="block">
                                      {o.order_date && format(new Date(o.order_date + "T00:00"), "MMM d, yyyy")}
                                      <span className="text-muted-foreground ml-1 text-xs">{totalUnits} units</span>
                                    </span>
                                    <span className="block text-xs text-muted-foreground truncate max-w-[280px]">
                                      {(o.semen_order_items || []).map((i: any) => `${getBullDisplayLabel(i)} ×${i.units}`).join(", ") || "No items"}
                                    </span>
                                  </span>
                                  <Badge variant="outline" className="text-[10px] px-1 py-0">{o.fulfillment_status}</Badge>
                                </label>
                              );
                            })}
                          </div>
                        </PopoverContent>
                      </Popover>
                      {pickupSelectedOrders.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {pickupSelectedOrders.map(oid => {
                            const order = pickupAvailableOrders.find((o: any) => o.id === oid);
                            return (
                              <Badge key={oid} variant="secondary" className="gap-1">
                                {order ? format(new Date(order.order_date + "T00:00"), "MMM d") : "Order"}
                                <X className="h-3 w-3 cursor-pointer" onClick={() => togglePickupOrder(oid)} />
                              </Badge>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Tank return checkbox */}
                <div className="flex items-start gap-4">
                  <Label className="w-28 shrink-0 text-right pt-2">Tank Return</Label>
                  <div className="flex-1 flex items-center gap-2 pt-2">
                    <Checkbox
                      checked={tankReturnExpectedPickup}
                      onCheckedChange={(checked) => setTankReturnExpectedPickup(!!checked)}
                    />
                    <Label className="cursor-pointer" onClick={() => setTankReturnExpectedPickup(!tankReturnExpectedPickup)}>
                      Tank will be returned to us
                    </Label>
                  </div>
                </div>
              </div>
            )}

            {/* Packed By */}
            <div className="flex items-center gap-4">
              <Label className="w-28 shrink-0 text-right">Packed By</Label>
              <TeamMemberSelect value={packedBy} onValueChange={setPackedBy} placeholder="Who packed this tank?" className="flex-1" />
            </div>

            {/* Date Packed */}
            <div className="flex items-center gap-4">
              <Label className="w-28 shrink-0 text-right">Date Packed</Label>
              <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="flex-1 justify-start text-left font-normal">
                    <CalendarDays className="mr-2 h-4 w-4" />
                    {format(packedDate, "PPP")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={packedDate}
                    onSelect={d => { if (d) { setPackedDate(d); setCalendarOpen(false); } }}
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Notes */}
            <div className="flex items-start gap-4">
              <Label className="w-28 shrink-0 text-right pt-2">Notes</Label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Optional notes…" className="flex-1" />
            </div>
          </CardContent>
        </Card>

        {/* Inventory Summary — project packs only */}
        {packType === "project" && selectedProjects.length > 0 && Object.keys(inventorySummary).length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base">Available in Company Inventory</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {Object.values(inventorySummary).map((bull) => (
                <div key={bull.bullName}>
                  <p className="text-sm font-semibold mb-1">{bull.bullName}</p>
                  {bull.locations.length === 0 ? (
                    <p className="text-xs text-muted-foreground pl-3">No inventory on hand</p>
                  ) : (
                    <div className="space-y-0.5 pl-3">
                      {bull.locations.map((loc, idx) => (
                        <p key={idx} className="text-xs text-muted-foreground">
                          {loc.tankName} — Canister {loc.canister} — {loc.units} units
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Section 2: Pack Lines */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Semen to Pack</CardTitle>
            <Button variant="outline" size="sm" onClick={() => setLines(prev => {
              const last = prev[prev.length - 1];
              return [...prev, {
                ...emptyLine(),
                bullName: last?.bullName || "",
                bullCatalogId: last?.bullCatalogId || null,
                bullCode: last?.bullCode || null,
                sourceTankId: last?.sourceTankId || "",
                availableUnits: last?.availableUnits ?? null,
              }];
            })}>
              <Plus className="h-4 w-4 mr-1" /> Add Line
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {packType === "order" && lines.some((l) => !l.sourceTankId && l.bullName) && (
              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 rounded-lg p-3 mb-2 flex items-start gap-3">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-900 dark:text-amber-100 space-y-0.5">
                  <p className="font-medium">Some bulls are not currently in CATL inventory.</p>
                  <p>
                    {lines
                      .filter((l) => !l.sourceTankId && l.bullName)
                      .map((l) => l.bullName)
                      .join(", ")}
                    {" "}— source tank/canister is blank on these lines. Either order from the stud, pull from a customer's own storage (manual), or skip these lines.
                  </p>
                </div>
              </div>
            )}
            {lines.map((line, i) => (
              <div key={line.key} className={cn("rounded-lg border border-border/50 p-2 space-y-2")}>
                <div className={cn("grid gap-2 items-end", isMobile ? "grid-cols-1" : "grid-cols-[2fr_70px_2.5fr_70px_80px_36px_36px]")}>
                  {/* Source Tank */}
                  <div className="space-y-1">
                    <Label className="text-xs">Source Tank</Label>
                    <Popover open={!!sourcePopoverOpen[i]} onOpenChange={v => setSourcePopoverOpen(prev => ({ ...prev, [i]: v }))}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" role="combobox" className={cn("w-full justify-between font-normal text-sm h-9", errors[`line_${i}_source`] && "border-destructive", !line.sourceTankId && "text-muted-foreground")}>
                          {line.sourceTankId
                            ? (() => { const t = sourceTanks.find((t: any) => t.id === line.sourceTankId); return t ? (t.tank_name ? `${t.tank_name} (#${t.tank_number})` : t.tank_number) : "Select…"; })()
                            : "Select tank…"}
                          <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                        <Command filter={(value, search) => value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0}>
                          <CommandInput placeholder="Search tanks…" />
                          <CommandList>
                            <CommandEmpty>No tanks found.</CommandEmpty>
                            {sourceTanks.map((t: any) => {
                              const label = t.tank_name ? `${t.tank_name} (#${t.tank_number})` : t.tank_number;
                              return (
                                <CommandItem
                                  key={t.id}
                                  value={`${t.tank_name || ""} ${t.tank_number}`}
                                  onSelect={() => { updateLine(i, { sourceTankId: t.id }); setSourcePopoverOpen(prev => ({ ...prev, [i]: false })); }}
                                >
                                  <Check className={cn("mr-2 h-4 w-4", line.sourceTankId === t.id ? "opacity-100" : "opacity-0")} />
                                  {label}
                                </CommandItem>
                              );
                            })}
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>

                  {/* Source Canister */}
                  <div className="space-y-1">
                    <Label className="text-xs">Src Can.</Label>
                    <Input
                      value={line.sourceCanister}
                      onChange={e => updateLine(i, { sourceCanister: e.target.value })}
                      placeholder="#"
                      className="text-sm h-9"
                    />
                  </div>

                  {/* Bull (from inventory) */}
                  <div className="space-y-1">
                    <Label className="text-xs">Bull</Label>
                    <div className={cn(errors[`line_${i}_bull`] && "ring-1 ring-destructive rounded-md")}>
                      <InventoryBullPicker
                        sourceTankId={line.sourceTankId}
                        organizationId={orgId}
                        value={line.bullName}
                        onChange={(updates) => updateLine(i, updates)}
                        customerId={packType === "pickup" ? pickupCustomerId || undefined : undefined}
                      />
                    </div>
                  </div>

                  {/* Field Canister */}
                  <div className="space-y-1">
                    <Label className="text-xs">Fld Can.</Label>
                    <Input
                      value={line.fieldCanister}
                      onChange={e => updateLine(i, { fieldCanister: e.target.value })}
                      placeholder="#"
                      className="text-sm h-9"
                    />
                  </div>

                  {/* Units */}
                  <div className="space-y-1 min-w-[80px]">
                    <Label className="text-xs">
                      Units
                      {line.availableUnits !== null && (
                        <span className={cn("ml-1 font-normal", getUnits(line.units) > 0 && getUnits(line.units) > line.availableUnits ? "text-destructive" : "text-muted-foreground")}>
                          ({computeAvailable(line, i)} avail.)
                        </span>
                      )}
                    </Label>
                    <Input
                      type="number"
                      min={1}
                      value={line.units}
                      onChange={e => updateLine(i, { units: e.target.value === "" ? "" : parseInt(e.target.value) || 0 })}
                      className={cn("text-sm h-9", errors[`line_${i}_units`] && "border-destructive")}
                    />
                  </div>

                  {/* Print Label */}
                  <div className={cn("flex items-end pb-0.5", isMobile && "hidden")}>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9"
                      disabled={!line.bullName || !getUnits(line.units)}
                      onClick={() => generateTankLabelPdf(line.bullName, getUnits(line.units))}
                    >
                      <Printer className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Remove */}
                  <div className="flex items-end pb-0.5">
                    {lines.length > 1 && (
                      <Button variant="ghost" size="icon" className="h-9 w-9 text-destructive hover:text-destructive" onClick={() => removeLine(i)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Submit */}
        <div className={cn("flex", isMobile ? "" : "justify-end")}>
          <Button
            onClick={handleSubmit}
            disabled={submitting}
            className={cn("gap-2", isMobile && "w-full")}
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Package className="h-4 w-4" />}
            Pack Tank
          </Button>
        </div>
      </main>
      <AppFooter />

      {/* Add Tank Dialog */}
      <Dialog open={addTankOpen} onOpenChange={setAddTankOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Tank</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Tank Number *</Label>
              <Input
                value={newTankNumber}
                onChange={e => setNewTankNumber(e.target.value)}
                placeholder="e.g. 4085"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Tank Name</Label>
              <Input
                value={newTankName}
                onChange={e => setNewTankName(e.target.value)}
                placeholder="e.g. Blue Shipper"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Tank Type</Label>
              <Select value={newTankType} onValueChange={setNewTankType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="shipper">Shipper</SelectItem>
                  <SelectItem value="customer_tank">Customer Tank</SelectItem>
                  <SelectItem value="inventory_tank">Inventory Tank</SelectItem>
                  <SelectItem value="rental_tank">Rental Tank</SelectItem>
                  <SelectItem value="communal_tank">Communal Tank</SelectItem>
                  <SelectItem value="mushroom">Mushroom</SelectItem>
                  <SelectItem value="freeze_branding">Freeze Branding</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddTankOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveNewTank} disabled={savingTank || !newTankNumber.trim()}>
              {savingTank ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PackTank;
