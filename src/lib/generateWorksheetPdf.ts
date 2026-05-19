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

/** Show number only if > 0, otherwise blank */
function nz(val: number | null | undefined): string {
  if (val == null || val === 0) return "";
  return String(val);
}

/** Format bull display: "Bull Name (NAAB)" or just "Bull Name" if no code */
function bullLabel(name: string, code: string | null | undefined): string {
  if (!name) return "";
  if (code) return `${name} (${code})`;
  return name;
}

/** Compact time: "7:00a" instead of "7:00 AM" */
function compactTime(time: string): string {
  const parts = time.split(":");
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m)) return time;
  const ampm = h >= 12 ? "p" : "a";
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")}${ampm}`;
}

/** Events to exclude from the breeding worksheet */
const EXCLUDED_EVENTS = ["Return Heat", "Estimated Calving"];

/** Draw a checkbox rectangle */
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
    /** Per-canister rows from tank_pack_lines — authoritative for packed amounts */
    packLines?: PackLineRow[];
    laborEntries?: { description: string; labor_dates: string | null }[];
    unpackLines?: { bull_name: string; bull_code: string | null; units_returned: number; destination_label: string | null }[];
    packStatus?: string | null;
  },
) {
  const semenLines = extra?.semenLines ?? [];
  const breedingSessions = extra?.breedingSessions ?? [];
  const sessionDetails = extra?.sessionDetails ?? [];
  const packLines = extra?.packLines ?? [];
  const laborEntries = extra?.laborEntries ?? [];
  const unpackLines = extra?.unpackLines ?? [];
  const packStatus = extra?.packStatus ?? packInfo?.status ?? null;
  const isUnpacked = packStatus === "unpacked" || packStatus === "tank_returned";

  // Filter events
  const filteredEvents = events.filter(
    (ev: any) => !EXCLUDED_EVENTS.includes(ev.event_name?.trim())
  );

  // Total packed from authoritative pack lines
  const totalPacked = packLines.reduce((s, p) => s + p.packed, 0)
    || semenLines.reduce((s, l) => s + (l.units_packed ?? 0), 0);

  // Tank label
  const tankLabel = packInfo?.tanks?.tank_name || packInfo?.tanks?.tank_number || "";

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

  // Right side: protocol, type, head count — BOLD
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(0);
  const infoParts: string[] = [];
  if (project.protocol) infoParts.push(project.protocol);
  if (project.cattle_type) infoParts.push(project.cattle_type);
  if (project.head_count) infoParts.push(`${project.head_count} head`);
  if (infoParts.length) doc.text(infoParts.join("  ·  "), pw - m, 16, { align: "right" });

  // Customer name — large and prominent
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(project.name || "Project", m, 31);

  // Breeding date — bold
  if (project.breeding_date) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(0);
    doc.text(
      `Breeding: ${format(parseISO(project.breeding_date), "MMMM d, yyyy")}`,
      pw - m, 31, { align: "right" }
    );
  }

  doc.setDrawColor(60);
  doc.setLineWidth(0.4);
  doc.line(m, 36, pw - m, 36);

  let y = 42;

  /* -- Protocol Schedule -- */
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Protocol schedule", m, y);

  const breedingDateStr = project.breeding_date || "";
  const eventBody = filteredEvents.map((ev: any) => {
    const dateStr = ev.event_date ? format(parseISO(ev.event_date), "M/d/yy") : "";
    const timeStr = ev.event_time && !isNoTimeEvent(ev.event_name)
      ? compactTime(ev.event_time)
      : "";
    const isBreeding = ev.event_date === breedingDateStr;
    const style = isBreeding ? ("bold" as const) : ("normal" as const);
    return [
      { content: dateStr, styles: { fontStyle: style } },
      { content: timeStr, styles: { fontStyle: style } },
      { content: ev.event_name || "", styles: { fontStyle: style } },
      "",
    ];
  });
  eventBody.push(["", "", "", ""]);

  autoTable(doc, {
    startY: y + 2,
    margin: { left: m, right: m },
    head: [["Date", "Time", "Event", "Labor"]],
    body: eventBody.length > 1 ? eventBody : [["", "", "No events scheduled", ""]],
    styles: { fontSize: 9, cellPadding: 2, lineColor: [60, 60, 60], lineWidth: 0.15 },
    headStyles: { ...getStandardHeadStylesDark(), fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 20 },
      1: { cellWidth: 18 },
      2: { cellWidth: 50 },
      3: { cellWidth: "auto" },
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

  // Field tank — bigger font
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  y += 5;
  if (tankLabel) {
    doc.text(`Field tank: ${tankLabel}`, m, y);
  }

  // Tank packed / unpacked checkboxes — right-aligned with spacing
  const unpackedLabel = "Tank unpacked ";
  const unpackedLabelW = doc.getTextWidth(unpackedLabel);
  const boxSize = 3.5;
  const unpackedCheckX = pw - m - boxSize;
  const unpackedTextX = unpackedCheckX - unpackedLabelW;
  const packedLabel = "Tank packed ";
  const packedLabelW = doc.getTextWidth(packedLabel);
  const packedCheckX = unpackedTextX - 12 - boxSize; // 12mm gap between the two
  const packedTextX = packedCheckX - packedLabelW;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(packedLabel, packedTextX, y);
  drawCheckbox(doc, packedCheckX, y - 2.8, boxSize);
  doc.text(unpackedLabel, unpackedTextX, y);
  drawCheckbox(doc, unpackedCheckX, y - 2.8, boxSize);
  y += 2;

  // Front page semen table: Bull / Used / Blown / Billable — NO canister, NO packed
  // Packed detail is on the back page where you need it for inventory
  const bullSet = new Map<string, { label: string; blown: number | null; billable: number | null }>();

  if (semenLines.length > 0) {
    for (const sl of semenLines) {
      bullSet.set(sl.bull_name, {
        label: bullLabel(sl.bull_name, sl.bull_code),
        blown: sl.units_blown ?? null,
        billable: sl.units_billable ?? null,
      });
    }
  } else if (packLines.length > 0) {
    // Have pack data but no billing semen — list the bulls
    const seen = new Set<string>();
    for (const pl of packLines) {
      if (seen.has(pl.bull_name)) continue;
      seen.add(pl.bull_name);
      bullSet.set(pl.bull_name, {
        label: bullLabel(pl.bull_name, pl.bull_code),
        blown: null,
        billable: null,
      });
    }
  } else {
    // Fallback to project_bulls
    for (const b of bulls) {
      const name = b.bulls_catalog?.bull_name || b.custom_bull_name || "";
      const code = b.bulls_catalog?.naab_code || "";
      if (name) {
        bullSet.set(name, { label: bullLabel(name, code), blown: null, billable: null });
      }
    }
  }

  const semenBody: any[][] = Array.from(bullSet.values()).map(sd => [
    sd.label,
    { content: "", styles: { halign: "center" as const } }, // Used — handwritten
    { content: nz(sd.blown), styles: { halign: "center" as const } },
    { content: nz(sd.billable), styles: { halign: "center" as const } },
  ]);
  for (let i = 0; i < 2; i++) semenBody.push(["", "", "", ""]);

  autoTable(doc, {
    startY: y + 2,
    margin: { left: m, right: m },
    head: [[
      "Bull",
      { content: "Used", styles: { halign: "center" as const } },
      { content: "Blown", styles: { halign: "center" as const } },
      { content: "Billable", styles: { halign: "center" as const } },
    ]],
    body: semenBody,
    styles: { fontSize: 9, cellPadding: 2, lineColor: [60, 60, 60], lineWidth: 0.15 },
    headStyles: { ...getStandardHeadStylesDark(), fontSize: 8 },
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { cellWidth: 22 },
      2: { cellWidth: 22 },
      3: { cellWidth: 22 },
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
    (p.units_billed ?? 0) > 0 ||
    (p.product_name || "").toLowerCase().includes("arm service"),
  );

  const formatQty = (p: any): string => {
    const unitLabel = p.unit_label || "";
    if ((p.units_billed ?? 0) > 0) return `${p.units_billed} ${unitLabel}`.trim();
    const dpu = p.doses_per_unit;
    if ((p.doses ?? 0) > 0 && dpu && dpu > 0) return `${(p.doses / dpu).toFixed(1)} ${unitLabel}`.trim();
    if ((p.doses ?? 0) > 0) return `${p.doses} hd`;
    return "";
  };

  const deliveryLabel = (dm: string | null): string => {
    if (!dm || dm === "not_yet") return "";
    if (dm === "pickup") return " [Pickup]";
    if (dm === "we_gave") return " [We gave]";
    if (dm === "drop_off") return " [Drop off]";
    return "";
  };

  const productBody = visibleProducts.map((p: any) => [
    (p.product_name || "") + deliveryLabel(p.delivery_method),
    { content: formatQty(p), styles: { halign: "right" as const } },
    "",
  ]);
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
      if (data.section === "body" && data.column.index === 2) {
        const cellX = data.cell.x;
        const cellY = data.cell.y;
        const cellW = data.cell.width;
        const cellH = data.cell.height;
        const bx = 3.5;
        drawCheckbox(doc, cellX + (cellW - bx) / 2, cellY + (cellH - bx) / 2, bx);
      }
    },
  });

  y = (doc as any).lastAutoTable.finalY + 6;

  /* -- Labor -- */
  if (laborEntries.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Labor", m, y);

    const laborBody = laborEntries.map(l => [
      l.labor_dates || "",
      l.description || "",
    ]);

    autoTable(doc, {
      startY: y + 2,
      margin: { left: m, right: m },
      head: [["Date", "Description"]],
      body: laborBody,
      styles: { fontSize: 9, cellPadding: 2, lineColor: [60, 60, 60], lineWidth: 0.15 },
      headStyles: { ...getStandardHeadStylesDark(), fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 30 },
        1: { cellWidth: "auto" },
      },
    });
  }

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

  // Field tank — bigger font
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  if (tankLabel) {
    doc.text(`Field tank: ${tankLabel}`, m, y2);
  }
  if (totalPacked > 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`Total packed: ${totalPacked}`, m + (tankLabel ? doc.getTextWidth(`Field tank: ${tankLabel}`) + 8 : 0), y2);
  }
  y2 += 6;

  /* -- Packed summary (Bull | NAAB | Field can | Units packed) -- */
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Packed summary", m, y2);
  y2 += 2;

  const packedSummaryBody = packLines
    .slice()
    .sort((a, b) =>
      a.bull_name.localeCompare(b.bull_name) ||
      a.canister.localeCompare(b.canister, undefined, { numeric: true })
    )
    .map((pl) => [
      pl.bull_name || "",
      pl.bull_code || "",
      pl.canister || "",
      { content: String(pl.packed), styles: { halign: "right" as const } },
    ]);

  autoTable(doc, {
    startY: y2 + 2,
    margin: { left: m, right: m },
    head: [[
      "Bull",
      "NAAB",
      "Field can",
      { content: "Units packed", styles: { halign: "right" as const } },
    ]],
    body: packedSummaryBody.length > 0 ? packedSummaryBody : [["No bulls packed yet", "", "", ""]],
    styles: { fontSize: 9, cellPadding: 1.8, lineColor: [60, 60, 60], lineWidth: 0.15 },
    headStyles: { ...getStandardHeadStylesDark(), fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 60 },
      1: { cellWidth: 30 },
      2: { cellWidth: 25 },
      3: { cellWidth: 28 },
    },
  });
  y2 = (doc as any).lastAutoTable.finalY + 6;

  /* -- Session detail grid -- */
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Semen — session detail", m, y2);

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

  // Columns: Bull | Canister | Packed | S1 start | S1 end | ... S4 end | Blown | Ret'd
  const maxSessions = 4;
  const sessionHead: any[] = [
    "Bull", "Canister",
    { content: "Packed", styles: { halign: "center" as const } },
  ];
  for (let i = 0; i < maxSessions; i++) {
    sessionHead.push({ content: `S${i + 1} start`, styles: { halign: "center" as const } });
    sessionHead.push({ content: `S${i + 1} end`, styles: { halign: "center" as const } });
  }
  sessionHead.push({ content: "Blown", styles: { halign: "center" as const } });
  sessionHead.push({ content: "Ret'd", styles: { halign: "center" as const } });

  // Build blown lookup
  const blownByBull = new Map<string, number>();
  for (const sl of semenLines) {
    if ((sl.units_blown ?? 0) > 0) {
      blownByBull.set(sl.bull_name, sl.units_blown ?? 0);
    }
  }

  // Build session body — prefer sessionDetails (from billing sessions), fall back to packLines
  let sessionBody: any[][] = [];

  if (sessionDetails.length > 0) {
    // Have per-canister session data
    sessionBody = sessionDetails.map(sd => {
      const row: any[] = [
        bullLabel(sd.bull_name, sd.bull_code),
        sd.canister || "",
        { content: nz(sd.packed), styles: { halign: "center" as const } },
      ];
      for (let i = 0; i < maxSessions; i++) {
        const sess = sd.sessions[i];
        row.push({ content: nz(sess?.start), styles: { halign: "center" as const } });
        row.push({ content: nz(sess?.end), styles: { halign: "center" as const } });
      }
      const blown = blownByBull.get(sd.bull_name) ?? null;
      row.push({ content: nz(blown), styles: { halign: "center" as const } });
      row.push({ content: nz(sd.returned), styles: { halign: "center" as const } });
      return row;
    });
  } else if (packLines.length > 0) {
    // No sessions yet but have pack lines — show per-canister rows with blank session columns
    sessionBody = packLines.map(pl => {
      const row: any[] = [
        bullLabel(pl.bull_name, pl.bull_code),
        pl.canister,
        { content: nz(pl.packed), styles: { halign: "center" as const } },
      ];
      for (let i = 0; i < maxSessions * 2; i++) {
        row.push({ content: "", styles: { halign: "center" as const } });
      }
      row.push({ content: "", styles: { halign: "center" as const } }); // Blown
      row.push({ content: "", styles: { halign: "center" as const } }); // Ret'd
      return row;
    });
  }

  // Blank rows for write-ins
  const totalCols = 3 + maxSessions * 2 + 2; // bull + canister + packed + sessions + blown + ret'd
  for (let i = 0; i < 4; i++) {
    const blank: any[] = [];
    for (let j = 0; j < totalCols; j++) blank.push("");
    sessionBody.push(blank);
  }

  // Column widths for landscape letter (279mm - 24mm margins = 255mm)
  const colStyles: Record<number, any> = {
    0: { cellWidth: 48 },  // Bull
    1: { cellWidth: 16 },  // Canister
    2: { cellWidth: 14 },  // Packed
  };
  for (let i = 0; i < maxSessions * 2; i++) {
    colStyles[3 + i] = { cellWidth: 16 };
  }
  colStyles[3 + maxSessions * 2] = { cellWidth: 15 };     // Blown
  colStyles[3 + maxSessions * 2 + 1] = { cellWidth: 15 }; // Ret'd

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

  /* -- Returned summary (only when unpacked) -- */
  if (isUnpacked && unpackLines.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Returned summary", m, y2);
    y2 += 2;

    // Roll up by bull so split returns to the same destination still show
    // as one row per (bull, destination).
    const grouped = new Map<string, { bullLabel: string; returned: number; destination: string }>();
    for (const ul of unpackLines) {
      const key = `${ul.bull_name}|${ul.destination_label ?? ""}`;
      const entry = grouped.get(key);
      if (entry) {
        entry.returned += ul.units_returned ?? 0;
      } else {
        grouped.set(key, {
          bullLabel: bullLabel(ul.bull_name, ul.bull_code),
          returned: ul.units_returned ?? 0,
          destination: ul.destination_label ?? "—",
        });
      }
    }
    const returnedBody = Array.from(grouped.values())
      .filter((r) => r.returned > 0)
      .sort((a, b) => a.bullLabel.localeCompare(b.bullLabel))
      .map((r) => [
        r.bullLabel,
        { content: String(r.returned), styles: { halign: "right" as const } },
        r.destination,
      ]);

    if (returnedBody.length > 0) {
      autoTable(doc, {
        startY: y2 + 2,
        margin: { left: m, right: m },
        head: [[
          "Bull",
          { content: "Remaining", styles: { halign: "right" as const } },
          "Returned to",
        ]],
        body: returnedBody,
        styles: { fontSize: 9, cellPadding: 1.8, lineColor: [60, 60, 60], lineWidth: 0.15 },
        headStyles: { ...getStandardHeadStylesDark(), fontSize: 8 },
        columnStyles: {
          0: { cellWidth: 80 },
          1: { cellWidth: 28 },
          2: { cellWidth: "auto" },
        },
      });
      y2 = (doc as any).lastAutoTable.finalY + 6;
    }
  }

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

  /* -- Footer on all pages (called once, loops pages internally) -- */
  addFooterToPdf(doc, "BeefSynch by Chuteside, LLC", PDF_LAYOUT.footerOffsetMini);

  /* -- Save -- */
  const safeName = sanitizeFilename(project.name || "project");
  doc.save(`BeefSynch_Breeding_Worksheet_${safeName}_${format(new Date(), "yyyy-MM-dd")}.pdf`);
}
