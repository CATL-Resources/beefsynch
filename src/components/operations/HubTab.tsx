import { useEffect, useState, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { getBullDisplayName, getBullDisplayLabel } from "@/lib/bullDisplay";
import { format, parseISO, addDays, startOfDay } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CalendarDays, Package, AlertTriangle, DollarSign,
  Droplets, Truck, ChevronRight, Clock, CheckCircle2, XCircle, Printer,
  ChevronDown, ChevronUp,
} from "lucide-react";
import { generateOperationsSummaryPdf } from "@/lib/generateOperationsSummaryPdf";

interface HubTabProps {
  orgId: string;
  onSwitchTab: (tab: string, extra?: Record<string, string>) => void;
}

interface UpcomingProject {
  id: string;
  name: string;
  breeding_date: string;
  head_count: number;
  status: string;
  cattle_type: string;
  protocol: string;
  pack_id: string | null;
  pack_status: string | null;
  packed_units: number | null;
  pack_tanks: { tank_name: string | null; tank_number: string | number }[];
  bull_names: string[];
  products_delivered: number;
  products_total: number;
  has_labor: boolean;
  billing_status: "none" | "started" | "complete";
  product_summary: string;
  in_process: boolean;
}

interface ActionCounts {
  pendingCustomerOrders: number;
  pendingCustomerUnits: number;
  ordersToPlace: number;
  pendingInventoryOrders: number;
  tanksOut: number;
  tankNames: string[];
  unbilledProjects: number;
  unbilledNames: string[];
  tanksDueForFill: number;
  shippedNotReceived: number;
  inventoryShortages: { projectName: string; projectId: string; bulls: { bullName: string; needed: number; available: number }[] }[];
}

