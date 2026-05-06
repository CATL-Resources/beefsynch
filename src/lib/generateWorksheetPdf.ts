import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format, parseISO } from "date-fns";
import {
  addFooterToPdf,
  getStandardHeadStylesDark,
  PDF_LAYOUT,
  sanitizeFilename,
} from "./pdfUtils";
import { formatTime12, isNoTimeEvent } from "./formatUtils";

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

/** Show number only if > 0, otherwise blank */
function nz(val: number | null | undefined): string {
  if (val == null || val === 0) return "";
  return String(val);
}

/** Compact time: "7:00a" instead of "7:00 AM" */
function compactTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const ampm = h >= 12 ? "p" : "a";
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")}${ampm}`;
}

/** Events to exclude from the breeding worksheet entirely */
const EXCLUDED_EVENTS = ["Return Heat", "Estimated Calving"];

/** Draw a checkbox rectangle (no Unicode issues) */
function drawCheckbox(doc: jsPDF, x: number, y: number, size: number = 3.5) {
  doc.setDrawColor(80);
  doc.setLineWidth(0.25);
  doc.rect(x, y, size, size);
}

/**
 * Breeding Worksheet PDF — two pages.
 * Page 1 (portrait): protocol schedule, semen billable summary, products.
 * Page 2 (landscape): bull packed summary, session detail grid (S1-S4), notes.
 */
