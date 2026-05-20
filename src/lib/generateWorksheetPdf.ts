import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format, parseISO } from "date-fns";
import {
  addFooterToPdf,
  getStandardHeadStylesDark,
  PDF_LAYOUT,
  sanitizeFilename,
} from "./pdfUtils";

interface PackInfo {
  status?: string | null;
  pack_type?: string | null;
  tanks?: { tank_number?: string | number | null; tank_name?: string | null } | null;
}

interface SemenSummary {
  bull_name: string;
  bull_code: string | null;
  units_packed: number | null;
  units_blown: number | null;
  units_billable: number | null;
}

interface PackLineRow {
  bull_name: string;
  bull_code: string | null;
  canister: string;
  packed: number;
}

interface SessionDetail {
  bull_name: string;
  bull_code: string | null;
  canister: string;
  packed: number;
  sessions: Record<number, { start: number | null; end: number | null }>;
  returned: number | null;
}

interface BreedingSession {
  id?: string;
  session_label: string | null;
  session_date: string;
  time_of_day: string | null;
  sort_order: number | null;
}

const DELIVERY_LABELS: Record<string, string> = {
  not_yet: "",
  delivered: "Delivered",
  customer_pickup: "Cust Pickup",
  customer_administered: "Cust Admin",
  catl_administered: "CATL Admin",
};

function nz(val: number | null | undefined): string {
  if (val == null || val === 0) return "";
  return String(val);
}

function bullLabel(name: string, code: string | null | undefined): string {
  if (!name) return "";
  return code ? `${name} (${code})` : name;
}

function drawCheckbox(doc: jsPDF, x: number, y: number, size: number = 3.5) {
  doc.setDrawColor(80);
  doc.setLineWidth(0.25);
  doc.rect(x, y, size, size);
}

/**
 * Breeding Worksheet PDF — single landscape letter page.
 * Layout: compact header · session detail grid (with Used column) ·
 * bottom split (products + labor left, notes right) · footer with
 * tank packed / unpacked checkboxes.
 */