const HubTab = ({ orgId, onSwitchTab }: HubTabProps) => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<UpcomingProject[]>([]);
  const [actions, setActions] = useState<ActionCounts>({
    pendingCustomerOrders: 0, pendingCustomerUnits: 0,
    ordersToPlace: 0,
    pendingInventoryOrders: 0, tanksOut: 0, tankNames: [],
    unbilledProjects: 0, unbilledNames: [],
    tanksDueForFill: 0, shippedNotReceived: 0,
    inventoryShortages: [],
  });
  const [weekEvents, setWeekEvents] = useState<{
    date: string;
    events: { id: string; eventName: string; eventTime: string | null; projectName: string; projectId: string; headCount: number }[];
  }[]>([]);
  const [packedOutExpanded, setPackedOutExpanded] = useState(false);
  const [packedOut, setPackedOut] = useState<Array<{
    pack_id: string;
    status: string;
    tank_name: string | null;
    tank_number: string | number;
    projects: { id: string; name: string; customer_name: string | null; protocol: string | null; head_count: number | null; breeding_date: string | null }[];
    bulls: { bull_name: string; bull_code: string | null; units: number }[];
  }>>([]);
  const [needsPacking, setNeedsPacking] = useState<Array<{
    project_id: string;
    name: string;
    customer_name: string | null;
    protocol: string | null;
    head_count: number | null;
    breeding_date: string;
    bulls: { bull_name: string; naab_code: string | null; units: number }[];
  }>>([]);
  const [readyToInvoice, setReadyToInvoice] = useState<Array<{
    id: string;
    customerName: string;
    orderDate: string;
    bullSummary: string;
    fulfillmentStatus: string;
    unitsOrdered: number;
    unitsFilled: number;
    unitsBillable: number;
    type: "order" | "project";
  }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const today = format(new Date(), "yyyy-MM-dd");
      const day14 = format(addDays(new Date(), 14), "yyyy-MM-dd");

      // 1. Upcoming projects (14 days)
      const { data: projData } = await supabase
        .from("projects")
        .select("id, name, breeding_date, head_count, status, cattle_type, protocol")
        .eq("organization_id", orgId)
        .not("status", "in", '("Ready to Bill","Invoiced")')
        .gte("breeding_date", today)
        .lte("breeding_date", day14)
        .order("breeding_date");

      const projectsWithPacks: UpcomingProject[] = [];
      if (projData) {
        const projIds = (projData || []).map((p) => p.id);
        const { data: packLinks } = await supabase
          .from("tank_pack_projects")
          .select("project_id, tank_pack_id, tank_packs(id, status, tank_pack_lines(units), tanks!tank_packs_field_tank_id_fkey(tank_name, tank_number))")
          .in("project_id", projIds.length > 0 ? projIds : ["00000000-0000-0000-0000-000000000000"]);

        const packMap = new Map<string, { pack_id: string; pack_status: string; packed_units: number }>();
        const packTanksMap = new Map<string, { tank_name: string | null; tank_number: string | number }[]>();
        if (packLinks) {
          for (const link of packLinks as any[]) {
            const tp = link.tank_packs;
            if (!tp) continue;
            // Skip cancelled / unpacked packs — they don't represent semen
            // currently in a tank for this project.
            if (tp.status === "cancelled" || tp.status === "unpacked") continue;
            const units = (tp.tank_pack_lines || []).reduce((s: number, l: any) => s + (l.units || 0), 0);
            // packMap keeps the most recent pack for the existing
            // single-pack badge below; packTanksMap collects all of them.
            packMap.set(link.project_id, { pack_id: tp.id, pack_status: tp.status, packed_units: units });
            const tank = tp.tanks;
            if (tank) {
              const list = packTanksMap.get(link.project_id) ?? [];
              list.push({ tank_name: tank.tank_name ?? null, tank_number: tank.tank_number });
              packTanksMap.set(link.project_id, list);
            }
          }
        }

        // Fetch bull names for all upcoming projects
        const bullNameMap = new Map<string, string[]>();
        if (projIds.length > 0) {
          const { data: projBullsData } = await supabase
            .from("project_bulls")
            .select("project_id, bull_catalog_id, custom_bull_name, bulls_catalog(bull_name)")
            .in("project_id", projIds);
          if (projBullsData) {
            for (const pb of projBullsData) {
              const name = getBullDisplayName(pb);
              const existing = bullNameMap.get(pb.project_id) || [];
              if (!existing.includes(name)) existing.push(name);
              bullNameMap.set(pb.project_id, existing);
            }
          }
        }

        // Fetch protocol events to determine "in process" status
        const inProcessSet = new Set<string>();
        if (projIds.length > 0) {
          const day7 = format(addDays(new Date(), 7), "yyyy-MM-dd");
          const { data: eventDates } = await supabase
            .from("protocol_events")
            .select("project_id, event_date, event_name")
            .in("project_id", projIds)
            .not("event_name", "in", '("Return Heat","Estimated Calving")')
            .lte("event_date", day7);
          if (eventDates) {
            for (const ev of eventDates) {
              inProcessSet.add(ev.project_id);
            }
          }
        }

        // Fetch billing summary for each project
        const billingMap = new Map<string, { products_delivered: number; products_total: number; has_labor: boolean; billing_status: string; product_summary: string }>();
        if (projIds.length > 0) {
          const { data: billingData } = await supabase
            .from("project_billing")
            .select("id, project_id, billing_completed_at")
            .in("project_id", projIds);

          if (billingData && billingData.length > 0) {
            const billingIds = billingData.map(b => b.id);

            // Products
            const { data: prodData } = await supabase
              .from("project_billing_products")
              .select("billing_id, product_name, unit_label, delivery_method, doses, units_billed")
              .in("billing_id", billingIds);

            // Labor
            const { data: laborData } = await supabase
              .from("project_billing_labor")
              .select("billing_id")
              .in("billing_id", billingIds);

            for (const bill of billingData) {
              const prods = (prodData ?? []).filter(p => p.billing_id === bill.id);
              const delivered = prods.filter(p => p.delivery_method && p.delivery_method !== "not_yet");
              const hasValues = prods.filter(p => (p.doses ?? 0) > 0 || (Number(p.units_billed) ?? 0) > 0);
              const hasLabor = (laborData ?? []).some(l => l.billing_id === bill.id);

              // Build product summary like "2 bottle SynchSure (50 Dose), 19 bag CIDR"
              const summaryParts: string[] = [];
              for (const p of delivered) {
                const qty = (Number(p.units_billed) ?? 0) > 0
                  ? `${p.units_billed} ${p.unit_label || ""}`.trim()
                  : (p.doses ?? 0) > 0 ? `${p.doses} hd` : "";
                if (qty && p.product_name) {
                  summaryParts.push(`${qty} ${p.product_name}`);
                } else if (p.product_name) {
                  summaryParts.push(p.product_name);
                }
              }
              const summary = summaryParts.join(", ");

              let status: "none" | "started" | "complete" = "none";
              if (bill.billing_completed_at) status = "complete";
              else if (delivered.length > 0 || hasValues.length > 0 || hasLabor) status = "started";

              billingMap.set(bill.project_id, {
                products_delivered: delivered.length,
                products_total: prods.length,
                has_labor: hasLabor,
                billing_status: status,
                product_summary: summary,
              });
            }
          }
        }

        for (const p of projData) {
          const pack = packMap.get(p.id);
          const billing = billingMap.get(p.id);
          projectsWithPacks.push({
            ...p,
            pack_id: pack?.pack_id || null,
            pack_status: pack?.pack_status || null,
            packed_units: pack?.packed_units ?? null,
            pack_tanks: packTanksMap.get(p.id) ?? [],
            bull_names: bullNameMap.get(p.id) || [],
            products_delivered: billing?.products_delivered ?? 0,
            products_total: billing?.products_total ?? 0,
            has_labor: billing?.has_labor ?? false,
            billing_status: (billing?.billing_status ?? "none") as "none" | "started" | "complete",
            product_summary: billing?.product_summary ?? "",
            in_process: inProcessSet.has(p.id),
          });
        }
      }
      setProjects(projectsWithPacks);

      // 2. Action counts
      //
      // "Orders to fill" = customer orders that still have packing work to do.
      // Limit strictly to pending / partially_fulfilled; anything past that
      // (fulfilled, invoiced, cancelled, etc.) is not an action item.
      const { data: custOrders } = await supabase
        .from("semen_orders")
        .select("id, semen_order_items(units)")
        .eq("organization_id", orgId)
        .eq("order_type", "customer")
        .in("fulfillment_status", ["pending", "partially_fulfilled"]);

      const pendingCustCount = custOrders?.length || 0;
      const pendingCustUnits = (custOrders || []).reduce((s: number, o: any) =>
        s + (o.semen_order_items || []).reduce((s2: number, i: any) => s2 + (i.units || 0), 0), 0);

      // "Orders to place" = anything not yet phoned in to the semen company,
      // regardless of order_type. Already-fulfilled / invoiced / cancelled
      // orders are excluded.
      const { count: ordersToPlaceCount } = await supabase
        .from("semen_orders")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .eq("order_status", "not_ordered")
        .not("fulfillment_status", "in", '("fulfilled","invoiced","cancelled")');

      // Ready to invoice: customer orders, unbilled, fulfilled or partially_fulfilled
      const { data: invoiceableOrders } = await supabase
        .from("semen_orders")
        .select(`
          id,
          order_date,
          fulfillment_status,
          invoicing_company_id,
          customers!semen_orders_customer_id_fkey(name),
          semen_order_items(units, bull_catalog_id, custom_bull_name, bulls_catalog(bull_name))
        `)
        .eq("organization_id", orgId)
        .eq("order_type", "customer")
        .eq("status", "fulfilled")
        .order("order_date", { ascending: true });

      // Per-order billable totals from get_billable_units_for_order RPC.
      // Each row in the RPC return is one bull's billable units for the order.
      const billableTotalById = new Map<string, number>();
      await Promise.all(
        (invoiceableOrders || []).map(async (o: any) => {
          const { data } = await supabase.rpc("get_billable_units_for_order", { _order_id: o.id });
          const total = (data ?? []).reduce((s: number, r: any) => s + (r.units || 0), 0);
          billableTotalById.set(o.id, total);
        })
      );

      const invoiceList = (invoiceableOrders || []).map((o: any) => {
        const items = o.semen_order_items || [];
        const ordered = items.reduce((s: number, i: any) => s + (i.units || 0), 0);
        // Use the RPC result as both billable AND filled count.
        // The RPC already correctly counts packs + direct sales + withdrawals.
        const filled = billableTotalById.get(o.id) ?? 0;
        const bullSummary = items
          .map((i: any) => `${i.units} ${getBullDisplayLabel(i)}`)
          .join(" + ");
        return {
          id: o.id,
          customerName: o.customers?.name || "Unknown",
          orderDate: o.order_date,
          bullSummary,
          fulfillmentStatus: o.fulfillment_status,
          unitsOrdered: ordered,
          unitsFilled: filled,
          unitsBillable: billableTotalById.get(o.id) ?? 0,
          type: "order" as const,
        };
      });

      // Unbilled projects — merge into Ready to Invoice
      const { data: unbilled } = await supabase
        .from("projects")
        .select("id, name, status, breeding_date, project_billing(billing_completed_at, status, catl_invoice_number, select_sires_invoice_number)")
        .eq("organization_id", orgId)
        .in("status", ["Ready to Bill", "Invoiced"]);

      const unbilledProjects = (unbilled || []).filter((p: any) => {
        const billing = Array.isArray(p.project_billing) ? p.project_billing[0] : p.project_billing;
        // Already stamped as complete
        if (billing?.billing_completed_at) return false;
        // Project is fully invoiced
        if (p.status === "Invoiced") return false;
        // Has invoice numbers — clearly already invoiced
        if (billing?.catl_invoice_number || billing?.select_sires_invoice_number) return false;
        return true;
      });

      const projectRows = unbilledProjects.map((p: any) => ({
        id: p.id,
        customerName: p.name,
        orderDate: p.breeding_date || "",
        bullSummary: "",
        fulfillmentStatus: p.status === "Invoiced" ? "invoiced" : "ready_to_bill",
        unitsOrdered: 0,
        unitsFilled: 0,
        unitsBillable: 0,
        type: "project" as const,
      }));

      setReadyToInvoice([...invoiceList, ...projectRows]);

      const { data: invOrders } = await supabase
        .from("semen_orders")
        .select("id")
        .eq("organization_id", orgId)
        .eq("order_type", "inventory")
        .not("fulfillment_status", "in", '("fulfilled","cancelled")');

      // Tanks out = canonical state lives on `tanks.location_status`. Only
      // company-owned tanks need to come back; customer-owned tanks that live
      // at the customer's place permanently are not action items.
      const { data: tanksOutData } = await supabase
        .from("tanks")
        .select("id, tank_number, tank_name")
        .eq("organization_id", orgId)
        .eq("location_status", "out")
        .eq("owner_type", "company");

      const tankNames = (tanksOutData || []).map((t: any) =>
        `${t.tank_number}${t.tank_name ? " " + t.tank_name : ""}`,
      );

      // Tanks on site (location_status = 'here', not out with customer)
      const { data: fillData } = await supabase
        .from("tanks")
        .select("id, location_status")
        .eq("organization_id", orgId);
      const wetHere = (fillData || []).filter((t: any) =>
        t.location_status === "here"
      ).length;

      // 3. Inventory shortage check for upcoming unpacked projects
      const unpackedProjects = projectsWithPacks.filter(p => !p.pack_id);
      const shortages: ActionCounts["inventoryShortages"] = [];

      if (unpackedProjects.length > 0) {
        const unpackedIds = unpackedProjects.map(p => p.id);
        // semen_source tells us who's supplying the semen. customer-supplied
        // bulls are checked against the project customer's own inventory.
        const { data: projBulls } = await supabase
          .from("project_bulls")
          .select("project_id, bull_catalog_id, custom_bull_name, units, semen_source, projects!project_bulls_project_id_fkey(customer_id)")
          .in("project_id", unpackedIds);

        if (projBulls && projBulls.length > 0) {
          const catalogIds = (projBulls)
            .map(pb => pb.bull_catalog_id)
            .filter(Boolean);

          // Available company stock = tanks here + customer_id IS NULL.
          const { data: hereTanks } = await supabase
            .from("tanks")
            .select("id")
            .eq("organization_id", orgId)
            .eq("location_status", "here");
          const hereTankIds = (hereTanks || []).map((t: any) => t.id);

          const { data: companyInv } = await supabase.from("tank_inventory")
            .select("bull_catalog_id, units")
            .is("customer_id", null)
            .in("bull_catalog_id", catalogIds.length > 0 ? catalogIds : ["00000000-0000-0000-0000-000000000000"])
            .in("tank_id", hereTankIds.length > 0 ? hereTankIds : ["00000000-0000-0000-0000-000000000000"]);

          const companyAvailable = new Map<string, number>();
          for (const inv of (companyInv || []) as any[]) {
            if (inv.bull_catalog_id) {
              companyAvailable.set(inv.bull_catalog_id, (companyAvailable.get(inv.bull_catalog_id) || 0) + (inv.units || 0));
            }
          }

          // Customer-owned inventory keyed by `${customer_id}|${bull_catalog_id}`.
          const customerIds = Array.from(new Set(
            (projBulls as any[])
              .map(pb => pb.projects?.customer_id as string | null | undefined)
              .filter((x): x is string => !!x)
          ));
          const customerAvailable = new Map<string, number>();
          if (customerIds.length > 0) {
            const { data: custInv } = await supabase.from("tank_inventory")
              .select("bull_catalog_id, customer_id, units")
              .in("customer_id", customerIds)
              .in("bull_catalog_id", catalogIds.length > 0 ? catalogIds : ["00000000-0000-0000-0000-000000000000"]);
            for (const inv of (custInv || []) as any[]) {
              if (inv.bull_catalog_id && inv.customer_id) {
                const key = `${inv.customer_id}|${inv.bull_catalog_id}`;
                customerAvailable.set(key, (customerAvailable.get(key) || 0) + (inv.units || 0));
              }
            }
          }

          const { data: bullNames } = await supabase
            .from("bulls_catalog")
            .select("id, bull_name")
            .in("id", catalogIds.length > 0 ? catalogIds : ["00000000-0000-0000-0000-000000000000"]);
          const nameMap = new Map<string, string>();
          for (const b of (bullNames || []) as any[]) nameMap.set(b.id, b.bull_name);

          for (const proj of unpackedProjects) {
            const bulls = (projBulls as any[]).filter(pb => pb.project_id === proj.id);
            const shortBulls: { bullName: string; needed: number; available: number }[] = [];

            for (const pb of bulls) {
              const needed = pb.units || 0;
              if (needed <= 0) continue;
              if (!pb.bull_catalog_id) continue;
              let available = 0;
              if (pb.semen_source === "customer") {
                const projCustomerId = pb.projects?.customer_id;
                available = projCustomerId
                  ? (customerAvailable.get(`${projCustomerId}|${pb.bull_catalog_id}`) || 0)
                  : 0;
              } else {
                available = companyAvailable.get(pb.bull_catalog_id) || 0;
              }
              if (available < needed) {
                shortBulls.push({
                  bullName: nameMap.get(pb.bull_catalog_id) || pb.custom_bull_name || "Unknown",
                  needed,
                  available,
                });
              }
            }

            if (shortBulls.length > 0) {
              shortages.push({ projectName: proj.name, projectId: proj.id, bulls: shortBulls });
            }
          }
        }
      }

      setActions({
        pendingCustomerOrders: pendingCustCount,
        pendingCustomerUnits: pendingCustUnits,
        ordersToPlace: ordersToPlaceCount ?? 0,
        pendingInventoryOrders: invOrders?.length || 0,
        tanksOut: tanksOutData?.length || 0,
        tankNames,
        unbilledProjects: 0,
        unbilledNames: [],
        tanksDueForFill: wetHere,
        shippedNotReceived: 0,
        inventoryShortages: shortages,
      });

      // Protocol events for this week (excludes Return Heat and Estimated Calving — not actionable)
      const { data: eventData } = await supabase
        .from("protocol_events")
        .select("id, event_name, event_date, event_time, project_id, projects!protocol_events_project_id_fkey(id, name, head_count, status)")
        .gte("event_date", today)
        .lte("event_date", format(addDays(new Date(), 6), "yyyy-MM-dd"))
        .order("event_date")
        .order("event_time", { ascending: true, nullsFirst: false });

      if (eventData) {
        const excludeEvents = ["Return Heat", "Estimated Calving", "Timed Breeding", "Bulls In"];
        const filtered = (eventData).filter(
          (e) =>
            e.projects &&
            ["Confirmed", "Tentative"].includes(e.projects.status) &&
            !excludeEvents.includes(e.event_name)
        );

        const grouped = new Map<string, typeof filtered>();
        for (const e of filtered) {
          const key = e.event_date;
          if (!grouped.has(key)) grouped.set(key, []);
          grouped.get(key)!.push(e);
        }

        const result = Array.from(grouped.entries()).map(([date, events]) => ({
          date,
          events: events.map((e: any) => ({
            id: e.id,
            eventName: e.event_name,
            eventTime: e.event_time,
            projectName: e.projects.name,
            projectId: e.projects.id,
            headCount: e.projects.head_count,
          })),
        }));

        setWeekEvents(result);
      }

      // ── TANKS PACKED OUT ──────────────────────────────────────────────
      const { data: packsData } = await supabase
        .from("tank_packs")
        .select(`
          id, status, packed_at, customer_id, field_tank_id,
          tanks!tank_packs_field_tank_id_fkey(tank_name, tank_number),
          customers!tank_packs_customer_id_fkey(name),
          tank_pack_lines(bull_name, bull_code, units),
          tank_pack_projects(
            project_id,
            projects(id, name, protocol, head_count, breeding_date,
              customers!projects_customer_id_fkey(name))
          )
        `)
        .eq("organization_id", orgId)
        .in("status", ["packed", "in_field", "shipped"]);

      if (packsData) {
        const cards = (packsData as any[])
          // Project packs only — shipment/pickup packs have their own
          // lifecycle and don't belong on the Hub's daily-ops view.
          .filter((tp) => Array.isArray(tp.tank_pack_projects) && tp.tank_pack_projects.length > 0)
          .map((tp) => ({
            pack_id: tp.id,
            status: tp.status,
            tank_name: tp.tanks?.tank_name ?? null,
            tank_number: tp.tanks?.tank_number ?? "",
            projects: (tp.tank_pack_projects ?? []).map((link: any) => ({
              id: link.projects?.id ?? link.project_id,
              name: link.projects?.name ?? "Unknown project",
              customer_name: link.projects?.customers?.name ?? tp.customers?.name ?? null,
              protocol: link.projects?.protocol ?? null,
              head_count: link.projects?.head_count ?? null,
              breeding_date: link.projects?.breeding_date ?? null,
            })),
            bulls: (tp.tank_pack_lines ?? []).map((l: any) => ({
              bull_name: l.bull_name,
              bull_code: l.bull_code,
              units: l.units ?? 0,
            })),
          }));
        cards.sort((a, b) => {
          const ad = a.projects[0]?.breeding_date ?? "9999";
          const bd = b.projects[0]?.breeding_date ?? "9999";
          return ad.localeCompare(bd);
        });
        setPackedOut(cards);
      }

      // ── NEEDS PACKING (next 7 days) ───────────────────────────────────
      const day7 = format(addDays(new Date(), 7), "yyyy-MM-dd");
      const { data: nextProjects } = await supabase
        .from("projects")
        .select(`
          id, name, protocol, head_count, breeding_date,
          customers!projects_customer_id_fkey(name)
        `)
        .eq("organization_id", orgId)
        .not("status", "in", '("Ready to Bill","Invoiced")')
        .gte("breeding_date", today)
        .lte("breeding_date", day7)
        .order("breeding_date");

      if (nextProjects) {
        const ids = nextProjects.map((p: any) => p.id);
        const packedSet = new Set<string>();
        if (ids.length > 0) {
          const { data: packLinks } = await supabase
            .from("tank_pack_projects")
            .select("project_id, tank_packs!inner(status)")
            .in("project_id", ids);
          for (const r of (packLinks ?? []) as any[]) {
            const s = r.tank_packs?.status;
            if (!s) continue;
            if (["cancelled", "unpacked", "tank_returned"].includes(s)) continue;
            packedSet.add(r.project_id);
          }
        }
        const unpackedProjectIds = ids.filter((pid: string) => !packedSet.has(pid));
        const projBullsMap = new Map<string, { bull_name: string; naab_code: string | null; units: number }[]>();
        if (unpackedProjectIds.length > 0) {
          const { data: pb } = await supabase
            .from("project_bulls")
            .select("project_id, units, custom_bull_name, bulls_catalog(bull_name, naab_code)")
            .in("project_id", unpackedProjectIds);
          for (const r of (pb ?? []) as any[]) {
            const list = projBullsMap.get(r.project_id) ?? [];
            list.push({
              bull_name: r.bulls_catalog?.bull_name ?? r.custom_bull_name ?? "Unknown",
              naab_code: r.bulls_catalog?.naab_code ?? null,
              units: r.units ?? 0,
            });
            projBullsMap.set(r.project_id, list);
          }
        }
        setNeedsPacking(
          nextProjects
            .filter((p: any) => unpackedProjectIds.includes(p.id))
            .map((p: any) => ({
              project_id: p.id,
              name: p.name,
              customer_name: p.customers?.name ?? null,
              protocol: p.protocol ?? null,
              head_count: p.head_count ?? null,
              breeding_date: p.breeding_date,
              bulls: projBullsMap.get(p.id) ?? [],
            })),
        );
      }

      setLoading(false);
    };

    load();
  }, [orgId]);

  const today = startOfDay(new Date());
  const day7 = addDays(today, 7);

  const thisWeek = useMemo(() => projects.filter((p) => {
    const d = startOfDay(parseISO(p.breeding_date));
    return d >= today && d < day7;
  }), [projects]);

  const nextWeek = useMemo(() => projects.filter((p) => {
    const d = startOfDay(parseISO(p.breeding_date));
    return d >= day7;
  }), [projects]);

  const laborConflicts = useMemo(() => {
    const byDate = new Map<string, UpcomingProject[]>();
    for (const p of thisWeek) {
      const key = p.breeding_date;
      if (!byDate.has(key)) byDate.set(key, []);
      byDate.get(key)!.push(p);
    }
    return [...byDate.entries()]
      .filter(([, list]) => list.length >= 2)
      .map(([date, list]) => ({ date, count: list.length, totalHead: list.reduce((s, p) => s + p.head_count, 0) }));
  }, [thisWeek]);

  if (loading) {
    return <div className="py-12 text-center text-sm text-muted-foreground">Loading hub…</div>;
  }

  const PackStatus = ({ project }: { project: UpcomingProject }) => {
    if (!project.pack_id) {
      return (
        <Badge variant="destructive" className="gap-1">
          <XCircle className="h-3 w-3" /> Not Packed
        </Badge>
      );
    }
    return (
      <Badge className="gap-1 bg-emerald-600 hover:bg-emerald-700 text-white border-transparent">
        <CheckCircle2 className="h-3 w-3" /> Packed · {project.packed_units} units
      </Badge>
    );
  };

  const DaysUntil = ({ date }: { date: string }) => {
    const d = startOfDay(parseISO(date));
    const diff = Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diff === 0) return <Badge className="bg-primary text-primary-foreground">TODAY</Badge>;
    if (diff === 1) return <Badge variant="secondary">Tomorrow</Badge>;
    return <Badge variant="outline">{diff}d</Badge>;
  };

  return (
    <div className="space-y-8">
      {/* ACTION ITEMS */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold font-display">Action Items</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {actions.pendingCustomerOrders > 0 && (
            <Card
              className="cursor-pointer border-destructive/40 bg-destructive/5 transition-colors hover:bg-destructive/10"
              onClick={() => onSwitchTab("orders")}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Package className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-sm">
                      {actions.pendingCustomerOrders} customer order{actions.pendingCustomerOrders !== 1 ? "s" : ""} to fill
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {actions.pendingCustomerUnits.toLocaleString()} units to pack
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </div>
              </CardContent>
            </Card>
          )}

          {actions.ordersToPlace > 0 && (
            <Card
              className="cursor-pointer border-amber-500/40 bg-amber-500/5 transition-colors hover:bg-amber-500/10"
              onClick={() => onSwitchTab("orders")}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Clock className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-sm">
                      {actions.ordersToPlace} order{actions.ordersToPlace !== 1 ? "s" : ""} to place
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Not yet called in to the semen company
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </div>
              </CardContent>
            </Card>
          )}

          {actions.inventoryShortages.length > 0 && (
            actions.inventoryShortages.map((shortage) => (
              <Card
                key={shortage.projectId}
                className="cursor-pointer border-destructive/40 bg-destructive/5 transition-colors hover:bg-destructive/10"
                onClick={() => navigate(`/project/${shortage.projectId}/billing`)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-sm">
                        {shortage.projectName} — semen short
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {shortage.bulls.map(b =>
                          `${b.bullName}: need ${b.needed}, have ${b.available}`
                        ).join("; ")}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </div>
                </CardContent>
              </Card>
            ))
          )}

          {actions.tanksOut > 0 && (
            <Card
              className="cursor-pointer border-amber-500/40 bg-amber-500/5 transition-colors hover:bg-amber-500/10"
              onClick={() => onSwitchTab("tanks", { subTab: "out" })}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Truck className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-sm">
                      {actions.tanksOut} tank{actions.tanksOut !== 1 ? "s" : ""} still out
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {actions.tankNames.join(", ")}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </div>
              </CardContent>
            </Card>
          )}


          {actions.pendingInventoryOrders > 0 && (
            <Card
              className="cursor-pointer border-blue-500/40 bg-blue-500/5 transition-colors hover:bg-blue-500/10"
              onClick={() => onSwitchTab("orders")}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Truck className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-sm">
                      {actions.pendingInventoryOrders} order{actions.pendingInventoryOrders !== 1 ? "s" : ""} awaiting shipment
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Company semen on the way
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </div>
              </CardContent>
            </Card>
          )}

          <Card
            className="cursor-pointer transition-colors hover:bg-secondary/40"
            onClick={() => onSwitchTab("inventory")}
          >
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <Droplets className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-sm">
                    {actions.tanksDueForFill} tank{actions.tanksDueForFill !== 1 ? "s" : ""} on site
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Check fills tab for overdue
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </div>
            </CardContent>
          </Card>

          {actions.pendingCustomerOrders === 0 && actions.ordersToPlace === 0 && actions.tanksOut === 0 && actions.unbilledProjects === 0 && actions.pendingInventoryOrders === 0 && actions.inventoryShortages.length === 0 && (
            <Card className="border-emerald-500/40 bg-emerald-500/5 sm:col-span-2">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  <p className="font-semibold text-sm">All caught up!</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </section>

      {/* READY TO INVOICE */}
      {readyToInvoice.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <div className="flex items-baseline gap-3">
              <h2 className="text-lg font-semibold font-display">Ready to invoice</h2>
              <Link to="/billable" className="text-xs text-primary hover:underline">
                Open full report →
              </Link>
            </div>
            <span className="text-sm text-muted-foreground">
              {readyToInvoice.length} item{readyToInvoice.length !== 1 ? "s" : ""}
            </span>
          </div>
          <Card>
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {readyToInvoice.map((o) => (
                  <div
                    key={o.id}
                    className="grid grid-cols-1 sm:grid-cols-[1.5fr_1fr_auto] gap-3 p-4 items-center"
                  >
                    <div className="min-w-0">
                      <Link
                        to={o.type === "project" ? `/project/${o.id}/billing` : `/semen-orders/${o.id}`}
                        className="font-medium text-sm hover:text-primary block truncate"
                      >
                        {o.customerName}
                      </Link>
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-xs text-muted-foreground">
                          {o.type === "project" ? "Project" : "Order"}{o.orderDate ? ` · ${format(parseISO(o.orderDate), "MMM d")}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="min-w-0">
                      {o.type === "order" ? (
                        <>
                          <p className="text-sm truncate">{o.bullSummary}</p>
                          <p className="text-xs text-muted-foreground capitalize">
                            {o.fulfillmentStatus.replace(/_/g, " ")} · {o.unitsFilled} of {o.unitsOrdered} · billable {o.unitsBillable}
                          </p>
                        </>
                      ) : (
                        <p className="text-xs text-muted-foreground capitalize">
                          {o.fulfillmentStatus.replace(/_/g, " ")}
                        </p>
                      )}
                    </div>
                    <Button
                      size="sm"
                      onClick={() =>
                        navigate(o.type === "project" ? `/project/${o.id}/billing` : `/semen-orders/${o.id}`)
                      }
                    >
                      Open
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>
      )}

      {/* TANKS PACKED OUT */}
      {packedOut.length > 0 && (
        <section className="space-y-3">
          <button
            type="button"
            onClick={() => setPackedOutExpanded((v) => !v)}
            className="flex items-baseline justify-between w-full text-left hover:opacity-80 transition-opacity"
            aria-expanded={packedOutExpanded}
          >
            <div className="flex items-center gap-2">
              {packedOutExpanded ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
              <h2 className="text-lg font-semibold font-display">Tanks packed out</h2>
            </div>
            <span className="text-sm text-muted-foreground">
              {packedOut.length} tank{packedOut.length !== 1 ? "s" : ""}
            </span>
          </button>
          {packedOutExpanded && (
          <div className="grid gap-3 sm:grid-cols-2">
            {packedOut.map((p) => {
              const totalUnits = p.bulls.reduce((s, b) => s + b.units, 0);
              return (
                <Card
                  key={p.pack_id}
                  className="cursor-pointer border-emerald-500/30 bg-emerald-500/5 transition-colors hover:bg-emerald-500/10"
                  onClick={() => navigate(`/pack/${p.pack_id}`)}
                >
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Package className="h-4 w-4 text-emerald-600 shrink-0" />
                        <span className="font-semibold text-sm truncate">
                          {p.tank_name ? `${p.tank_name} (#${p.tank_number})` : `Tank #${p.tank_number}`}
                        </span>
                      </div>
                      <Badge variant="outline" className="capitalize text-[10px]">
                        {p.status.replace(/_/g, " ")}
                      </Badge>
                    </div>
                    {p.projects.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">No project linked</p>
                    ) : (
                      <div className="space-y-1.5">
                        {p.projects.map((proj) => (
                          <div key={proj.id} className="text-xs">
                            <div className="font-medium truncate">{proj.customer_name ?? "—"}</div>
                            <div className="text-muted-foreground truncate">
                              {proj.name}
                              {proj.protocol ? ` · ${proj.protocol}` : ""}
                              {proj.head_count != null ? ` · ${proj.head_count} hd` : ""}
                              {proj.breeding_date ? ` · ${format(parseISO(proj.breeding_date), "MMM d")}` : ""}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {p.bulls.length > 0 && (
                      <div className="border-t border-border/40 pt-2 space-y-0.5 text-xs">
                        {p.bulls.map((b, i) => (
                          <div key={i} className="flex items-baseline justify-between gap-2">
                            <span className="truncate">
                              {b.bull_name}
                              {b.bull_code ? <span className="text-muted-foreground"> · {b.bull_code}</span> : null}
                            </span>
                            <span className="tabular-nums text-muted-foreground">{b.units}u</span>
                          </div>
                        ))}
                        <div className="flex items-baseline justify-between gap-2 pt-1 font-semibold">
                          <span>Total</span>
                          <span className="tabular-nums">{totalUnits}u</span>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
          )}
        </section>
      )}

      {/* NEEDS PACKING — NEXT 7 DAYS */}
      {needsPacking.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold font-display">Needs packing — next 7 days</h2>
            <span className="text-sm text-muted-foreground">
              {needsPacking.length} project{needsPacking.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {needsPacking.map((p) => {
              const d = startOfDay(parseISO(p.breeding_date));
              const diffDays = Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
              const isUrgent = diffDays <= 2;
              return (
                <Card
                  key={p.project_id}
                  className={`border-amber-500/40 bg-amber-500/5 transition-colors hover:bg-amber-500/10`}
                >
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-semibold text-sm truncate">{p.customer_name ?? "—"}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {p.name}
                          {p.protocol ? ` · ${p.protocol}` : ""}
                          {p.head_count != null ? ` · ${p.head_count} hd` : ""}
                        </div>
                      </div>
                      <Badge
                        variant="outline"
                        className={isUrgent ? "bg-destructive/15 text-destructive border-destructive/40" : "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40"}
                      >
                        {diffDays === 0 ? "TODAY" : diffDays === 1 ? "Tomorrow" : `${diffDays}d`}
                      </Badge>
                    </div>
                    {p.bulls.length > 0 && (
                      <div className="border-t border-border/40 pt-2 space-y-0.5 text-xs">
                        {p.bulls.map((b, i) => (
                          <div key={i} className="flex items-baseline justify-between gap-2">
                            <span className="truncate">
                              {b.bull_name}
                              {b.naab_code ? <span className="text-muted-foreground"> · {b.naab_code}</span> : null}
                            </span>
                            <span className="tabular-nums text-muted-foreground">{b.units}u</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        onClick={() => navigate(`/pack-tank?projectId=${p.project_id}`)}
                      >
                        <Package className="h-3.5 w-3.5 mr-1.5" /> Pack tank
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {/* THIS WEEK */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold font-display">This Week</h2>
            <span className="text-xs text-muted-foreground">
              {format(today, "MMM d")} – {format(addDays(today, 6), "MMM d")}
            </span>
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1 ml-2"
              onClick={() => generateOperationsSummaryPdf(orgId)}>
              <Printer className="h-3.5 w-3.5" /> Print Summary
            </Button>
          </div>
          <span className="text-xs text-muted-foreground">
            {thisWeek.length} project{thisWeek.length !== 1 ? "s" : ""}
          </span>
        </div>

        {thisWeek.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No projects breeding this week.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {thisWeek.map((p) => (
              <Card
                key={p.id}
                className="cursor-pointer transition-colors hover:bg-secondary/40"
                onClick={() => navigate(`/project/${p.id}`)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-base truncate">{p.name}</h3>
                        <Badge variant="outline" className="text-[10px]">{p.status}</Badge>
                        {p.in_process && (
                          <Badge className="bg-primary/15 text-primary border-primary/30 text-[10px] py-0 px-1.5">In Process</Badge>
                        )}
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                        <span>{format(parseISO(p.breeding_date), "EEE, MMM d")}</span>
                        <span>·</span>
                        <span>{p.protocol}</span>
                        <span>·</span>
                        <span>{p.cattle_type}</span>
                        <span>·</span>
                        <span>{p.head_count} hd</span>
                      </div>
                      {p.bull_names.length > 0 && (
                        <p className="mt-0.5 text-xs text-primary/80 truncate">
                          {p.bull_names.join(", ")}
                        </p>
                      )}
                      {p.pack_tanks.length > 0 && (
                        <p className="mt-0.5 text-xs text-muted-foreground truncate">
                          Packed in: {p.pack_tanks
                            .map((t) => (t.tank_name ? `${t.tank_name} (#${t.tank_number})` : `#${t.tank_number}`))
                            .join(", ")}
                        </p>
                      )}
                      {/* Product + labor summary strip */}
                      {(p.product_summary || p.has_labor) && (
                        <div className="mt-1.5 flex flex-col gap-1 text-[11px]">
                          {p.product_summary && (
                            <p className="text-emerald-700 leading-snug">{p.product_summary}</p>
                          )}
                          {p.has_labor && (
                            <span className="inline-flex items-center gap-1 text-blue-700 w-fit">
                              Labor entered
                            </span>
                          )}
                        </div>
                      )}
                      {p.in_process && !p.product_summary && !p.has_labor && (
                        <p className="mt-1 text-[11px] text-muted-foreground/60 italic">Synch started — no products delivered yet</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <PackStatus project={p} />
                      <DaysUntil date={p.breeding_date} />
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {laborConflicts.length > 0 && (
          <div className="space-y-2">
            {laborConflicts.map((c) => (
              <div
                key={c.date}
                className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200"
              >
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>
                  {format(parseISO(c.date), "EEE, MMM d")}: {c.count} projects, {c.totalHead.toLocaleString()} total head — check labor
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* SYNCHRONIZATIONS — protocol events (not breeding dates) */}
      {weekEvents.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold font-display">Synchronizations</h2>
            <span className="text-xs text-muted-foreground">
              {weekEvents.reduce((s, d) => s + d.events.length, 0)} events this week
            </span>
          </div>

          <Card>
            <CardContent className="p-0 divide-y divide-border">
              {weekEvents.map((day) => (
                <div key={day.date} className="px-4 py-3">
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                    {format(parseISO(day.date), "EEEE, MMM d")}
                  </div>
                  <div className="space-y-1.5">
                    {day.events.map((ev) => (
                      <div
                        key={ev.id}
                        className="flex items-center justify-between gap-3 text-sm cursor-pointer hover:text-primary transition-colors"
                        onClick={() => navigate(`/project/${ev.projectId}`)}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Badge
                            variant="outline"
                            className="text-[10px] shrink-0 whitespace-nowrap"
                          >
                            {ev.eventName}
                          </Badge>
                          <span className="truncate text-foreground">{ev.projectName}</span>
                          <span className="text-xs text-muted-foreground shrink-0">{ev.headCount} hd</span>
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {ev.eventTime
                            ? format(new Date(`2000-01-01T${ev.eventTime}`), "h:mm a")
                            : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>
      )}

      {/* COMING UP */}
      {nextWeek.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold font-display">Coming Up</h2>
            <span className="text-xs text-muted-foreground">
              {format(day7, "MMM d")} – {format(addDays(today, 13), "MMM d")}
            </span>
          </div>
          <Card>
            <CardContent className="p-2">
              <div className="divide-y divide-border/50">
                {nextWeek.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between gap-4 px-3 py-2 cursor-pointer hover:bg-secondary/40 rounded-md"
                    onClick={() => navigate(`/project/${p.id}`)}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span className="text-xs font-medium text-muted-foreground w-20 shrink-0">
                        {format(parseISO(p.breeding_date), "EEE M/d")}
                      </span>
                      <span className="font-medium truncate">{p.name}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 text-xs text-muted-foreground">
                      {p.bull_names.length > 0 && (
                        <span className="text-primary/80 truncate max-w-[150px]">{p.bull_names.join(", ")}</span>
                      )}
                      {p.in_process && (
                        <span className="text-[10px] font-medium text-primary">In Process</span>
                      )}
                      {p.products_delivered > 0 && (
                        <span className="text-[10px] text-emerald-600 truncate max-w-[200px]">{p.product_summary}</span>
                      )}
                      <span>{p.head_count} hd</span>
                      <span>·</span>
                      <span>{p.cattle_type}</span>
                      {!p.pack_id && <XCircle className="h-3.5 w-3.5 text-destructive" />}
                      {p.pack_id && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>
      )}
    </div>
  );
};

export default HubTab;
