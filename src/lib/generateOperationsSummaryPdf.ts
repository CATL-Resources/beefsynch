import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format, parseISO, addDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import {
  addFooterToPdf,
  getStandardHeadStylesDark,
  PDF_LAYOUT,
} from "./pdfUtils";

function nz(val: number | null | undefined): string {
  if (val == null || val === 0) return "";
  return String(val);
}

function deliveryLabel(dm: string | null): string {
  if (!dm || dm === "not_yet") return "";
  if (dm === "pickup") return "Pickup";
  if (dm === "we_gave") return "We gave";
  if (dm === "drop_off") return "Drop off";
  return "";
}

/**
 * Generate an operations summary PDF for all IN-PROCESS projects.
 * "In process" = has any protocol event (excluding Return Heat / Estimated Calving)
 * dated on or before 7 days from now. Projects whose synch is entirely in the
 * future (e.g. June+) are excluded.
 */
export async function generateOperationsSummaryPdf(orgId: string) {
  const day7 = format(addDays(new Date(), 7), "yyyy-MM-dd");

  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, breeding_date, head_count, status, cattle_type, protocol, customer_id, customers!projects_customer_id_fkey(name)")
    .eq("organization_id", orgId)
    .not("status", "in", '("Work Complete","Invoiced")')
    .order("breeding_date");

  if (!projects || projects.length === 0) return;

  const projIds = projects.map(p => p.id);

  // Filter to projects where at least one billable protocol event is at or before day7.
  const { data: allEvents } = await supabase
    .from("protocol_events")
    .select("project_id, event_date, event_name")
    .in("project_id", projIds)
    .not("event_name", "in", '("Return Heat","Estimated Calving")')
    .lte("event_date", day7);

  const inProcessIds = new Set<string>();
  for (const ev of (allEvents ?? [])) {
    if (ev.project_id) inProcessIds.add(ev.project_id);
  }

  const inProcessProjects = projects.filter(p => inProcessIds.has(p.id));
  if (inProcessProjects.length === 0) return;

  const activeIds = inProcessProjects.map(p => p.id);

  const [
    { data: packLinks },
    { data: bullsData },
    { data: billingData },
  ] = await Promise.all([
    supabase.from("tank_pack_projects")
      .select("project_id, tank_pack_id, tank_packs(id, status, field_tank_id, tanks:field_tank_id(tank_name, tank_number), tank_pack_lines(bull_name, bull_code, field_canister, units))")
      .in("project_id", activeIds),
    supabase.from("project_bulls")
      .select("project_id, units, bull_catalog_id, custom_bull_name, bulls_catalog(bull_name, naab_code)")
      .in("project_id", activeIds),
    supabase.from("project_billing")
      .select("id, project_id, billing_completed_at")
      .in("project_id", activeIds),
  ]);

  const billingIds = (billingData ?? []).map(b => b.id);
  let prodData: any[] = [];
  let laborData: any[] = [];
  let semenData: any[] = [];

  if (billingIds.length > 0) {
    const [prodRes, laborRes, semenRes] = await Promise.all([
      supabase.from("project_billing_products")
        .select("billing_id, product_name, doses, units_billed, unit_label, delivery_method")
        .in("billing_id", billingIds)
        .order("sort_order"),
      supabase.from("project_billing_labor")
        .select("billing_id, description, labor_dates")
        .in("billing_id", billingIds),
      supabase.from("project_billing_semen")
        .select("billing_id, bull_name, bull_code, units_packed, units_blown, units_billable")
        .in("billing_id", billingIds),
    ]);
    prodData = prodRes.data ?? [];
    laborData = laborRes.data ?? [];
    semenData = semenRes.data ?? [];
  }

  const packMap = new Map<string, any>();
  for (const link of (packLinks ?? [])) {
    if (link.tank_packs) packMap.set(link.project_id, link.tank_packs);
  }

  const billingMap = new Map<string, string>();
  for (const b of (billingData ?? [])) {
    billingMap.set(b.project_id, b.id);
  }

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const m = 12;
  let isFirstProject = true;

  for (const proj of inProcessProjects) {
    if (!isFirstProject) {
      const currentY = (doc as any)._currentY || m;
      if (currentY > ph - 80) doc.addPage();
    }

    if (isFirstProject) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(120);
      doc.text("CATL RESOURCES", m, 14);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.setTextColor(0);
      doc.text("Operations Summary", m, 21);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(80);
      doc.text(format(new Date(), "MMMM d, yyyy"), pw - m, 21, { align: "right" });
      doc.setTextColor(0);

      doc.setDrawColor(60);
      doc.setLineWidth(0.4);
      doc.line(m, 24, pw - m, 24);
    }

    const startY = isFirstProject ? 30 : ((doc as any).lastAutoTable?.finalY ?? 30) + 10;
    isFirstProject = false;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(0);
    doc.text(proj.name, m, startY);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(80);
    const headerParts = [
      proj.protocol,
      proj.cattle_type,
      `${proj.head_count} hd`,
      proj.breeding_date ? format(parseISO(proj.breeding_date), "MMM d, yyyy") : null,
      proj.status,
    ].filter(Boolean);
    doc.text(headerParts.join("  ·  "), pw - m, startY, { align: "right" });
    doc.setTextColor(0);

    const pack = packMap.get(proj.id);
    let packLine = "";
    if (pack) {
      const tankName = pack.tanks?.tank_name || pack.tanks?.tank_number || "";
      const totalUnits = (pack.tank_pack_lines || []).reduce((s: number, l: any) => s + (l.units || 0), 0);
      packLine = `Tank: ${tankName} · ${totalUnits} units packed · Status: ${pack.status}`;
    } else {
      packLine = "NOT PACKED";
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(packLine, m, startY + 5);

    let tableY = startY + 8;

    const projBulls = (bullsData ?? []).filter(b => b.project_id === proj.id);
    const bId = billingMap.get(proj.id);
    const projSemen = bId ? semenData.filter(s => s.billing_id === bId) : [];

    if (projBulls.length > 0 || projSemen.length > 0) {
      const bullRows = projSemen.length > 0
        ? projSemen.map(s => [
            `${s.bull_name}${s.bull_code ? " (" + s.bull_code + ")" : ""}`,
            { content: nz(s.units_packed), styles: { halign: "center" as const } },
            { content: nz(s.units_blown), styles: { halign: "center" as const } },
            { content: nz(s.units_billable), styles: { halign: "center" as const } },
          ])
        : projBulls.map(b => [
            `${b.bulls_catalog?.bull_name || b.custom_bull_name || ""}${b.bulls_catalog?.naab_code ? " (" + b.bulls_catalog.naab_code + ")" : ""}`,
            { content: nz(b.units), styles: { halign: "center" as const } },
            "", "",
          ]);

      autoTable(doc, {
        startY: tableY,
        margin: { left: m, right: m },
        head: [["Bull", { content: "Packed", styles: { halign: "center" as const } }, { content: "Blown", styles: { halign: "center" as const } }, { content: "Billable", styles: { halign: "center" as const } }]],
        body: bullRows,
        styles: { fontSize: 8, cellPadding: 1.5, lineColor: [60, 60, 60], lineWidth: 0.1 },
        headStyles: { ...getStandardHeadStylesDark(), fontSize: 7 },
        columnStyles: { 0: { cellWidth: "auto" }, 1: { cellWidth: 18 }, 2: { cellWidth: 18 }, 3: { cellWidth: 20 } },
      });
      tableY = (doc as any).lastAutoTable.finalY + 2;
    }

    const projProds = bId ? prodData.filter(p => p.billing_id === bId && (
      (p.delivery_method && p.delivery_method !== "not_yet") ||
      (p.doses ?? 0) > 0 ||
      (Number(p.units_billed) ?? 0) > 0
    )) : [];

    if (projProds.length > 0) {
      const prodRows = projProds.map(p => {
        const qty = (Number(p.units_billed) ?? 0) > 0
          ? `${p.units_billed} ${p.unit_label || ""}`.trim()
          : (p.doses ?? 0) > 0 ? `${p.doses} hd` : "";
        return [
          p.product_name || "",
          qty,
          deliveryLabel(p.delivery_method),
        ];
      });

      autoTable(doc, {
        startY: tableY,
        margin: { left: m, right: m },
        head: [["Product / Service", "Qty", "Delivery"]],
        body: prodRows,
        styles: { fontSize: 8, cellPadding: 1.5, lineColor: [60, 60, 60], lineWidth: 0.1 },
        headStyles: { ...getStandardHeadStylesDark(), fontSize: 7 },
        columnStyles: { 0: { cellWidth: "auto" }, 1: { cellWidth: 24 }, 2: { cellWidth: 22 } },
      });
      tableY = (doc as any).lastAutoTable.finalY + 2;
    }

    const projLabor = bId ? laborData.filter(l => l.billing_id === bId) : [];
    if (projLabor.length > 0) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(7);
      doc.setTextColor(100);
      const laborText = projLabor.map(l => `${l.description || "Labor"}${l.labor_dates ? " (" + l.labor_dates + ")" : ""}`).join(" · ");
      doc.text(laborText, m, tableY + 2, { maxWidth: pw - m * 2 });
      doc.setTextColor(0);
      tableY += 6;
    }

    doc.setDrawColor(180);
    doc.setLineWidth(0.15);
    doc.line(m, tableY + 2, pw - m, tableY + 2);

    (doc as any).lastAutoTable = { finalY: tableY + 2 };
  }

  addFooterToPdf(doc, "BeefSynch by Chuteside, LLC", PDF_LAYOUT.footerOffsetMini);
  doc.save(`BeefSynch_Operations_Summary_${format(new Date(), "yyyy-MM-dd")}.pdf`);
}
