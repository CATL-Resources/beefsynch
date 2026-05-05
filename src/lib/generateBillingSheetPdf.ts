import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format, parseISO } from "date-fns";
import { formatDollar } from "./formatUtils";
import {
  addFooterToPdf,
  getStandardHeadStylesDark,
  PDF_LAYOUT,
} from "./pdfUtils";

/**
 * Billing sheet PDF — matches the online Billing tab.
 *
 * Sections:
 *   1. Project header (name, protocol, type, head, breed date, invoices, status)
 *   2. Products & Services (non-zero lines only, with head + units display)
 *   3. Semen (Packed, Used, Blown, Billable, Price, Total per bull)
 *   4. Grand total
 *   5. Notes
 */
export function generateBillingSheetPdf(
  project: any,
  billing: any,
  products: any[],
  semen: any[],
  totals: { productsTotal: number; semenTotal: number; laborTotal: number; grandTotal: number },
) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
  const pw = doc.internal.pageSize.getWidth();
  const m = 14;
  let y = 16;

  /* ── Header ── */
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Billing Summary", m, y);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(120);
  doc.text("BeefSynch by Chuteside Resources", pw - m, y, { align: "right" });
  doc.setTextColor(0);
  y += 8;

  // Project name
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text(project.name, m, y);
  y += 5;

  // Project details line
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const infoParts = [
    project.protocol,
    project.cattle_type,
    project.head_count ? `${project.head_count} head` : null,
    project.breeding_date ? `Breed: ${format(parseISO(project.breeding_date), "MMM d, yyyy")}` : null,
  ].filter(Boolean);
  if (infoParts.length) {
    doc.text(infoParts.join("  \u00B7  "), m, y);
    y += 5;
  }

  // Invoice numbers
  const invParts: string[] = [];
  if (billing.catl_invoice_number) invParts.push(`CATL: ${billing.catl_invoice_number}`);
  if (billing.select_sires_invoice_number) invParts.push(`Select Sires: ${billing.select_sires_invoice_number}`);
  if (billing.zoho_project_id) invParts.push(`Project ID: ${billing.zoho_project_id}`);
  if (invParts.length) {
    doc.text(invParts.join("    "), m, y);
    y += 5;
  }

  // Status
  const statusLabels: Record<string, string> = {
    in_process: "In Process",
    work_complete: "Work Complete",
    invoiced_closed: "Invoiced & Closed",
  };
  doc.text(`Status: ${statusLabels[billing.status] || billing.status || "\u2014"}`, m, y);
  y += 4;

  // Thin rule
  doc.setDrawColor(200);
  doc.setLineWidth(0.3);
  doc.line(m, y, pw - m, y);
  y += 5;

  /* ── Products & Services ── */
  const visibleProducts = products.filter(
    (p: any) => (p.doses > 0) || ((p.line_total ?? 0) > 0) || ((p.units_billed ?? 0) > 0)
  );

  if (visibleProducts.length > 0) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(100);
    doc.text("PRODUCTS & SERVICES", m, y);
    doc.setTextColor(0);
    y += 2;

    const prodBody = visibleProducts.map((p: any) => {
      const label = p.product_name +
        (p.protocol_event_label ? ` \u2014 ${p.protocol_event_label}` : "");
      const dpu = p.doses_per_unit;
      const units = dpu && dpu > 0 ? (p.doses / dpu).toFixed(1) : null;
      const unitsStr = units ? `${units} ${p.unit_label || ""}`.trim() : "";
      const unitsBilled = p.units_billed ?? 0;
      let qtyStr: string;
      if (p.doses > 0) {
        qtyStr = [`${p.doses} hd`, unitsStr].filter(Boolean).join(" \u00B7 ");
      } else if (unitsBilled > 0) {
        qtyStr = `${unitsBilled} units`;
      } else {
        qtyStr = "\u2014";
      }
      const lineTotal = parseFloat(p.line_total ?? 0) || 0;

      return [
        label,
        { content: qtyStr, styles: { halign: "right" as const } },
        { content: p.unit_price ? formatDollar(p.unit_price) : "\u2014", styles: { halign: "right" as const } },
        { content: formatDollar(lineTotal), styles: { halign: "right" as const, fontStyle: "bold" as const } },
      ];
    });

    prodBody.push([
      "",
      "",
      { content: "Subtotal", styles: { halign: "right" as const, fontStyle: "bold" as const } },
      { content: formatDollar(totals.productsTotal), styles: { halign: "right" as const, fontStyle: "bold" as const } },
    ]);

    autoTable(doc, {
      startY: y,
      head: [["Product", { content: "Qty", styles: { halign: "right" as const } }, { content: "Price", styles: { halign: "right" as const } }, { content: "Total", styles: { halign: "right" as const } }]],
      body: prodBody,
      margin: { left: m, right: m },
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { ...getStandardHeadStylesDark(), fontSize: 7 },
      columnStyles: {
        0: { cellWidth: "auto" },
        1: { cellWidth: 40 },
        2: { cellWidth: 22 },
        3: { cellWidth: 24 },
      },
      didParseCell: (data) => {
        if (data.row.index === prodBody.length - 1) {
          data.cell.styles.fillColor = [245, 245, 245];
        }
      },
    });
    y = (doc as any).lastAutoTable.finalY + 5;
  }

  /* ── Semen ── */
  const visibleSemen = semen.filter((s: any) => (s.units_packed ?? 0) > 0 || (s.units_billable ?? 0) > 0);
  if (visibleSemen.length > 0) {
    if (y > 220) { doc.addPage(); y = 16; }
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(100);
    doc.text("SEMEN", m, y);
    doc.setTextColor(0);
    y += 2;

    const semBody = visibleSemen.map((s: any) => {
      const packed = s.units_packed ?? 0;
      const returned = s.units_returned ?? 0;
      const used = packed - returned;
      const blown = s.units_blown ?? 0;
      const billable = s.units_billable ?? 0;

      return [
        { content: s.bull_name, styles: { fontStyle: "bold" as const } },
        s.bull_code || "",
        { content: String(packed), styles: { halign: "right" as const } },
        { content: used > 0 ? String(used) : "\u2014", styles: { halign: "right" as const } },
        { content: blown > 0 ? String(blown) : "\u2014", styles: { halign: "right" as const } },
        { content: billable > 0 ? String(billable) : "\u2014", styles: { halign: "right" as const, fontStyle: "bold" as const } },
        { content: formatDollar(s.unit_price), styles: { halign: "right" as const } },
        { content: formatDollar(s.line_total), styles: { halign: "right" as const, fontStyle: "bold" as const } },
      ];
    });

    semBody.push([
      "", "", "", "", "", "",
      { content: "Subtotal", styles: { halign: "right" as const, fontStyle: "bold" as const } },
      { content: formatDollar(totals.semenTotal), styles: { halign: "right" as const, fontStyle: "bold" as const } },
    ]);

    autoTable(doc, {
      startY: y,
      head: [[
        "Bull", "Code",
        { content: "Packed", styles: { halign: "right" as const } },
        { content: "Used", styles: { halign: "right" as const } },
        { content: "Blown", styles: { halign: "right" as const } },
        { content: "Billable", styles: { halign: "right" as const } },
        { content: "Price", styles: { halign: "right" as const } },
        { content: "Total", styles: { halign: "right" as const } },
      ]],
      body: semBody,
      margin: { left: m, right: m },
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { ...getStandardHeadStylesDark(), fontSize: 7 },
      columnStyles: {
        2: { cellWidth: 16 },
        3: { cellWidth: 14 },
        4: { cellWidth: 14 },
        5: { cellWidth: 16 },
        6: { cellWidth: 18 },
        7: { cellWidth: 22 },
      },
      didParseCell: (data) => {
        if (data.row.index === semBody.length - 1) {
          data.cell.styles.fillColor = [245, 245, 245];
        }
      },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  /* ── Grand Total ── */
  if (y > 250) { doc.addPage(); y = 16; }

  doc.setDrawColor(60);
  doc.setLineWidth(0.5);
  doc.line(pw - m - 60, y, pw - m, y);
  y += 6;

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Grand Total", pw - m - 60, y);
  doc.text(formatDollar(totals.grandTotal), pw - m, y, { align: "right" });
  y += 10;

  /* ── Notes ── */
  if (billing.notes) {
    if (y > 240) { doc.addPage(); y = 16; }
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("Notes", m, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    const noteLines = doc.splitTextToSize(billing.notes, pw - m * 2);
    doc.text(noteLines, m, y);
  }

  /* ── Footer ── */
  addFooterToPdf(doc, "BeefSynch by Chuteside, LLC", PDF_LAYOUT.footerOffsetMini);

  /* ── Save ── */
  const safeName = project.name.replace(/[^a-zA-Z0-9 ]/g, "").replace(/\s+/g, "_");
  doc.save(`BeefSynch_Billing_${safeName}_${format(new Date(), "yyyy-MM-dd")}.pdf`);
}
