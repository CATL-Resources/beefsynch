import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format, parseISO } from "date-fns";
import {
  addStandardHeader,
  addFooterToPdf,
  buildPdfFilename,
  getStandardHeadStyles,
  PDF_FONTS,
  PDF_LAYOUT,
} from "./pdfUtils";

export interface PackingListLine {
  bull_name: string;
  bull_code: string | null;
  units: number;
  source_tank_label: string;
  source_canister: string | null;
  destination_canister: string | null;
  bills_through: "Select" | "CATL" | "—";
}

export interface PackingListInput {
  customerName: string;
  orderDate: string | null;
  fulfilledAt: string;
  destinationTank: { tank_number: string | number; tank_name: string | null } | null;
  isPickup: boolean;
  lines: PackingListLine[];
}

export function generatePackingListPdf(input: PackingListInput) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = PDF_LAYOUT.margin;
  let y: number = margin;

  y = addStandardHeader(doc, margin, "BeefSynch", "Packing List");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(PDF_FONTS.sizeSubhead);
  doc.text(input.customerName, margin, y);
  y += 16;

  doc.setFontSize(PDF_FONTS.sizeBodyTiny);
  doc.setFont("helvetica", "normal");

  const orderDate = input.orderDate ? format(parseISO(input.orderDate), "MMMM d, yyyy") : "—";
  const fulfilledOn = format(parseISO(input.fulfilledAt), "MMMM d, yyyy h:mm a");
  const dest = input.isPickup
    ? "Customer pickup"
    : input.destinationTank
      ? (input.destinationTank.tank_name
        ? `${input.destinationTank.tank_number} — ${input.destinationTank.tank_name}`
        : String(input.destinationTank.tank_number))
      : "—";

  for (const [label, value] of [
    ["Order Date", orderDate],
    ["Fulfilled", fulfilledOn],
    ["Destination", dest],
  ] as [string, string][]) {
    doc.setFont("helvetica", "bold");
    doc.text(`${label}:`, margin, y);
    doc.setFont("helvetica", "normal");
    doc.text(value, margin + 110, y);
    y += PDF_LAYOUT.lineHeight;
  }
  y += 6;

  const body = input.lines.map((l) => [
    l.bull_name,
    l.bull_code ?? "—",
    String(l.units),
    `${l.source_tank_label}${l.source_canister ? ` · can ${l.source_canister}` : ""}`,
    l.destination_canister ?? (input.isPickup ? "—" : "1"),
    l.bills_through,
  ]);
  const totalUnits = input.lines.reduce((s, l) => s + l.units, 0);
  body.push(["", "", String(totalUnits), "Total", "", ""]);

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [["Bull", "Code", "Units", "Pulled from", "Packed into", "Bills through"]],
    body,
    styles: { fontSize: PDF_FONTS.sizeSmall, cellPadding: 4 },
    headStyles: getStandardHeadStyles(),
    alternateRowStyles: { fillColor: [245, 245, 245] },
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { cellWidth: 80 },
      2: { cellWidth: 50, halign: "right" },
      3: { cellWidth: "auto" },
      4: { cellWidth: 100, halign: "center" },
      5: { cellWidth: 90 },
    },
    didParseCell: (data) => {
      if (data.row.index === body.length - 1 && data.section === "body") {
        data.cell.styles.fontStyle = "bold";
      }
    },
  });

  addFooterToPdf(doc, "BeefSynch by Chuteside, LLC");

  const safeDate = format(parseISO(input.fulfilledAt), "yyyyMMdd");
  doc.save(buildPdfFilename("BeefSynch_Packing_List", input.customerName, safeDate));
}