export function generateWorksheetPdf(
  project: any,
  _events: any[],
  bulls: any[],
  products: any[],
  packInfo: PackInfo | null,
  extra?: {
    semenLines?: SemenSummary[];
    breedingSessions?: BreedingSession[];
    sessionDetails?: SessionDetail[];
    packLines?: PackLineRow[];
    laborEntries?: { description: string; labor_dates: string | null }[];
    unpackLines?: { bull_name: string; bull_code: string | null; units_returned: number; destination_label: string | null }[];
    packStatus?: string | null;
  },
) {
  void _events; // protocol schedule isn't on the field worksheet anymore
  const semenLines = extra?.semenLines ?? [];
  const breedingSessions = extra?.breedingSessions ?? [];
  const sessionDetails = extra?.sessionDetails ?? [];
  const packLines = extra?.packLines ?? [];
  const laborEntries = extra?.laborEntries ?? [];

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "letter" });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const m = 10;

  /* ── Header ── */
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(120);
  doc.text("CATL RESOURCES", m, 9);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(0);
  doc.text(project.name || "Project", m, 16);

  // Right-aligned project metadata
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  const infoParts: string[] = [];
  if (project.protocol) infoParts.push(project.protocol);
  if (project.cattle_type) infoParts.push(project.cattle_type);
  if (project.head_count) infoParts.push(`${project.head_count} head`);
  if (infoParts.length) doc.text(infoParts.join("  ·  "), pw - m, 9, { align: "right" });

  if (project.breeding_date) {
    doc.text(
      `Breeding: ${format(parseISO(project.breeding_date), "MMM d, yyyy")}`,
      pw - m, 14, { align: "right" },
    );
  }

  const tankLabel = packInfo?.tanks?.tank_name || packInfo?.tanks?.tank_number || "";
  if (tankLabel) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Field tank: ${tankLabel}`, pw - m, 19, { align: "right" });
  }

  doc.setDrawColor(60);
  doc.setLineWidth(0.4);
  doc.line(m, 22, pw - m, 22);

  let y = 26;

  /* ── Session legend ── */
  const sortedSessions = [...breedingSessions].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.session_date.localeCompare(b.session_date),
  );
  // Use the last 4 sessions if there are more than 4
  const shownSessions = sortedSessions.slice(-4);
  if (shownSessions.length > 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(80);
    const legend = shownSessions
      .map((s, i) => {
        const label = s.session_label || "Breeding";
        const date = s.session_date ? format(parseISO(s.session_date), "M/d") : "";
        const tod = s.time_of_day ? ` ${s.time_of_day}` : "";
        return `S${i + 1} = ${label} (${date}${tod})`;
      })
      .join("  ·  ");
    doc.text(legend, m, y);
    doc.setTextColor(0);
    y += 4;
  }

  /* ── Session detail grid ── */
  const maxSessions = 4;
  const sessionHead: any[] = [
    "Bull",
    { content: "Can", styles: { halign: "center" as const } },
    { content: "Packed", styles: { halign: "center" as const } },
  ];
  for (let i = 0; i < maxSessions; i++) {
    sessionHead.push({ content: `S${i + 1} st`, styles: { halign: "center" as const } });
    sessionHead.push({ content: `S${i + 1} end`, styles: { halign: "center" as const } });
  }
  sessionHead.push({
    content: "Blown",
    styles: { halign: "center" as const, fillColor: [180, 60, 60] as any, textColor: 255 },
  });
  sessionHead.push({
    content: "Used",
    styles: { halign: "center" as const, fillColor: [30, 110, 170] as any, textColor: 255 },
  });
  sessionHead.push({ content: "Ret'd", styles: { halign: "center" as const } });

  const blownByBull = new Map<string, number>();
  for (const sl of semenLines) {
    if ((sl.units_blown ?? 0) > 0) blownByBull.set(sl.bull_name, sl.units_blown ?? 0);
  }

  // Map original session index → displayed slot when we trim to last 4.
  const sessionOffset = Math.max(0, sortedSessions.length - maxSessions);

  let sessionBody: any[][] = [];
  if (sessionDetails.length > 0) {
    sessionBody = sessionDetails.map((sd) => {
      const row: any[] = [
        bullLabel(sd.bull_name, sd.bull_code),
        { content: sd.canister || "", styles: { halign: "center" as const } },
        { content: nz(sd.packed), styles: { halign: "center" as const } },
      ];
      let lastEnd: number | null = null;
      for (let i = 0; i < maxSessions; i++) {
        const sess = sd.sessions[sessionOffset + i];
        row.push({ content: nz(sess?.start), styles: { halign: "center" as const } });
        row.push({ content: nz(sess?.end), styles: { halign: "center" as const } });
        if (sess?.end != null) lastEnd = sess.end;
      }
      const blown = blownByBull.get(sd.bull_name) ?? 0;
      const returned = sd.returned ?? lastEnd ?? 0;
      const used = Math.max(0, sd.packed - returned - blown);
      row.push({
        content: nz(blown),
        styles: {
          halign: "center" as const,
          textColor: blown > 0 ? ([180, 60, 60] as any) : 100,
          fontStyle: "bold" as const,
        },
      });
      row.push({
        content: used > 0 ? String(used) : "",
        styles: {
          halign: "center" as const,
          textColor: used > 0 ? ([30, 110, 170] as any) : 100,
          fontStyle: "bold" as const,
        },
      });
      row.push({ content: nz(sd.returned), styles: { halign: "center" as const } });
      return row;
    });
  } else if (packLines.length > 0) {
    sessionBody = packLines.map((pl) => {
      const row: any[] = [
        bullLabel(pl.bull_name, pl.bull_code),
        { content: pl.canister, styles: { halign: "center" as const } },
        { content: nz(pl.packed), styles: { halign: "center" as const } },
      ];
      for (let i = 0; i < maxSessions * 2; i++) {
        row.push({ content: "", styles: { halign: "center" as const } });
      }
      row.push({ content: "", styles: { halign: "center" as const } });
      row.push({ content: "", styles: { halign: "center" as const } });
      row.push({ content: "", styles: { halign: "center" as const } });
      return row;
    });
  }

  // Always include four blank write-in rows
  const totalCols = 3 + maxSessions * 2 + 3;
  for (let i = 0; i < 4; i++) {
    const blank: any[] = [];
    for (let j = 0; j < totalCols; j++) blank.push("");
    sessionBody.push(blank);
  }

  const colStyles: Record<number, any> = {
    0: { cellWidth: 48 },
    1: { cellWidth: 14 },
    2: { cellWidth: 14 },
  };
  for (let i = 0; i < maxSessions * 2; i++) {
    colStyles[3 + i] = { cellWidth: 14 };
  }
  colStyles[3 + maxSessions * 2] = { cellWidth: 14 };     // Blown
  colStyles[3 + maxSessions * 2 + 1] = { cellWidth: 16 }; // Used
  colStyles[3 + maxSessions * 2 + 2] = { cellWidth: 14 }; // Ret'd

  autoTable(doc, {
    startY: y,
    margin: { left: m, right: m },
    head: [sessionHead],
    body: sessionBody,
    styles: { fontSize: 8, cellPadding: 1.6, lineColor: [60, 60, 60], lineWidth: 0.15 },
    headStyles: { ...getStandardHeadStylesDark(), fontSize: 7 },
    columnStyles: colStyles,
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  /* ── Bottom half: products + labor (left) / notes (right) ── */
  const splitGap = 5;
  const colWidth = (pw - 2 * m - splitGap) / 2;
  const leftRight = m + colWidth;
  const rightLeft = leftRight + splitGap;

  // Products table (left half)
  const visibleProducts = (products || []).filter((p: any) =>
    (p.delivery_method && p.delivery_method !== "not_yet") ||
    (p.doses ?? 0) > 0 ||
    (p.units_billed ?? 0) > 0,
  );
  const productBody = visibleProducts.map((p: any) => {
    const qty = (p.units_billed ?? 0) > 0
      ? `${p.units_billed} ${p.unit_label || ""}`.trim()
      : (p.doses ?? 0) > 0
        ? `${p.doses} hd`
        : "";
    return [p.product_name || "", qty, DELIVERY_LABELS[p.delivery_method ?? "not_yet"] ?? "", ""];
  });
  // Blank write-in rows
  for (let i = 0; i < 3; i++) productBody.push(["", "", "", ""]);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Products", m, y);

  autoTable(doc, {
    startY: y + 2,
    margin: { left: m, right: pw - leftRight },
    head: [["Product", "Qty", "Delivery", { content: "✓", styles: { halign: "center" as const } }]],
    body: productBody,
    styles: { fontSize: 9, cellPadding: 1.6, lineColor: [60, 60, 60], lineWidth: 0.15 },
    headStyles: { ...getStandardHeadStylesDark(), fontSize: 8 },
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { cellWidth: 24 },
      2: { cellWidth: 28 },
      3: { cellWidth: 10 },
    },
    didDrawCell: (data) => {
      if (data.section === "body" && data.column.index === 3) {
        const cx = data.cell.x + (data.cell.width - 3.5) / 2;
        const cy = data.cell.y + (data.cell.height - 3.5) / 2;
        drawCheckbox(doc, cx, cy, 3.5);
      }
    },
  });
  let leftBottom = (doc as any).lastAutoTable.finalY + 4;

  // Labor (left half, below products) — compact, reference only
  if (laborEntries.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("Labor", m, leftBottom);
    const laborBody = laborEntries.map((l) => [l.labor_dates || "", l.description || ""]);
    autoTable(doc, {
      startY: leftBottom + 2,
      margin: { left: m, right: pw - leftRight },
      head: [["Date", "Description"]],
      body: laborBody,
      styles: { fontSize: 9, cellPadding: 1.6, lineColor: [60, 60, 60], lineWidth: 0.15 },
      headStyles: { ...getStandardHeadStylesDark(), fontSize: 8 },
      columnStyles: { 0: { cellWidth: 30 }, 1: { cellWidth: "auto" } },
    });
    leftBottom = (doc as any).lastAutoTable.finalY + 4;
  }

  // Notes (right half)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Notes", rightLeft, y);

  let noteY = y + 4;
  if (project.notes) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(110);
    const lines = doc.splitTextToSize(project.notes, colWidth);
    doc.text(lines, rightLeft, noteY);
    noteY += lines.length * 3.5 + 2;
    doc.setTextColor(0);
  }
  // Ruled writing lines
  const footerY = ph - 10;
  const lineSpacing = 6.5;
  doc.setDrawColor(140);
  doc.setLineWidth(0.2);
  while (noteY + lineSpacing < footerY - 4 && noteY < (leftBottom > 0 ? Math.max(leftBottom, ph - 30) : ph - 30)) {
    doc.line(rightLeft, noteY, pw - m, noteY);
    noteY += lineSpacing;
  }

  /* ── Footer: brand + pack checkboxes ── */
  const packLabel = "Tank packed";
  const unpackLabel = "Tank unpacked";
  const boxSize = 3.5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(0);
  const packLabelW = doc.getTextWidth(packLabel);
  const unpackLabelW = doc.getTextWidth(unpackLabel);
  const gap = 12;
  const totalW = packLabelW + boxSize + 2 + gap + unpackLabelW + boxSize + 2;
  const startX = pw - m - totalW;
  doc.text(packLabel, startX, footerY);
  drawCheckbox(doc, startX + packLabelW + 2, footerY - 3, boxSize);
  doc.text(unpackLabel, startX + packLabelW + 2 + boxSize + gap, footerY);
  drawCheckbox(doc, startX + packLabelW + 2 + boxSize + gap + unpackLabelW + 2, footerY - 3, boxSize);

  addFooterToPdf(doc, "BeefSynch by Chuteside, LLC", PDF_LAYOUT.footerOffsetMini);

  void bulls;
  const safeName = sanitizeFilename(project.name || "project");
  doc.save(`BeefSynch_Breeding_Worksheet_${safeName}_${format(new Date(), "yyyy-MM-dd")}.pdf`);
}
