import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format, parseISO } from "date-fns";
import {
  addStandardHeader,
  addFooterToPdf,
  buildPdfFilename,
  getStandardHeadStyles,
  ensurePageSpace,
  PDF_COLORS,
  PDF_LAYOUT,
  PDF_FONTS,
} from "./pdfUtils";
import { sanitizeFilename } from "./pdfUtils";
import { getBullDisplayName } from "./bullDisplay";

interface OrderData {
  customer_name: string;
  order_date: string | null;
  fulfillment_status: string;
  billing_status: string;
  notes: string | null;
  project_name?: string | null;
}

interface OrderItemData {
  units: number;
  custom_bull_name: string | null;
  bills_through: string | null;
  bulls_catalog: {
    bull_name: string;
    company: string;
    registration_number: string;
  } | null;
}

interface ReconciliationLine {
  bull_name: string;
  bull_code: string | null;
  units: number;
  source: string;
}

interface ReconciliationData {
  type: "received" | "packed";
  lines: ReconciliationLine[];
  totalOrdered: number;
  totalFulfilled: number;
}

interface OrderSupplyData {
  product_name: string;
  quantity: number;
  unit_label: string | null;
  unit_price: number | null;
  line_total: number | null;
}

export function generateOrderPdf(
  order: OrderData,
  items: OrderItemData[],
  reconciliation?: ReconciliationData | null,
  supplies?: OrderSupplyData[] | null,
) {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = PDF_LAYOUT.margin;
  let y: number = margin;

  // Header
  y = addStandardHeader(doc, margin, "BeefSynch", "Semen Order");

  // Customer Info
  doc.setFont("helvetica", "bold");
  doc.setFontSize(PDF_FONTS.sizeSubhead);
  doc.text(order.customer_name, margin, y);
  y += 16;

  const infoRows: [string, string][] = [
    ["Order Date", order.order_date ? format(parseISO(order.order_date), "MMMM d, yyyy") : "—"],
    ["Fulfillment", order.fulfillment_status.charAt(0).toUpperCase() + order.fulfillment_status.slice(1)],
    ["Billing", order.billing_status.charAt(0).toUpperCase() + order.billing_status.slice(1)],
  ];

  if (order.project_name) infoRows.push(["Linked Project", order.project_name]);

  doc.setFontSize(PDF_FONTS.sizeBodyTiny);
  for (const [label, value] of infoRows) {
    doc.setFont("helvetica", "bold");
    doc.text(`${label}:`, margin, y);
    doc.setFont("helvetica", "normal");
    doc.text(value, margin + 110, y);
    y += PDF_LAYOUT.lineHeight;
  }
  y += 6;

  // Bulls table
  if (items.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Bulls & Units", margin, y);
    y += 4;

    const tableBody = items.map((item) => [
      getBullDisplayName(item),
      item.bulls_catalog?.company || "—",
      item.bulls_catalog?.registration_number || "—",
      item.bills_through || "—",
      String(item.units),
    ]);

    const totalUnits = items.reduce((s, i) => s + i.units, 0);
    tableBody.push(["", "", "", "Total", String(totalUnits)]);

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [["Bull Name", "Company", "Reg #", "Bills Through", "Units"]],
      body: tableBody,
      styles: { fontSize: PDF_FONTS.sizeSmall, cellPadding: 3 },
      headStyles: getStandardHeadStyles(),
      alternateRowStyles: { fillColor: [245, 245, 245] },
      didParseCell: (data) => {
        if (data.row.index === tableBody.length - 1 && data.section === "body") {
          data.cell.styles.fontStyle = "bold";
        }
      },
    });
  }

  // Reconciliation
  if (reconciliation && reconciliation.lines.length > 0) {
    let reconY = ((doc as any).lastAutoTable?.finalY ?? y) + 12;
    reconY = ensurePageSpace(doc, reconY, 80, margin);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(reconciliation.type === "packed" ? "Packed from Inventory" : "Received Shipments", margin, reconY);
    reconY += 4;

    const reconBody = reconciliation.lines.map((line) => [
      line.bull_name,
      line.bull_code || "—",
      line.source,
      String(line.units),
    ]);

    autoTable(doc, {
      startY: reconY,
      margin: { left: margin, right: margin },
      head: [["Bull", "Code", reconciliation.type === "packed" ? "Source Tank" : "Shipment", "Units"]],
      body: reconBody,
      styles: { fontSize: PDF_FONTS.sizeSmall, cellPadding: 3 },
      headStyles: getStandardHeadStyles(),
      alternateRowStyles: { fillColor: [245, 245, 245] },
    });

    let summaryY = ((doc as any).lastAutoTable?.finalY ?? reconY) + 8;
    summaryY = ensurePageSpace(doc, summaryY, 30, margin);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    const outstanding = reconciliation.totalOrdered - reconciliation.totalFulfilled;
    const summaryText = `Ordered: ${reconciliation.totalOrdered}  |  ${reconciliation.type === "packed" ? "Packed" : "Received"}: ${reconciliation.totalFulfilled}  |  Outstanding: ${outstanding >= 0 ? outstanding : 0}`;
    doc.text(summaryText, margin, summaryY);

    if (outstanding <= 0) {
      doc.setFont("helvetica", "bold");
      doc.setTextColor(34, 139, 34);
      doc.text("  ✓ Fully fulfilled", margin + doc.getTextWidth(summaryText) + 5, summaryY);
      doc.setTextColor(0, 0, 0);
    }
  }

  // Supplies
  if (supplies && supplies.length > 0) {
    let supplyY = ((doc as any).lastAutoTable?.finalY ?? y) + 12;
    supplyY = ensurePageSpace(doc, supplyY, 80, margin);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Supplies", margin, supplyY);
    supplyY += 4;

    const supplyBody = supplies.map((s) => [
      s.product_name,
      String(s.quantity),
      s.unit_label || "—",
      `$${(Number(s.unit_price) || 0).toFixed(2)}`,
      `$${(Number(s.line_total) || 0).toFixed(2)}`,
    ]);

    const supplyTotal = supplies.reduce((sum, i) => sum + (Number(i.line_total) || 0), 0);
    supplyBody.push(["", "", "", "Total", `$${supplyTotal.toFixed(2)}`]);

    autoTable(doc, {
      startY: supplyY,
      margin: { left: margin, right: margin },
      head: [["Product", "Qty", "Unit", "Price", "Total"]],
      body: supplyBody,
      styles: { fontSize: PDF_FONTS.sizeSmall, cellPadding: 3 },
      headStyles: getStandardHeadStyles(),
      alternateRowStyles: { fillColor: [245, 245, 245] },
      didParseCell: (data) => {
        if (data.row.index === supplyBody.length - 1 && data.section === "body") {
          data.cell.styles.fontStyle = "bold";
        }
      },
    });
  }

  // Notes
  const finalY = (doc as any).lastAutoTable?.finalY ?? y + 12;
  let notesY = finalY + 12;

  if (order.notes) {
    notesY = ensurePageSpace(doc, notesY, 60, margin);
    if (notesY !== finalY + 12) {
      // We added a page, so reset notesY
      notesY = margin;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Notes", margin, notesY);
    notesY += 10;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(order.notes, pageWidth - margin * 2);
    doc.text(lines, margin, notesY);
  }

  addFooterToPdf(doc, "BeefSynch by Chuteside, LLC");

  const safeDate = (order.order_date ?? new Date().toISOString().slice(0, 10)).replace(/-/g, "");
  doc.save(buildPdfFilename("BeefSynch_Order", order.customer_name, safeDate));
}
