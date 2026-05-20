import React, { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useOrgRole } from "@/hooks/useOrgRole";
import { toast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";
import { ArrowLeft, Printer, ClipboardList, Check, Package, Trash2, Plus, Pencil, MoreVertical, Settings, CheckCircle, Download, Edit, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import Navbar from "@/components/Navbar";
import AppFooter from "@/components/AppFooter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { generateBillingSheetPdf } from "@/lib/generateBillingSheetPdf";
import { printBreedingWorksheet } from "@/lib/printBreedingWorksheet";
import { getBullDisplayName } from "@/lib/bullDisplay";
import BillingProductsSection from "@/components/billing/BillingProducts";
import ProtocolSchedule from "@/components/billing/ProtocolSchedule";
import SemenPacked from "@/components/billing/SemenPacked";
import SemenSessions from "@/components/billing/SemenSessions";
import SemenBillable from "@/components/billing/SemenBillable";
import BillingLabor from "@/components/billing/BillingLabor";
import BillingInvoices from "@/components/billing/BillingInvoices";
import InventoryDrawer from "@/components/shared/InventoryDrawer";
import NewProjectDialog from "@/components/NewProjectDialog";
import PackForProjectDialog from "@/components/billing/PackForProjectDialog";
import EditPackDialog from "@/components/billing/EditPackDialog";
import UnpackFromProjectDialog from "@/components/billing/UnpackFromProjectDialog";

import {
  BillingProduct, ProductLine, SessionLine, SessionInventoryLine, SemenLine, LaborLine,
  STATUS_COLORS, BILLING_STATUSES, STATUS_LABELS, calcUnits, formatTime12,
} from "@/components/billing/billingTypes";

/* ────────────────── component ────────────────── */

const ProjectBilling = () => {
  const { id: projectId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { orgId } = useOrgRole();

  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [projectBulls, setProjectBulls] = useState<any[]>([]);
  const [billingProducts, setBillingProducts] = useState<BillingProduct[]>([]);

  const [billingId, setBillingId] = useState<string | null>(null);
  const [billingRecord, setBillingRecord] = useState<any>(null);
  const [projectPacks, setProjectPacks] = useState<any[]>([]);
  const [packLines, setPackLines] = useState<any[]>([]);
  const [finalizing, setFinalizing] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [productLines, setProductLines] = useState<ProductLine[]>([]);
  const [sessions, setSessions] = useState<SessionLine[]>([]);
  const [sessionInventory, setSessionInventory] = useState<SessionInventoryLine[]>([]);
  const [semenLines, setSemenLines] = useState<SemenLine[]>([]);
  const [laborLines, setLaborLines] = useState<LaborLine[]>([]);

  const [editProjectOpen, setEditProjectOpen] = useState(false);
  const [packDialogOpen, setPackDialogOpen] = useState(false);
  const [editPackOpen, setEditPackOpen] = useState(false);
  const [unpackDialogOpen, setUnpackDialogOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletingProject, setDeletingProject] = useState(false);
  const [saved, setSaved] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showSaved = () => {
    setSaved(true);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => setSaved(false), 2000);
  };

  /* ── debounced save helper ── */
  const debounceRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  function debouncedSave(key: string, fn: () => PromiseLike<any>, delay = 500) {
    if (debounceRef.current[key]) clearTimeout(debounceRef.current[key]);
    debounceRef.current[key] = setTimeout(async () => {
      const { error } = await fn();
      if (error) {
        toast({ title: "Save failed", description: error.message, variant: "destructive" });
      } else {
        showSaved();
      }
    }, delay);
  }

  /* ════════════════════ DATA LOADING ════════════════════ */

  const loadData = useCallback(async () => {
    if (!projectId || !orgId) return;
    setLoading(true);

    const [projRes, eventsRes, bullsRes, productsRes] = await Promise.all([
      supabase.from("projects").select("*").eq("id", projectId).single(),
      supabase.from("protocol_events").select("*").eq("project_id", projectId).order("event_date"),
      supabase.from("project_bulls").select("*, bulls_catalog(bull_name, naab_code, registration_number, company)").eq("project_id", projectId),
      supabase.from("billing_products").select("*").eq("organization_id", orgId).eq("active", true).order("sort_order"),
    ]);

    if (projRes.error || !projRes.data) {
      toast({ title: "Error", description: "Project not found", variant: "destructive" });
      setLoading(false);
      return;
    }

    setProject(projRes.data);
    setEvents(eventsRes.data ?? []);
    setProjectBulls(bullsRes.data ?? []);
    setBillingProducts((productsRes.data ?? []) as BillingProduct[]);

    const { data: existingBilling } = await supabase
      .from("project_billing").select("*").eq("project_id", projectId).maybeSingle();

    if (existingBilling) {
      setBillingId(existingBilling.id);
      setBillingRecord(existingBilling);
      await loadBillingChildren(existingBilling.id);
    } else {
      await createBlankWithSuggestions(
        projRes.data, eventsRes.data ?? [], bullsRes.data ?? [],
        (productsRes.data ?? []) as BillingProduct[],
      );
    }

    const { data: packLinks } = await supabase
      .from("tank_pack_projects")
      .select("tank_pack_id, tank_packs(id, status, pack_type, field_tank_id, packed_at, packed_by, tanks:field_tank_id(id, tank_number, tank_name))")
      .eq("project_id", projectId!);
    const packs = (packLinks ?? []).map((pl: any) => pl.tank_packs).filter(Boolean);
    setProjectPacks(packs);

    // Load pack lines for the packed-contents table
    const firstPackId = packs[0]?.id;
    if (firstPackId) {
      const { data: lines } = await supabase
        .from("tank_pack_lines")
        .select("id, bull_catalog_id, bull_name, bull_code, field_canister, units, source_tank_id, source_canister, bulls_catalog(bull_name, naab_code)")
        .eq("tank_pack_id", firstPackId);
      setPackLines((lines as any[]) ?? []);
    } else {
      setPackLines([]);
    }

    // Auto-generate semen worksheet if pack exists + breeding sessions + no inventory rows yet
    if (existingBilling && packs.length > 0) {
      await autoGenerateSessionInventory(existingBilling.id, packs);
    }

    setLoading(false);
  }, [projectId, orgId]);

  async function loadBillingChildren(bId: string) {
    const [prodRes, sessRes, semRes, invRes, laborRes] = await Promise.all([
      supabase.from("project_billing_products").select("*").eq("billing_id", bId).order("sort_order"),
      supabase.from("project_billing_sessions").select("*").eq("billing_id", bId).order("sort_order"),
      supabase.from("project_billing_semen").select("*, bulls_catalog!project_billing_semen_bull_catalog_id_fkey(company), semen_companies!project_billing_semen_invoicing_company_id_fkey(name)").eq("billing_id", bId).order("sort_order"),
      supabase.from("project_billing_session_inventory").select("*").eq("billing_id", bId).order("sort_order"),
      supabase.from("project_billing_labor").select("*").eq("billing_id", bId).order("sort_order"),
    ]);
    setProductLines((prodRes.data ?? []) as ProductLine[]);
    setSessions((sessRes.data ?? []) as SessionLine[]);
    setSemenLines((semRes.data ?? []).map((sl: any) => ({
      ...sl,
      // Prefer the explicit invoicing company. Fall back to the catalog's
      // company label (legacy rows without invoicing_company_id).
      semen_owner: sl.semen_companies?.name ?? sl.bulls_catalog?.company ?? null,
      bulls_catalog: undefined,
      semen_companies: undefined,
    })) as SemenLine[]);
    setSessionInventory((invRes.data ?? []) as SessionInventoryLine[]);
    setLaborLines((laborRes?.data ?? []) as LaborLine[]);
    return {
      sessions: (sessRes.data ?? []) as SessionLine[],
      inventory: (invRes.data ?? []) as SessionInventoryLine[],
    };
  }

  async function autoGenerateSessionInventory(bId: string, packs: any[]) {
    // Get breeding sessions
    const { data: allSessions } = await supabase
      .from("project_billing_sessions").select("*").eq("billing_id", bId);
    const breedingSessions = (allSessions ?? []).filter((s: any) => {
      const label = (s.session_label || "").toLowerCase();
      return label.includes("breed") || label.includes("ai ") || label === "ai" || label.includes("tai");
    });
    if (breedingSessions.length === 0) return;

    // Get ALL pack lines across all packs for this project
    const packIds = packs.map((p: any) => p.id);
    const { data: packLines } = await supabase
      .from("tank_pack_lines").select("bull_catalog_id, bull_name, bull_code, field_canister, units")
      .in("tank_pack_id", packIds);
    if (!packLines || packLines.length === 0) return;

    // Build bull×canister combos with total packed units
    const comboMap = new Map<string, { bull_catalog_id: string | null; bull_name: string; bull_code: string | null; canister: string; packed_units: number }>();
    for (const pl of packLines) {
      const canister = pl.field_canister || "1";
      const bullKey = pl.bull_catalog_id || `name:${pl.bull_name}`;
      const comboKey = `${bullKey}|${canister}`;
      if (comboMap.has(comboKey)) {
        comboMap.get(comboKey)!.packed_units += pl.units;
      } else {
        comboMap.set(comboKey, {
          bull_catalog_id: pl.bull_catalog_id, bull_name: pl.bull_name,
          bull_code: pl.bull_code, canister, packed_units: pl.units,
        });
      }
    }
    const combos = Array.from(comboMap.values()).sort((a, b) => {
      const n = a.bull_name.localeCompare(b.bull_name);
      return n !== 0 ? n : a.canister.localeCompare(b.canister, undefined, { numeric: true });
    });

    // Sort breeding sessions chronologically
    const sorted = [...breedingSessions].sort((a: any, b: any) =>
      a.session_date.localeCompare(b.session_date) || (a.sort_order ?? 0) - (b.sort_order ?? 0));

    // Fetch existing session inventory rows
    const { data: existingRows } = await supabase.from("project_billing_session_inventory")
      .select("*").eq("billing_id", bId);
    const existingMap = new Map<string, any>();
    for (const row of (existingRows ?? [])) {
      // Key: bull identifier + canister + session_id
      const bullKey = row.bull_catalog_id || `name:${row.bull_name}`;
      const key = `${bullKey}|${row.canister}|${row.session_id}`;
      existingMap.set(key, row);
    }

    // Find missing combos and update changed start_units
    const toInsert: any[] = [];
    const maxSort = (existingRows ?? []).reduce((m: number, r: any) => Math.max(m, r.sort_order ?? 0), 0);
    let sortIdx = maxSort + 1;

    for (const combo of combos) {
      const bullKey = combo.bull_catalog_id || `name:${combo.bull_name}`;
      let sessIdx = 0;

      for (const sess of sorted) {
        const key = `${bullKey}|${combo.canister}|${(sess as any).id}`;
        const existing = existingMap.get(key);

        if (existing) {
          // Row exists — update start_units if packed total changed (only for first session)
          if (sessIdx === 0 && existing.start_units !== combo.packed_units) {
            await supabase.from("project_billing_session_inventory")
              .update({ start_units: combo.packed_units })
              .eq("id", existing.id);
          }
        } else {
          // Missing row — add it
          toInsert.push({
            billing_id: bId,
            session_id: (sess as any).id,
            bull_catalog_id: combo.bull_catalog_id,
            bull_name: combo.bull_name,
            bull_code: combo.bull_code,
            canister: combo.canister,
            start_units: sessIdx === 0 ? combo.packed_units : null,
            end_units: null,
            sort_order: sortIdx++,
          });
        }
        sessIdx++;
      }
    }

    // Insert any new rows
    if (toInsert.length > 0) {
      await supabase.from("project_billing_session_inventory")
        .insert(toInsert);
    }

    // Reload session inventory into state if anything changed
    if (toInsert.length > 0 || existingRows?.some((r: any) => {
      const bullKey = r.bull_catalog_id || `name:${r.bull_name}`;
      const combo = combos.find(c => (c.bull_catalog_id || `name:${c.bull_name}`) === bullKey && c.canister === r.canister);
      return combo && r.start_units !== combo.packed_units;
    })) {
      const { data: refreshed } = await supabase.from("project_billing_session_inventory")
        .select("*").eq("billing_id", bId).order("sort_order");
      setSessionInventory((refreshed ?? []) as SessionInventoryLine[]);
    }

    // Sync units_packed on semen lines from pack data
    const packedByBull = new Map<string, number>();
    for (const combo of combos) {
      const key = combo.bull_catalog_id || combo.bull_name;
      packedByBull.set(key, (packedByBull.get(key) || 0) + combo.packed_units);
    }
    const updatedSemen = semenLines.map(sl => {
      const key = sl.bull_catalog_id || sl.bull_name;
      const packed = packedByBull.get(key);
      if (packed != null && sl.units_packed !== packed) {
        return { ...sl, units_packed: packed };
      }
      return sl;
    });
    if (JSON.stringify(updatedSemen) !== JSON.stringify(semenLines)) {
      setSemenLines(updatedSemen);
      for (const sl of updatedSemen) {
        const key = sl.bull_catalog_id || sl.bull_name;
        const packed = packedByBull.get(key);
        if (packed != null && sl.id) {
          await supabase.from("project_billing_semen").update({ units_packed: packed }).eq("id", sl.id);
        }
      }
    }
  }

  /* ── Create billing with protocol-based suggestions ── */
  async function createBlankWithSuggestions(proj: any, evts: any[], bulls: any[], products: BillingProduct[]) {
    const { data: billing, error } = await supabase
      .from("project_billing")
      .insert({ project_id: proj.id, organization_id: orgId!, status: "in_process" })
      .select().single();

    if (error || !billing) {
      toast({ title: "Error creating billing sheet", description: error?.message, variant: "destructive" });
      return;
    }
    setBillingId(billing.id);
    setBillingRecord(billing);
    const bId = billing.id;

    // ── Sessions from protocol events ──
    const sessionSkip = ["return heat", "estimated calving"];
    const newSessions: Omit<SessionLine, "id">[] = evts
      .filter(e => !sessionSkip.some(s => (e.event_name || "").toLowerCase().includes(s)))
      .map((e, i) => ({
        billing_id: bId, session_date: e.event_date, session_label: e.event_name,
        time_of_day: e.event_time ? formatTime12(e.event_time) : null,
        head_count: null, crew: null, notes: null, sort_order: i,
      }));

    let insertedSessions: SessionLine[] = [];
    if (newSessions.length > 0) {
      const { data } = await supabase.from("project_billing_sessions").insert(newSessions).select();
      insertedSessions = (data ?? []) as SessionLine[];
      setSessions(insertedSessions);
    }

    // Build session lookup by date+label for linking products
    const sessionLookup = new Map<string, string>();
    for (const s of insertedSessions) {
      if (s.id) sessionLookup.set(`${s.session_date}|${s.session_label}`, s.id);
    }

    // ── Products from protocol events (zeroed out, linked to sessions) ──
    const newProducts: Omit<ProductLine, "id">[] = [];
    let sortIdx = 0;
    const getDefaultProduct = (cat: string) => products.find(p => p.product_category === cat && p.is_default);
    const getProduct = (cat: string) => products.find(p => p.product_category === cat);
    const skipEvents = ["Return Heat", "Estimated Calving", "MGA Start", "MGA End", "Bulls In"];
    const isMGA = proj.protocol?.toLowerCase().includes("mga");

    for (const evt of evts) {
      const en = (evt.event_name || "").toLowerCase();
      if (skipEvents.some(s => en.includes(s.toLowerCase()))) continue;
      const eventLabel = evt.event_name;
      const eventDate = evt.event_date;
      const sessionId = sessionLookup.get(`${eventDate}|${eventLabel}`) || null;

      const makeLine = (prod: BillingProduct, cat: string, label: string): Omit<ProductLine, "id"> => ({
        billing_id: bId, billing_product_id: prod.id, product_name: prod.product_name,
        product_category: cat, protocol_event_label: label, event_date: eventDate,
        doses: 0, doses_per_unit: prod.doses_per_unit, unit_label: prod.unit_label,
        units_calculated: 0, units_billed: 0, units_returned: 0,
        unit_price: prod.default_price, line_total: 0, sort_order: sortIdx++,
        session_id: sessionId,
      });

      if (en.includes("pgf") && en.includes("cidr insert")) {
        const pgfProd = getDefaultProduct("pgf") || getProduct("pgf");
        if (pgfProd) newProducts.push(makeLine(pgfProd, "pgf", eventLabel));
        if (!isMGA) {
          const cidrProd = getDefaultProduct("cidr") || getProduct("cidr");
          if (cidrProd) newProducts.push(makeLine(cidrProd, "cidr", eventLabel));
        }
      } else if (en.includes("cidr in") || en.includes("cidr insert")) {
        if (!isMGA) {
          const cidrProd = getDefaultProduct("cidr") || getProduct("cidr");
          if (cidrProd) newProducts.push(makeLine(cidrProd, "cidr", eventLabel));
        }
        if (en.includes("gnrh")) {
          const gnrhProd = getDefaultProduct("gnrh") || getProduct("gnrh");
          if (gnrhProd) newProducts.push(makeLine(gnrhProd, "gnrh", eventLabel));
        }
      } else if (en.includes("pgf") || en.includes("cidr out")) {
        const pgfProd = getDefaultProduct("pgf") || getProduct("pgf");
        if (pgfProd) newProducts.push(makeLine(pgfProd, "pgf", eventLabel));
        if (en.includes("cidr out") && !isMGA) {
          const patchProd = getDefaultProduct("patch") || getProduct("patch");
          if (patchProd) newProducts.push(makeLine(patchProd, "patch", eventLabel));
        }
      } else if (en.includes("gnrh")) {
        const gnrhProd = getDefaultProduct("gnrh") || getProduct("gnrh");
        if (gnrhProd) newProducts.push(makeLine(gnrhProd, "gnrh", eventLabel));
      } else if (en.includes("timed breeding") || en.includes("tai") || en.includes("breed")) {
        const gnrhProd = getDefaultProduct("gnrh") || getProduct("gnrh");
        if (gnrhProd) newProducts.push(makeLine(gnrhProd, "gnrh", "Breeding (Mass GnRH)"));
        const svcProd = getDefaultProduct("service") || getProduct("service");
        if (svcProd) newProducts.push(makeLine(svcProd, "service", eventLabel));
      }
    }

    if (newProducts.length > 0) {
      const { data: inserted } = await supabase.from("project_billing_products").insert(newProducts as any).select();
      setProductLines((inserted ?? []) as ProductLine[]);
    }

    // ── Semen from project bulls ──
    const { data: semenPackProjects } = await supabase
      .from("tank_pack_projects").select("tank_pack_id").eq("project_id", proj.id);
    const packedByBull: Record<string, number> = {};
    const companyByBull: Map<string, { id: string; name: string | null }> = new Map();
    if (semenPackProjects && semenPackProjects.length > 0) {
      const { data: semenPackLines } = await supabase
        .from("tank_pack_lines")
        .select("bull_catalog_id, bull_name, units, invoicing_company_id, semen_companies!invoicing_company_id(name)")
        .in("tank_pack_id", semenPackProjects.map(pp => pp.tank_pack_id));
      for (const pl of (semenPackLines as any[]) ?? []) {
        const key = pl.bull_catalog_id || pl.bull_name;
        packedByBull[key] = (packedByBull[key] || 0) + pl.units;
        if (pl.invoicing_company_id && !companyByBull.has(key)) {
          companyByBull.set(key, {
            id: pl.invoicing_company_id,
            name: pl.semen_companies?.name ?? null,
          });
        }
      }
    }
    const newSemen: Array<Omit<SemenLine, "id"> & { invoicing_company_id: string | null }> = bulls.map((b, i) => {
      const bullName = getBullDisplayName(b);
      const bullCode = b.bulls_catalog?.naab_code || null;
      const catalogId = b.bull_catalog_id;
      const key = catalogId || bullName;
      const packed = packedByBull[key] || 0;
      const company = companyByBull.get(key) ?? null;
      return {
        billing_id: bId, bull_catalog_id: catalogId, bull_name: bullName, bull_code: bullCode,
        units_packed: packed, units_returned: 0, units_blown: 0, units_billable: packed,
        unit_price: 0, line_total: 0, sort_order: i,
        invoicing_company_id: company?.id ?? null,
        semen_owner: company?.name ?? b.bulls_catalog?.company ?? null,
      };
    });
    if (newSemen.length > 0) {
      const newSemenForInsert = newSemen.map(({ semen_owner, ...rest }) => rest);
      const { data: inserted } = await supabase.from("project_billing_semen").insert(newSemenForInsert).select();
      // Re-attach semen_owner from our local data since the DB doesn't store it
      const withOwner = (inserted ?? []).map((row: any, i: number) => ({
        ...row,
        semen_owner: newSemen[i]?.semen_owner ?? null,
      }));
      setSemenLines(withOwner as SemenLine[]);
    }
  }

  useEffect(() => { loadData(); }, [loadData]);

  /* ── Auto-sync returned units when pack is unpacked ── */
  const unpackSyncDone = useRef(false);
  useEffect(() => {
    if (!projectPacks.length || !semenLines.length) return;
    const packStatus = projectPacks[0]?.status || null;
    const isUnpacked = packStatus === "unpacked" || packStatus === "tank_returned";
    if (isUnpacked && !unpackSyncDone.current) {
      unpackSyncDone.current = true;
      syncReturnedFromUnpack();
    }
  }, [projectPacks, semenLines]);

  async function syncReturnedFromUnpack() {
    const packIds = projectPacks.map((p) => p.id);
    const { data: unpackLines } = await supabase
      .from("tank_unpack_lines").select("bull_catalog_id, bull_name, units_returned")
      .in("tank_pack_id", packIds);
    if (!unpackLines?.length) return;

    const returnedByBull: Record<string, number> = {};
    for (const ul of unpackLines) {
      const key = (ul.bull_catalog_id as string) || ul.bull_name;
      returnedByBull[key] = (returnedByBull[key] || 0) + (ul.units_returned || 0);
    }

    const updates: Array<{ id: string; units_returned: number; units_billable: number; line_total: number }> = [];
    const updated = semenLines.map((sl) => {
      const key = sl.bull_catalog_id || sl.bull_name;
      const returned = returnedByBull[key] ?? 0;
      if (sl.units_returned !== returned) {
        const used = (sl.units_packed ?? 0) - returned;
        const billable = Math.max(0, used - (sl.units_blown ?? 0));
        const line_total = billable * (sl.unit_price ?? 0);
        if (sl.id) updates.push({ id: sl.id, units_returned: returned, units_billable: billable, line_total });
        return { ...sl, units_returned: returned, units_billable: billable, line_total };
      }
      return sl;
    });

    if (updates.length === 0) return;
    setSemenLines(updated);
    await Promise.all(updates.map((u) =>
      supabase.from("project_billing_semen").update({
        units_returned: u.units_returned, units_billable: u.units_billable, line_total: u.line_total,
      }).eq("id", u.id)
    ));
  }

  /* ── Auto-sync units_packed on semen lines from pack data ── */
  const packedSyncDone = useRef(false);
  useEffect(() => {
    if (!projectPacks.length || !semenLines.length || packedSyncDone.current) return;
    packedSyncDone.current = true;
    syncPackedFromPacks();
  }, [projectPacks, semenLines]);

  /* ── Auto-fill Arm Service qty from breeding head total ── */
  useEffect(() => {
    if (project?.status === "Invoiced") return;
    const breedingSessions = sessions.filter(s => {
      const label = (s.session_label || "").toLowerCase();
      return label.includes("breed") || label.includes("ai ") || label === "ai" || label.includes("tai");
    });
    const headTotal = breedingSessions.reduce((sum, s) => sum + (s.head_count || 0), 0);
    if (headTotal === 0) return;

    const armIdx = productLines.findIndex(p =>
      (p.product_name || "").toLowerCase().includes("arm service")
    );
    if (armIdx === -1) return;

    const current = productLines[armIdx];
    if ((current.doses || 0) !== headTotal) {
      saveProductLine(armIdx, { doses: headTotal });
    }
  }, [sessions, productLines, project?.status]);

  async function syncPackedFromPacks() {
    const packIds = projectPacks.map((p) => p.id);
    const { data: packLines } = await supabase
      .from("tank_pack_lines").select("bull_catalog_id, bull_name, units")
      .in("tank_pack_id", packIds);
    if (!packLines?.length) return;

    const packedByBull: Record<string, number> = {};
    for (const pl of packLines) {
      const key = (pl.bull_catalog_id as string) || pl.bull_name;
      packedByBull[key] = (packedByBull[key] || 0) + pl.units;
    }

    const dbUpdates: Array<{ id: string; units_packed: number; units_billable: number; line_total: number }> = [];
    const updated = semenLines.map((sl) => {
      const key = sl.bull_catalog_id || sl.bull_name;
      const packed = packedByBull[key] ?? 0;
      if (packed > 0 && sl.units_packed !== packed && sl.id) {
        // Only touch units_packed and recompute the billable/total from it.
        // units_returned is owned by the unpack flow (or manual edits) —
        // never recalculate it from packed minus used or we wipe out the
        // real returned count.
        const returned = sl.units_returned ?? 0;
        const billable = Math.max(0, packed - returned - (sl.units_blown ?? 0));
        const line_total = billable * (sl.unit_price ?? 0);
        dbUpdates.push({ id: sl.id, units_packed: packed, units_billable: billable, line_total });
        return { ...sl, units_packed: packed, units_billable: billable, line_total };
      }
      return sl;
    });

    if (dbUpdates.length === 0) return;
    setSemenLines(updated);
    await Promise.all(dbUpdates.map((u) =>
      supabase.from("project_billing_semen").update({
        units_packed: u.units_packed,
        units_billable: u.units_billable,
        line_total: u.line_total,
      }).eq("id", u.id)
    ));
  }

  /* ════════════════════ SAVE HELPERS ════════════════════ */

  function saveBillingField(field: string, value: any) {
    if (!billingId) return;
    debouncedSave(`billing-${field}`, () =>
      supabase.from("project_billing").update({ [field]: value }).eq("id", billingId)
    );
    setBillingRecord((prev: any) => ({ ...prev, [field]: value }));
  }

  function saveProductLine(idx: number, updates: Partial<ProductLine>) {
    const line = { ...productLines[idx], ...updates };
    // Never auto-overwrite units_billed. The user controls this value.
    line.line_total = (line.units_billed ?? 0) * (line.unit_price ?? 0);
    const newLines = [...productLines];
    newLines[idx] = line;
    setProductLines(newLines);
    if (line.id) {
      const { id, ...rest } = line;
      debouncedSave(`product-${id}`, () =>
        supabase.from("project_billing_products").update(rest as any).eq("id", id));
    }
  }

  function saveLaborLine(idx: number, updates: Partial<LaborLine>) {
    const line = { ...laborLines[idx], ...updates };
    const newLines = [...laborLines];
    newLines[idx] = line;
    setLaborLines(newLines);
    if (line.id) {
      const { id, ...rest } = line;
      debouncedSave(`labor-${id}`, () =>
        supabase.from("project_billing_labor").update(rest as any).eq("id", id));
    }
  }

  async function addLaborLine() {
    if (!billingId) return;
    const { data } = await supabase.from("project_billing_labor").insert({
      billing_id: billingId,
      description: "",
      labor_dates: null,
      amount: 0,
      sort_order: laborLines.length,
    }).select().single();
    if (data) setLaborLines(prev => [...prev, data as LaborLine]);
  }

  async function deleteLaborLine(idx: number) {
    const line = laborLines[idx];
    if (line?.id) {
      await supabase.from("project_billing_labor").delete().eq("id", line.id);
    }
    setLaborLines(prev => prev.filter((_, i) => i !== idx));
  }

  async function addAdditionalProduct(catalogProduct?: any) {
    if (!billingId) return;
    const { data } = await supabase.from("project_billing_products").insert({
      billing_id: billingId,
      product_name: catalogProduct?.product_name || "Custom product",
      product_category: catalogProduct?.product_category || "additional",
      billing_product_id: catalogProduct?.id || null,
      doses: 0,
      doses_per_unit: catalogProduct?.doses_per_unit || null,
      unit_label: catalogProduct?.unit_label || null,
      units_billed: null,
      unit_price: catalogProduct?.default_price || null,
      line_total: 0,
      sort_order: productLines.length,
      delivery_method: "not_yet",
    }).select().single();
    if (data) setProductLines(prev => [...prev, data as ProductLine]);
  }

  async function deleteAdditionalProductLine(idx: number) {
    const line = productLines[idx];
    if (line?.id) {
      await supabase.from("project_billing_products").delete().eq("id", line.id);
    }
    setProductLines(prev => prev.filter((_, i) => i !== idx));
  }

  function saveSessionLine(idx: number, updates: Partial<SessionLine>) {
    const line = { ...sessions[idx], ...updates };
    const newLines = [...sessions];
    newLines[idx] = line;
    setSessions(newLines);
    if (line.id) {
      const { id, ...rest } = line;
      debouncedSave(`session-${id}`, () =>
        supabase.from("project_billing_sessions").update(rest).eq("id", id));
    }
  }

  // Single-field session update. Use this from per-cell onBlur handlers so a
  // save on one column doesn't ship the whole row (which was wiping siblings
  // when React re-keyed and refired their onBlurs with stale defaults).
  async function saveSessionField(sessionId: string, field: keyof SessionLine, value: any) {
    setSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, [field]: value } : s)));
    const { error } = await supabase
      .from("project_billing_sessions")
      .update({ [field]: value })
      .eq("id", sessionId);
    if (error) {
      toast({ title: "Error saving", description: error.message, variant: "destructive" });
    } else {
      showSaved();
    }
  }

  function saveSemenLine(idx: number, updates: Partial<SemenLine>) {
    const line = { ...semenLines[idx], ...updates };
    // Only auto-calculate billable if the update did NOT explicitly set units_billable
    if (!('units_billable' in updates)) {
      line.units_billable = Math.max(0, (line.units_packed ?? 0) - (line.units_returned ?? 0) - (line.units_blown ?? 0));
    }
    line.line_total = (line.units_billable ?? 0) * (line.unit_price ?? 0);
    const newLines = [...semenLines];
    newLines[idx] = line;
    setSemenLines(newLines);
    if (line.id) {
      const { id, semen_owner, ...rest } = line;
      debouncedSave(`semen-${id}`, () =>
        supabase.from("project_billing_semen").update(rest).eq("id", id));
    }
  }

  async function saveWorksheetCell(rowId: string, field: "start_units" | "end_units" | "blown_units", value: number | null) {
    setSessionInventory(prev => prev.map(r => r.id === rowId ? { ...r, [field]: value } : r));
    const { error } = await supabase.from("project_billing_session_inventory")
      .update({ [field]: value }).eq("id", rowId);
    if (error) toast({ title: "Failed to save", description: error.message, variant: "destructive" });
  }

  /* ── Add / remove helpers ── */

  async function addBreedingSession() {
    if (!billingId) return;
    const { data } = await supabase.from("project_billing_sessions").insert({
      billing_id: billingId, session_date: format(new Date(), "yyyy-MM-dd"),
      session_label: "Breeding", session_type: "field_session",
      time_of_day: null, head_count: null, crew: null, notes: null,
      sort_order: sessions.length,
    }).select().single();
    if (data) setSessions(prev => [...prev, data as SessionLine]);
  }

  async function createCustomerPickup() {
    if (!billingId) return;
    // Create the pickup session
    const { data: sess, error: sessErr } = await supabase.from("project_billing_sessions").insert({
      billing_id: billingId, session_date: format(new Date(), "yyyy-MM-dd"),
      session_label: "Customer Pickup", session_type: "customer_pickup",
      time_of_day: null, head_count: null, crew: null, notes: null,
      sort_order: -1,
    }).select().single();
    if (sessErr || !sess) { toast({ title: "Error", description: sessErr?.message, variant: "destructive" }); return; }
    setSessions(prev => [...prev, sess as SessionLine]);

    // Pre-fill with protocol products (unique by billing_product_id, qty blank)
    // Exclude services — those aren't physical products you pick up
    const seen = new Set<string>();
    const pickupProducts: any[] = [];
    for (const p of productLines) {
      if (p.product_category === "service") continue;
      const key = p.billing_product_id || p.product_name;
      if (seen.has(key)) continue;
      seen.add(key);
      pickupProducts.push({
        billing_id: billingId, session_id: (sess as any).id,
        billing_product_id: p.billing_product_id, product_name: p.product_name,
        product_category: p.product_category, protocol_event_label: null, event_date: null,
        doses: 0, doses_per_unit: p.doses_per_unit, unit_label: p.unit_label,
        units_calculated: 0, units_billed: 0, units_returned: 0,
        unit_price: p.unit_price, line_total: 0,
        sort_order: pickupProducts.length,
      });
    }
    if (pickupProducts.length > 0) {
      const { data: inserted } = await supabase.from("project_billing_products").insert(pickupProducts).select();
      if (inserted) setProductLines(prev => [...prev, ...(inserted as ProductLine[])]);
    }
  }

  async function removeSession(idx: number) {
    const line = sessions[idx];
    if (line.id) await supabase.from("project_billing_sessions").delete().eq("id", line.id);
    setSessions(prev => prev.filter((_, i) => i !== idx));
    showSaved();
  }

  async function addProductToSession(sessionId: string) {
    if (!billingId) return;
    const defaultProd = billingProducts[0];
    const newLine: any = {
      billing_id: billingId, session_id: sessionId,
      billing_product_id: defaultProd?.id || null,
      product_name: defaultProd?.product_name || "New Product",
      product_category: defaultProd?.product_category || null,
      protocol_event_label: null, event_date: null,
      doses: 0, doses_per_unit: defaultProd?.doses_per_unit || null,
      unit_label: defaultProd?.unit_label || null,
      units_calculated: 0, units_billed: 0, units_returned: 0,
      unit_price: defaultProd?.default_price || 0, line_total: 0,
      sort_order: productLines.length,
    };
    const { data, error } = await supabase.from("project_billing_products").insert(newLine).select().single();
    if (data) setProductLines(prev => [...prev, data as ProductLine]);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
  }

  async function addProductToSessionWithProduct(sessionId: string, productId: string) {
    if (!billingId) return;
    const prod = billingProducts.find(p => p.id === productId);
    if (!prod) return;
    const newLine: any = {
      billing_id: billingId, session_id: sessionId,
      billing_product_id: prod.id,
      product_name: prod.product_name,
      product_category: prod.product_category,
      protocol_event_label: null, event_date: null,
      doses: 0, doses_per_unit: prod.doses_per_unit,
      unit_label: prod.unit_label,
      units_calculated: 0, units_billed: 0, units_returned: 0,
      unit_price: prod.default_price || 0,
      line_total: 0,
      sort_order: productLines.length,
    };
    const { data, error } = await supabase
      .from("project_billing_products").insert(newLine).select().single();
    if (data) setProductLines(prev => [...prev, data as ProductLine]);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
  }

  async function addMiscProduct(sessionId: string) {
    if (!billingId) return;
    const newLine: any = {
      billing_id: billingId, session_id: sessionId,
      billing_product_id: null, product_name: "Miscellaneous",
      product_category: null, protocol_event_label: null, event_date: null,
      doses: 0, doses_per_unit: null, unit_label: null,
      units_calculated: 0, units_billed: 0, units_returned: 0,
      unit_price: 0, line_total: 0, sort_order: productLines.length,
    };
    const { data, error } = await supabase.from("project_billing_products").insert(newLine).select().single();
    if (data) setProductLines(prev => [...prev, data as ProductLine]);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
  }

  async function removeProductLine(idx: number) {
    const line = productLines[idx];
    if (line.id) await supabase.from("project_billing_products").delete().eq("id", line.id);
    setProductLines(prev => prev.filter((_, i) => i !== idx));
    showSaved();
  }

  function swapProduct(idx: number, newProductId: string) {
    const prod = billingProducts.find(p => p.id === newProductId);
    if (!prod) return;
    saveProductLine(idx, {
      billing_product_id: prod.id, product_name: prod.product_name,
      product_category: prod.product_category, doses_per_unit: prod.doses_per_unit,
      unit_label: prod.unit_label, unit_price: prod.default_price,
    });
  }

  function toggleProductInvoiced(idx: number) {
    const nowInvoiced = !productLines[idx].invoiced;
    saveProductLine(idx, { invoiced: nowInvoiced, invoiced_at: nowInvoiced ? new Date().toISOString() : null });
  }
  function toggleSemenInvoiced(idx: number) {
    const nowInvoiced = !semenLines[idx].invoiced;
    saveSemenLine(idx, { invoiced: nowInvoiced, invoiced_at: nowInvoiced ? new Date().toISOString() : null });
  }

  async function markBillingInvoiced() {
    if (!billingId) return;
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("project_billing")
      .update({ status: "invoiced_closed", billing_completed_at: now })
      .eq("id", billingId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    setBillingRecord((prev: any) => ({ ...prev, status: "invoiced_closed", billing_completed_at: now }));
    setProject((prev: any) => prev ? { ...prev, status: "Invoiced" } : prev);
    toast({ title: "Marked invoiced & closed" });
  }

  async function revertBillingInvoiced() {
    if (!billingId || !projectId) return;
    if (!window.confirm("Are you sure? This will move the project back to Work Complete and reopen the billing.")) return;
    const { error: bErr } = await supabase
      .from("project_billing")
      .update({ status: "work_complete", billing_completed_at: null })
      .eq("id", billingId);
    if (bErr) {
      toast({ title: "Error", description: bErr.message, variant: "destructive" });
      return;
    }
    // The trigger guards against rolling project status back from Invoiced, so do it manually.
    const { error: pErr } = await supabase
      .from("projects")
      .update({ status: "Work Complete" })
      .eq("id", projectId);
    if (pErr) {
      toast({ title: "Error", description: pErr.message, variant: "destructive" });
      return;
    }
    setBillingRecord((prev: any) => ({ ...prev, status: "work_complete", billing_completed_at: null }));
    setProject((prev: any) => prev ? { ...prev, status: "Work Complete" } : prev);
    toast({ title: "Reverted to Work Complete" });
  }

  async function closeOutProject() {
    if (!billingId) return;
    const now = new Date().toISOString();
    for (let i = 0; i < productLines.length; i++) {
      if (!productLines[i].invoiced) toggleProductInvoiced(i);
    }
    for (let i = 0; i < semenLines.length; i++) {
      if (!semenLines[i].invoiced) toggleSemenInvoiced(i);
    }
    for (const s of sessions) {
      if (s.id && !s.invoiced) {
        await supabase.from("project_billing_sessions").update({
          invoiced: true, invoiced_at: now,
        }).eq("id", s.id);
      }
    }
    for (let i = 0; i < laborLines.length; i++) {
      if (!laborLines[i].invoiced) saveLaborLine(i, { invoiced: true, invoiced_at: now });
    }
    saveBillingField("status", "invoiced_closed");
  }

  /* ── Finalize inventory ── */
  async function handleFinalizeInventory() {
    if (!billingId || !orgId) return;
    setFinalizing(true);
    try {
      const { data, error } = await supabase.rpc("finalize_billing_inventory", {
        _input: { organization_id: orgId, billing_id: billingId }
      });
      if (error) throw error;
      const result = data as { ok?: boolean; bulls_processed?: number; units_consumed?: number } | null;
      if (!result?.ok) throw new Error("Finalize failed");
      toast({ title: "Inventory finalized", description: `${result.units_consumed ?? 0} units consumed across ${result.bulls_processed ?? 0} bull(s).` });
      const { data: refreshed } = await supabase.from("project_billing").select("*").eq("id", billingId).maybeSingle();
      if (refreshed) setBillingRecord(refreshed);
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Could not finalize inventory.", variant: "destructive" });
    } finally { setFinalizing(false); }
  }

  /* ── Complete project ── */
  async function handleCompleteProject() {
    if (!projectId || !billingId) return;
    setCompleting(true);
    try {
      const { error: projErr } = await supabase.from("projects").update({ status: "Work Complete" }).eq("id", projectId);
      if (projErr) throw projErr;
      const userId = (await supabase.auth.getUser()).data.user?.id || null;
      const { error: billErr } = await supabase.from("project_billing")
        .update({ billing_completed_at: new Date().toISOString(), billing_completed_by: userId })
        .eq("id", billingId);
      if (billErr) throw billErr;
      toast({ title: "Project completed" });
      setProject((prev: any) => ({ ...prev, status: "Work Complete" }));
      setBillingRecord((prev: any) => ({ ...prev, billing_completed_at: new Date().toISOString() }));
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Could not complete project.", variant: "destructive" });
    } finally { setCompleting(false); }
  }

  /* ── Print PDF ── */
  function handlePrint() {
    if (!project || !billingRecord) return;
    const productsTotal = productLines.reduce((s, l) => s + (l.line_total ?? 0), 0);
    const semenTotal = semenLines.reduce((s, l) => s + (l.line_total ?? 0), 0);
    const grandTotal = productsTotal + semenTotal;
    generateBillingSheetPdf(project, billingRecord, productLines, semenLines, {
      productsTotal, semenTotal, laborTotal: 0, grandTotal,
    });
    toast({ title: "PDF downloaded" });
  }

  async function handlePrintWorksheet() {
    if (!project) return;
    await printBreedingWorksheet(project);
    toast({ title: "Breeding worksheet downloaded" });
  }

  async function handleDeleteProject() {
    if (!projectId) return;
    setDeletingProject(true);
    const { error } = await supabase.from("projects").delete().eq("id", projectId);
    setDeletingProject(false);
    if (error) {
      toast({ title: "Could not delete project", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Project deleted", description: `${project?.name ?? "Project"} has been removed.` });
    navigate("/operations");
  }

  /* ── Auto-update AI Service qty + semen line used values from breeding ── */
  const lastTotalUsedRef = useRef<number>(0);
  function handleTotalUsedChanged(totalUsed: number, bullUsed: Map<string, number>, bullBlown: Map<string, number>) {
    if (totalUsed === lastTotalUsedRef.current) return;
    lastTotalUsedRef.current = totalUsed;
    // Update AI Service product line
    const serviceIdx = productLines.findIndex(p =>
      p.product_category === "service" || (p.product_name || "").toLowerCase().includes("service")
    );
    if (serviceIdx >= 0 && productLines[serviceIdx].doses !== totalUsed) {
      // Always update doses (the session head count).
      // Only update units_billed if the user hasn't manually overridden it —
      // i.e., current units_billed still matches the old calculated value.
      const svc = productLines[serviceIdx];
      const wasManual = svc.units_billed != null && svc.units_calculated != null
        && Math.abs(svc.units_billed - svc.units_calculated) > 0.001;
      const updates: Partial<ProductLine> = { doses: totalUsed };
      if (!wasManual) {
        updates.units_billed = totalUsed;
      }
      saveProductLine(serviceIdx, updates);
    }
    // Update semen lines with per-bull used + blown values for billing tab
    let changed = false;
    const updated = semenLines.map((sl, idx) => {
      const key = sl.bull_catalog_id || sl.bull_name;
      const used = bullUsed.get(key) ?? 0;
      const blown = bullBlown.get(key) ?? 0;
      const billable = Math.max(0, used - blown);
      const line_total = billable * (sl.unit_price ?? 0);
      if (sl.units_billable !== billable || sl.units_blown !== blown) {
        changed = true;
        if (sl.id) {
          debouncedSave(`semen-used-${sl.id}`, () =>
            supabase.from("project_billing_semen").update({
              units_returned: (sl.units_packed ?? 0) - used,
              units_blown: blown,
              units_billable: billable, line_total,
            }).eq("id", sl.id));
        }
        return { ...sl, units_returned: (sl.units_packed ?? 0) - used, units_blown: blown, units_billable: billable, line_total };
      }
      return sl;
    });
    if (changed) setSemenLines(updated);
  }

  /* ════════════════════ COMPUTED VALUES ════════════════════ */

  const currentStatus = billingRecord?.status || "in_process";
  const hasPack = projectPacks.length > 0;
  const packStatus = projectPacks[0]?.status || null;
  const isUnpacked = packStatus === "unpacked" || packStatus === "tank_returned";
  const readOnly = project?.status === "Invoiced";

  const totalLines = productLines.length + semenLines.length + sessions.length + laborLines.length;
  const allInvoiced = totalLines > 0 && [
    ...productLines.map(l => l.invoiced),
    ...semenLines.map(l => l.invoiced),
    ...sessions.map(l => l.invoiced),
    ...laborLines.map(l => l.invoiced),
  ].every(Boolean);

  const firstPack: any = projectPacks[0] || null;
  const packTankLabel = firstPack?.tanks
    ? (firstPack.tanks.tank_name || firstPack.tanks.tank_number || "") : "";

  /* ════════════════════ RENDER ════════════════════ */

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="flex items-center justify-center py-32">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="max-w-4xl mx-auto px-4 py-12 text-center">
          <p className="text-muted-foreground">Project not found.</p>
          <Button className="mt-4" onClick={() => navigate("/operations")}>Back to Dashboard</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-5">

        {/* ── Header card ── */}
        <Card>
          <CardContent className="p-4 flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <Button variant="ghost" size="icon" onClick={() => navigate(`/project/${projectId}`)} className="shrink-0">
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  {project.protocol && (
                    <Badge variant="outline" className="bg-primary/20 text-primary border-primary/30 text-xs">
                      {project.protocol}
                    </Badge>
                  )}
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[currentStatus] || "bg-muted text-muted-foreground"}`}>
                    {STATUS_LABELS[currentStatus] || currentStatus}
                  </span>
                  {currentStatus === "work_complete" && (
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={markBillingInvoiced}>
                      Mark Invoiced
                    </Button>
                  )}
                  {currentStatus === "invoiced_closed" && (
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={revertBillingInvoiced}>
                      Revert to Work Complete
                    </Button>
                  )}
                </div>
                <h1 className="text-[20px] font-medium leading-tight truncate">{project.name}</h1>
                <p className="text-[13px] text-muted-foreground mt-0.5">
                  {[
                    project.cattle_type,
                    project.head_count != null ? `${project.head_count} head` : null,
                    project.breeding_date ? format(parseISO(project.breeding_date), "MMM d, yyyy") : null,
                  ].filter(Boolean).join(" · ")}
                </p>
                {hasPack && firstPack?.tanks && (
                  <p className="text-[13px] text-muted-foreground mt-0.5">
                    Field tank: <span className="font-medium text-foreground">
                      {firstPack.tanks.tank_name
                        ? `${firstPack.tanks.tank_name} (#${firstPack.tanks.tank_number})`
                        : `Tank #${firstPack.tanks.tank_number}`}
                    </span>
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {hasPack && packStatus !== "unpacked" && packStatus !== "cancelled" && (
                <Button
                  size="sm"
                  variant="destructive"
                  className="h-9"
                  onClick={() => setUnpackDialogOpen(true)}
                >
                  <Package className="h-4 w-4 mr-1.5" /> Unpack tank
                </Button>
              )}
              {hasPack && (
                <Button
                  size="sm"
                  className="h-9 bg-emerald-600 hover:bg-emerald-600/90 text-white"
                  onClick={handlePrintWorksheet}
                >
                  <Printer className="h-4 w-4 mr-1.5" /> Print worksheet
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" className="h-9 w-9" aria-label="More actions">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  {hasPack && packStatus === "packed" && (
                    <DropdownMenuItem onClick={() => setEditPackOpen(true)}>
                      <Edit className="h-4 w-4 mr-2" /> Edit pack
                    </DropdownMenuItem>
                  )}
                  {hasPack && packStatus === "packed" && <DropdownMenuSeparator />}
                  <DropdownMenuItem onClick={closeOutProject}>
                    <CheckCircle className="h-4 w-4 mr-2" /> Close out
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setEditProjectOpen(true)}>
                    <Settings className="h-4 w-4 mr-2" /> Edit project
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handlePrint}>
                    <Download className="h-4 w-4 mr-2" /> Export PDF
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setDeleteConfirmOpen(true)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="h-4 w-4 mr-2" /> Delete project
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </CardContent>
        </Card>

        {/* Delete project confirmation */}
        <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete project?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete {project?.name ?? "this project"} and all associated billing data. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteProject}
                disabled={deletingProject}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deletingProject && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* ── Empty state (no pack yet) ── */}
        {!hasPack && (
          <div className="rounded-lg border-2 border-dashed border-border/60 px-4 py-8 flex flex-col items-center justify-center gap-3 text-center">
            <Package className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No tank packed for this project yet</p>
            <Button onClick={() => setPackDialogOpen(true)} className="gap-1.5">
              <Package className="h-4 w-4" /> Pack tank for this project
            </Button>
          </div>
        )}

        {projectId && billingId && (
          <div className="space-y-2">
            <ProtocolSchedule projectId={projectId} />
            <BillingProductsSection billingId={billingId} orgId={orgId} />
            <div className={hasPack ? "space-y-2" : "opacity-40 pointer-events-none space-y-2"}>
              <SemenPacked projectId={projectId} />
              <SemenSessions billingId={billingId} projectId={projectId} organizationId={orgId} />
              <SemenBillable billingId={billingId} projectId={projectId} />
            </div>
            <BillingLabor billingId={billingId} />
            <BillingInvoices
              billingId={billingId}
              onPrintWorksheet={handlePrintWorksheet}
              onCloseOut={closeOutProject}
              currentStatus={currentStatus}
            />
          </div>
        )}
      </main>

      {/* Save confirmation toast */}
      {saved && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="bg-emerald-600 text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2 text-sm font-medium">
            <Check className="h-4 w-4" /> Saved
          </div>
        </div>
      )}
      <NewProjectDialog
        open={editProjectOpen}
        onOpenChange={setEditProjectOpen}
        onProjectCreated={() => loadData()}
        editData={project ? {
          id: project.id,
          name: project.name,
          customer_id: (project as any).customer_id,
          cattle_type: project.cattle_type,
          protocol: project.protocol,
          head_count: project.head_count,
          breeding_date: project.breeding_date,
          breeding_time: project.breeding_time,
          status: project.status,
          notes: project.notes,
          last_contacted_date: project.last_contacted_date,
          last_contacted_by: project.last_contacted_by,
          bulls: projectBulls.map((b: any) => ({
            name: b.bulls_catalog ? b.bulls_catalog.bull_name : b.custom_bull_name ?? "",
            catalogId: b.bull_catalog_id,
            units: b.units,
            semenSource: b.semen_source,
          })),
        } : null}
      />
      {projectId && orgId && (
        <PackForProjectDialog
          open={packDialogOpen}
          onOpenChange={setPackDialogOpen}
          projectId={projectId}
          projectName={project?.name ?? null}
          organizationId={orgId}
          onPackComplete={() => loadData()}
        />
      )}
      {firstPack?.id && orgId && firstPack?.field_tank_id && (
        <EditPackDialog
          open={editPackOpen}
          onOpenChange={setEditPackOpen}
          packId={firstPack.id}
          organizationId={orgId}
          fieldTankId={firstPack.field_tank_id}
          onEditComplete={() => loadData()}
        />
      )}
      {firstPack?.id && orgId && firstPack?.field_tank_id && (
        <UnpackFromProjectDialog
          open={unpackDialogOpen}
          onOpenChange={setUnpackDialogOpen}
          packId={firstPack.id}
          fieldTankId={firstPack.field_tank_id}
          fieldTankLabel={packTankLabel || null}
          organizationId={orgId}
          billingId={billingId}
          projectName={project?.name ?? null}
          onUnpackComplete={() => loadData()}
        />
      )}
      <InventoryDrawer />
      <AppFooter />
    </div>
  );
};

export default ProjectBilling;