export function generateWorksheetPdf(
  project: any,
  events: any[],
  bulls: any[],
  products: any[],
  packInfo: PackInfo | null,
  extra?: {
    semenLines?: SemenSummary[];
    breedingSessions?: BreedingSession[];
    sessionDetails?: SessionDetail[];
  },
) {
  const semenLines = extra?.semenLines ?? [];
  const breedingSessions = extra?.breedingSessions ?? [];
  const sessionDetails = extra?.sessionDetails ?? [];
  const hasEnhancedData = semenLines.length > 0;

  // Filter out Return Heat and Estimated Calving from protocol schedule
  const filteredEvents = events.filter(
    (ev: any) => !EXCLUDED_EVENTS.includes(ev.event_name?.trim())
  );

  /* ================================================================
   * PAGE 1 — PORTRAIT — Billable items
   * ================================================================ */
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
  const pw = doc.internal.pageSize.getWidth();
  const m = 12;

  /* -- Header -- */
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text("CATL RESOURCES", m, 14);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(0);
  doc.text("Breeding Worksheet", m, 21);

  // Right side: protocol, type, head count — BOLD and BIGGER
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(0);
  const infoParts: string[] = [];
  if (project.protocol) infoParts.push(project.protocol);
  if (project.cattle_type) infoParts.push(project.cattle_type);
  if (project.head_count) infoParts.push(`${project.head_count} head`);
  if (infoParts.length) doc.text(infoParts.join("  ·  "), pw - m, 16, { align: "right" });

  // Customer name + breeding date
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(project.name || "Project", m, 30);

  if (project.breeding_date) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(80);
    doc.text(
      `Breeding: ${format(parseISO(project.breeding_date), "MMMM d, yyyy")}`,
      pw - m, 30, { align: "right" }
    );
    doc.setTextColor(0);
  }

  doc.setDrawColor(60);
  doc.setLineWidth(0.4);
  doc.line(m, 34, pw - m, 34);

  let y = 40;

  /* -- Protocol Schedule -- */
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Protocol schedule", m, y);

  const breedingDateStr = project.breeding_date || "";
  const eventBody = filteredEvents.map((ev: any) => {
    // Date with year: "4/6/26"
    const dateStr = ev.event_date
      ? format(parseISO(ev.event_date), "M/d/yy")
      : "";
    // Compact time on same line: "10:00a"
    const timeStr = ev.event_time && !isNoTimeEvent(ev.event_name)
      ? compactTime(ev.event_time)
      : "";
    const isBreeding = ev.event_date === breedingDateStr;
    const style = isBreeding ? ("bold" as const) : ("normal" as const);
    return [
      { content: dateStr, styles: { fontStyle: style } },
      { content: timeStr, styles: { fontStyle: style } },
      { content: ev.event_name || "", styles: { fontStyle: style } },
      "", // Labor — blank for handwriting
    ];
  });
  // One blank row for write-ins
  eventBody.push(["", "", "", ""]);

  autoTable(doc, {
    startY: y + 2,
    margin: { left: m, right: m },
    head: [["Date", "Time", "Event", "Labor"]],
    body: eventBody.length > 1 ? eventBody : [["", "", "No events scheduled", ""]],
    styles: { fontSize: 9, cellPadding: 2, lineColor: [60, 60, 60], lineWidth: 0.15 },
    headStyles: { ...getStandardHeadStylesDark(), fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 20 },   // Date — fits "4/19/26"
      1: { cellWidth: 18 },   // Time — fits "10:00a" on one line
      2: { cellWidth: 50 },   // Event — narrower, fits content
      3: { cellWidth: "auto" }, // Labor — gets ALL remaining space
    },
    didParseCell: (data) => {
      if (data.section !== "body") return;
      const ev = filteredEvents[data.row.index];
      if (ev && ev.event_date === breedingDateStr) {
        data.cell.styles.fillColor = [240, 240, 240];
      }
    },
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  /* -- Semen — Billable Summary -- */
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Semen — billable summary", m, y);

  // Tank info line
  if (packInfo) {
    const tankLabel = packInfo.tanks?.tank_name || packInfo.tanks?.tank_number || "";
    const totalPacked = hasEnhancedData
      ? semenLines.reduce((s, l) => s + (l.units_packed ?? 0), 0)
      : bulls.reduce((s: number, b: any) => s + (b.units ?? 0), 0);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    y += 4;
    let tankLine = "";
    if (tankLabel) tankLine += `Field tank: ${tankLabel}`;
    if (totalPacked > 0) tankLine += `${tankLine ? "    ·    " : ""}Total packed: ${totalPacked}`;
    tankLine += `${tankLine ? "        " : ""}Tank packed `;
    doc.text(tankLine, m, y);
    // Draw checkboxes instead of Unicode
    const tankLineWidth = doc.getTextWidth(tankLine);
    drawCheckbox(doc, m + tankLineWidth, y - 2.8);
    const afterFirstBox = m + tankLineWidth + 7;
    doc.text("Tank unpacked ", afterFirstBox, y);
    drawCheckbox(doc, afterFirstBox + doc.getTextWidth("Tank unpacked "), y - 2.8);
  }

  const semenData = hasEnhancedData
    ? semenLines
    : bulls.map((b: any) => ({
        bull_name: b.bulls_catalog?.bull_name || b.custom_bull_name || "",
        bull_code: b.bulls_catalog?.naab_code || b.bull_code || "",
        units_packed: b.units ?? null,
        units_blown: null,
        units_billable: null,
      }));

  // Filter out bulls with nothing to show (all zeros)
  const semenBody = semenData
    .filter(sl => (sl.units_packed ?? 0) > 0 || (sl.units_blown ?? 0) > 0 || (sl.units_billable ?? 0) > 0 || sl.bull_name)
    .map(sl => [
      sl.bull_name || "",
      { content: nz(sl.units_packed), styles: { halign: "center" as const } },
      { content: "", styles: { halign: "center" as const } }, // Used — filled in by hand
      { content: nz(sl.units_blown), styles: { halign: "center" as const } },
      { content: nz(sl.units_billable), styles: { halign: "center" as const } },
    ]);
  // Blank rows
  for (let i = 0; i < 2; i++) semenBody.push(["", "", "", "", ""]);

  autoTable(doc, {
    startY: y + 2,
    margin: { left: m, right: m },
    head: [[
      "Bull",
      { content: "Packed", styles: { halign: "center" as const } },
      { content: "Used", styles: { halign: "center" as const } },
      { content: "Blown", styles: { halign: "center" as const } },
      { content: "Billable", styles: { halign: "center" as const } },
    ]],
    body: semenBody,
    styles: { fontSize: 9, cellPadding: 2, lineColor: [60, 60, 60], lineWidth: 0.15 },
    headStyles: { ...getStandardHeadStylesDark(), fontSize: 8 },
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { cellWidth: 18 },
      2: { cellWidth: 18 },
      3: { cellWidth: 18 },
      4: { cellWidth: 20 },
    },
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  /* -- Products -- */
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Products", m, y);

  const visibleProducts = products.filter((p: any) =>
    (p.delivery_method && p.delivery_method !== "not_yet") ||
    (p.doses ?? 0) > 0 ||
    (p.units_billed ?? 0) > 0,
  );

  const formatQty = (p: any): string => {
    const unitLabel = p.unit_label || "";
    if ((p.units_billed ?? 0) > 0) return `${p.units_billed} ${unitLabel}`.trim();
    const dpu = p.doses_per_unit;
    if ((p.doses ?? 0) > 0 && dpu && dpu > 0) return `${(p.doses / dpu).toFixed(1)} ${unitLabel}`.trim();
    if ((p.doses ?? 0) > 0) return `${p.doses} hd`;
    return "";
  };

  // Products table — checkbox is a column header, drawn as rectangle in each row
  const productBody = visibleProducts.map((p: any) => [
    p.product_name || "",
    { content: formatQty(p), styles: { halign: "right" as const } },
    "", // Checkbox column — actual boxes drawn in didDrawCell
  ]);
  // Blank rows
  for (let i = 0; i < 4; i++) productBody.push(["", "", ""]);

  autoTable(doc, {
    startY: y + 2,
    margin: { left: m, right: m },
    head: [["Product", { content: "Qty", styles: { halign: "right" as const } }, ""]],
    body: productBody,
    styles: { fontSize: 9, cellPadding: 2, lineColor: [60, 60, 60], lineWidth: 0.15 },
    headStyles: { ...getStandardHeadStylesDark(), fontSize: 8 },
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { cellWidth: 28 },
      2: { cellWidth: 12 },
    },
    didDrawCell: (data) => {
      // Draw checkbox rectangle in column 2 for body rows
      if (data.section === "body" && data.column.index === 2) {
        const cellX = data.cell.x;
        const cellY = data.cell.y;
        const cellW = data.cell.width;
        const cellH = data.cell.height;
        const boxSize = 3.5;
        drawCheckbox(
          doc,
          cellX + (cellW - boxSize) / 2,
          cellY + (cellH - boxSize) / 2,
          boxSize,
        );
      }
    },
  });

  addFooterToPdf(doc, "BeefSynch by Chuteside, LLC", PDF_LAYOUT.footerOffsetMini);

  /* ================================================================
   * PAGE 2 — LANDSCAPE — Session detail + notes
   * ================================================================ */
  doc.addPage("letter", "landscape");
  const pw2 = doc.internal.pageSize.getWidth();
  const ph2 = doc.internal.pageSize.getHeight();

  /* -- Header recap -- */
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(project.name || "Project", m, 14);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(0);
  const recapParts = [
    project.protocol,
    project.cattle_type,
    project.head_count ? `${project.head_count} hd` : null,
    project.breeding_date ? `Breeding: ${format(parseISO(project.breeding_date), "MMM d, yyyy")}` : null,
  ].filter(Boolean);
  doc.text(recapParts.join("  ·  "), pw2 - m, 14, { align: "right" });

  doc.setDrawColor(60);
  doc.setLineWidth(0.4);
  doc.line(m, 18, pw2 - m, 18);

  let y2 = 24;

  // Tank info
  if (packInfo) {
    const tankLabel = packInfo.tanks?.tank_name || packInfo.tanks?.tank_number || "";
    const totalPacked = hasEnhancedData
      ? semenLines.reduce((s, l) => s + (l.units_packed ?? 0), 0)
      : bulls.reduce((s: number, b: any) => s + (b.units ?? 0), 0);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    let tankText = "";
    if (tankLabel) tankText += `Field tank: ${tankLabel}`;
    if (totalPacked > 0) tankText += `${tankText ? "    ·    " : ""}Total packed: ${totalPacked}`;
    if (tankText) doc.text(tankText, m, y2);
    y2 += 6;
  }

  /* -- Total packed per bull -- */
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Total packed per bull", m, y2);
  y2 += 4;

  const bullSummaries = hasEnhancedData
    ? semenLines.filter(sl => (sl.units_packed ?? 0) > 0).map(sl => ({ name: sl.bull_name, packed: sl.units_packed ?? 0 }))
    : bulls.filter((b: any) => (b.units ?? 0) > 0).map((b: any) => ({
        name: b.bulls_catalog?.bull_name || b.custom_bull_name || "",
        packed: b.units ?? 0,
      }));

  // Draw bull summary pills
  doc.setFontSize(9);
  let pillX = m;
  for (const bs of bullSummaries) {
    if (!bs.name) continue;
    const nameText = bs.name + "  ";
    const packedText = String(bs.packed);
    const nameW = doc.getTextWidth(nameText);
    const packedW = doc.getTextWidth(packedText);
    const pillW = nameW + packedW + 6;
    const pillH = 6;
    doc.setDrawColor(120);
    doc.setLineWidth(0.2);
    doc.roundedRect(pillX, y2, pillW, pillH, 1.5, 1.5);
    doc.setFont("helvetica", "normal");
    doc.text(nameText, pillX + 3, y2 + 4.2);
    doc.setFont("helvetica", "bold");
    doc.text(packedText, pillX + 3 + nameW, y2 + 4.2);
    pillX += pillW + 4;
    if (pillX > pw2 - 80) { pillX = m; y2 += pillH + 2; }
  }
  // If no bulls with packed > 0, show a placeholder line
  if (bullSummaries.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text("No bulls packed yet", m, y2 + 4);
    doc.setTextColor(0);
  }
  y2 += 10;

  /* -- Session detail grid -- */
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Semen — session detail", m, y2);

  // Session legend
  const sortedBreedingSessions = [...breedingSessions].sort((a, b) =>
    (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.session_date.localeCompare(b.session_date));
  if (sortedBreedingSessions.length > 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(100);
    y2 += 3;
    const legend = sortedBreedingSessions.map((s, i) =>
      `S${i + 1} = ${s.session_label || "session"} (${format(parseISO(s.session_date), "M/d")}${s.time_of_day ? " " + s.time_of_day : ""})`
    ).join("  ·  ");
    doc.text(legend + "  ·  Start/End = tank counts before and after each session.", m, y2);
    doc.setTextColor(0);
    y2 += 2;
  }

  // Build table
  const maxSessions = 4;
  const sessionHead: any[] = [
    "Bull", "Canister",
    { content: "Packed", styles: { halign: "center" as const } },
  ];
  for (let i = 0; i < maxSessions; i++) {
    sessionHead.push({ content: `S${i + 1} start`, styles: { halign: "center" as const } });
    sessionHead.push({ content: `S${i + 1} end`, styles: { halign: "center" as const } });
  }
  sessionHead.push({ content: "Ret'd", styles: { halign: "center" as const } });

  const sessionBody: any[][] = sessionDetails.map(sd => {
    const row: any[] = [
      sd.bull_name,
      sd.canister || "",
      { content: nz(sd.packed), styles: { halign: "center" as const } },
    ];
    for (let i = 0; i < maxSessions; i++) {
      const sess = sd.sessions[i];
      row.push({ content: nz(sess?.start), styles: { halign: "center" as const } });
      row.push({ content: nz(sess?.end), styles: { halign: "center" as const } });
    }
    row.push({ content: nz(sd.returned), styles: { halign: "center" as const } });
    return row;
  });

  // Fallback: use bull list if no session details
  if (sessionBody.length === 0) {
    for (const b of bullSummaries) {
      const row: any[] = [b.name, "", { content: nz(b.packed), styles: { halign: "center" as const } }];
      for (let i = 0; i < maxSessions * 2 + 1; i++) row.push({ content: "", styles: { halign: "center" as const } });
      sessionBody.push(row);
    }
  }

  // Blank rows
  for (let i = 0; i < 4; i++) {
    const blank: any[] = ["", "", ""];
    for (let j = 0; j < maxSessions * 2 + 1; j++) blank.push("");
    sessionBody.push(blank);
  }

  const colStyles: Record<number, any> = {
    0: { cellWidth: 48 },
    1: { cellWidth: 18 },
    2: { cellWidth: 16 },
  };
  for (let i = 0; i < maxSessions * 2; i++) {
    colStyles[3 + i] = { cellWidth: 18 };
  }
  colStyles[3 + maxSessions * 2] = { cellWidth: 16 };

  autoTable(doc, {
    startY: y2 + 2,
    margin: { left: m, right: m },
    head: [sessionHead],
    body: sessionBody,
    styles: { fontSize: 8, cellPadding: 1.8, lineColor: [60, 60, 60], lineWidth: 0.15 },
    headStyles: { ...getStandardHeadStylesDark(), fontSize: 7 },
    columnStyles: colStyles,
  });
  y2 = (doc as any).lastAutoTable.finalY + 6;

  /* -- Notes -- */
  const notesAvailable = ph2 - y2 - 10;
  const lineSpacing = 7;
  const linesToDraw = Math.min(4, Math.max(2, Math.floor(notesAvailable / lineSpacing)));

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Notes", m, y2);

  doc.setDrawColor(140);
  doc.setLineWidth(0.2);
  let noteY = y2 + 5;
  for (let i = 0; i < linesToDraw; i++) {
    doc.line(m, noteY, pw2 - m, noteY);
    noteY += lineSpacing;
  }

  /* -- Footer on all pages -- */
  addFooterToPdf(doc, "BeefSynch by Chuteside, LLC", PDF_LAYOUT.footerOffsetMini);

  /* -- Save -- */
  const safeName = sanitizeFilename(project.name || "project");
  doc.save(`BeefSynch_Breeding_Worksheet_${safeName}_${format(new Date(), "yyyy-MM-dd")}.pdf`);
}
