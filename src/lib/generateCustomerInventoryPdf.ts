import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format, parseISO } from "date-fns";
import { getStandardHeadStylesDark, PDF_FONTS } from "./pdfUtils";
import { getBullDisplayName } from "./bullDisplay";

interface TankData {
  id: string;
  tank_name: string | null;
  tank_number: string;
  model: string | null;
  nitrogen_status?: string | null;
  location_status?: string | null;
}

interface InventoryItem {
  canister: string;
  sub_canister: string | null;
  bull_code: string | null;
  units: number;
  bulls_catalog?: { bull_name: string; company: string; registration_number?: string } | null;
  custom_bull_name?: string | null;
}

interface CustomerData {
  name: string;
  company_name?: string | null;
  phone: string | null;
  email: string | null;
  address_line1?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}

interface OrderData {
  id: string;
  order_date: string;
  fulfillment_status: string;
  billing_status: string;
  order_type: string;
  needed_by?: string | null;
  semen_companies?: { name: string } | null;
  // Ordered-side: pending-units/open-orders display (kept for the Open Orders header math)
  semen_order_items?: { units: number; custom_bull_name?: string | null; bull_catalog_id?: string | null; bulls_catalog?: { bull_name: string } | null }[];
  // Billed-side: per-bull rows from get_billable_units_for_order(order_id). Source of truth for the
  // customer-facing per-order bulls list and total. Empty for orders with nothing yet billable.
  billable_units?: { bull_name: string; units: number }[];
}

interface ShipmentData {
  id: string;
  received_date: string | null;
  status: string;
  semen_companies?: { name: string } | null;
}

interface PickupData {
  id: string;
  pack_type: string;
  status: string;
  packed_at: string | null;
  tank_pack_lines?: { bull_name: string; bull_code?: string | null; units: number }[];
}

interface InventoryByTankMap extends Map<string, InventoryItem[]> {}

export function generateCustomerInventoryPdf(
  customer: CustomerData,
  tanks: TankData[],
  inventoryByTank: InventoryByTankMap,
  tankIds: string[],
  orders: OrderData[] = [],
  shipments: ShipmentData[] = [],
  pickups: PickupData[] = []
) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const headStyles = { ...getStandardHeadStylesDark(), fontSize: PDF_FONTS.sizeSmallTiny };
  const bodyStyles = { fontSize: PDF_FONTS.sizeSmallTiny };
  const margin = { left: 14, right: 14 };
  let y = 18;

  function checkPage(needed: number) {
    if (y + needed > 270) { doc.addPage(); y = 18; }
  }

  function sectionTitle(title: string) {
    checkPage(12);
    doc.setFontSize(PDF_FONTS.sizeBodySmall);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(60, 60, 60);
    doc.text(title, 14, y);
    y += 2;
    doc.setDrawColor(200, 200, 200);
    doc.line(14, y, pageWidth - 14, y);
    y += 5;
    doc.setTextColor(0, 0, 0);
  }

  // ========== HEADER ==========
  doc.setFontSize(PDF_FONTS.sizeSubhead);
  doc.setFont("helvetica", "bold");
  doc.text("BeefSynch — Customer Summary Report", pageWidth / 2, y, { align: "center" });
  y += 10;

  doc.setFontSize(PDF_FONTS.sizeBody);
  doc.setFont("helvetica", "bold");
  doc.text(customer.name, 14, y);
  if (customer.company_name) {
    doc.setFont("helvetica", "normal");
    doc.text(`  (${customer.company_name})`, 14 + doc.getTextWidth(customer.name) + 2, y);
  }
  y += 5;

  doc.setFontSize(PDF_FONTS.sizeBodyTiny);
  doc.setFont("helvetica", "normal");
  const contactParts: string[] = [];
  if (customer.phone) contactParts.push(customer.phone);
  if (customer.email) contactParts.push(customer.email);
  if (contactParts.length) { doc.text(contactParts.join("  •  "), 14, y); y += 4; }

  const addrParts: string[] = [];
  if (customer.address_line1) addrParts.push(customer.address_line1);
  const cityState = [customer.city, customer.state].filter(Boolean).join(", ");
  if (cityState) addrParts.push(cityState + (customer.zip ? ` ${customer.zip}` : ""));
  if (addrParts.length) { doc.text(addrParts.join(", "), 14, y); y += 4; }

  doc.text(`Report Date: ${format(new Date(), "MMMM d, yyyy")}`, 14, y);
  y += 8;

  // ========== SUMMARY BOX ==========
  const totalUnits = tankIds.reduce((sum, tid) => {
    const items = inventoryByTank.get(tid) || [];
    return sum + items.reduce((s, i) => s + (i.units || 0), 0);
  }, 0);
  const openOrders = orders.filter((o) => ["pending", "partially_fulfilled"].includes(o.fulfillment_status));
  const unitsOnOrder = openOrders.reduce((sum, o) =>
    sum + (o.semen_order_items || []).reduce((s, i) => s + (i.units || 0), 0), 0);

  doc.setFontSize(PDF_FONTS.sizeBodyTiny);
  doc.setFont("helvetica", "bold");
  doc.text(`Tanks: ${tanks.length}    |    Units on Hand: ${totalUnits}    |    Open Orders: ${openOrders.length} (${unitsOnOrder} units)`, 14, y);
  y += 8;

  // ========== TANKS ==========
  if (tanks.length > 0) {
    sectionTitle("Tanks");
    const tankBody = tanks.map((t) => [
      t.tank_name || "—",
      t.tank_number,
      t.model || "—",
      (t.nitrogen_status || "unknown").toUpperCase(),
      t.location_status === "here" ? "In Shop" : "Out",
    ]);

    autoTable(doc, {
      startY: y,
      head: [["Tank Name", "Number", "Model", "Nitrogen", "Location"]],
      body: tankBody,
      theme: "grid",
      headStyles,
      bodyStyles,
      margin,
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // ========== SEMEN INVENTORY (per tank) ==========
  sectionTitle("Semen Inventory");
  let grandTotal = 0;

  if (tankIds.length === 0 || tankIds.every((tid) => (inventoryByTank.get(tid) || []).length === 0)) {
    doc.setFontSize(PDF_FONTS.sizeBodyTiny);
    doc.setFont("helvetica", "normal");
    doc.text("No semen inventory on file.", 14, y);
    y += 6;
  } else {
    for (const tankId of tankIds) {
      const tank = tanks.find((t) => t.id === tankId);
      if (!tank) continue;
      const items = inventoryByTank.get(tankId) || [];
      if (items.length === 0) continue;
      const tankTotal = items.reduce((s, i) => s + (i.units || 0), 0);
      grandTotal += tankTotal;

      const tankLabel = tank.tank_name
        ? `${tank.tank_name} — Tank #${tank.tank_number}`
        : `Tank #${tank.tank_number}`;
      const modelStr = tank.model ? ` (${tank.model})` : "";

      checkPage(20);
      doc.setFontSize(PDF_FONTS.sizeBodySmall);
      doc.setFont("helvetica", "bold");
      doc.text(`${tankLabel}${modelStr}`, 14, y);
      y += 2;

      const tableBody = items.map((item) => [
        item.canister,
        item.sub_canister || "",
        getBullDisplayName(item),
        item.bull_code || "",
        item.bulls_catalog?.company || "",
        String(item.units),
      ]);
      tableBody.push(["", "", "", "", "Tank Total", String(tankTotal)]);

      autoTable(doc, {
        startY: y,
        head: [["Can", "Sub", "Bull", "Code", "Company", "Units"]],
        body: tableBody,
        theme: "grid",
        headStyles,
        bodyStyles,
        columnStyles: { 5: { halign: "right" } },
        margin,
        didParseCell: (data) => {
          if (data.row.index === tableBody.length - 1) data.cell.styles.fontStyle = "bold";
        },
      });
      y = (doc as any).lastAutoTable.finalY + 6;
    }

    checkPage(8);
    doc.setFontSize(PDF_FONTS.sizeBody);
    doc.setFont("helvetica", "bold");
    doc.text(`Total Units on Hand: ${grandTotal}`, 14, y);
    y += 8;
  }

  // ========== ORDERS ==========
  // Customer-facing — the bulls list and total here reflect what was BILLED for each order
  // (sourced from get_billable_units_for_order via the caller). For not-yet-billed orders the
  // billable_units list will be empty and the row shows "—" / 0.
  if (orders.length > 0) {
    sectionTitle("Orders");
    const orderBody = orders.map((o) => {
      const billable = o.billable_units ?? [];
      const bulls = billable
        .map((b) => `${b.bull_name} (${b.units})`)
        .join(", ");
      const totalBilled = billable.reduce((s, b) => s + (b.units || 0), 0);
      return [
        o.order_date ? format(parseISO(o.order_date), "MMM d, yyyy") : "—",
        o.semen_companies?.name || "—",
        bulls || "—",
        String(totalBilled),
        o.fulfillment_status.replace("_", " "),
        o.billing_status.replace("_", " "),
      ];
    });

    autoTable(doc, {
      startY: y,
      head: [["Date", "Company", "Bulls (units billed)", "Total Billed", "Fulfillment", "Billing"]],
      body: orderBody,
      theme: "grid",
      headStyles,
      bodyStyles,
      columnStyles: { 2: { cellWidth: 55 }, 3: { halign: "right" } },
      margin,
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // ========== SHIPMENTS ==========
  const confirmedShipments = shipments.filter((s) => s.status !== "draft");
  if (confirmedShipments.length > 0) {
    sectionTitle("Shipments Received");
    const shipBody = confirmedShipments.map((s) => [
      s.received_date ? format(parseISO(s.received_date), "MMM d, yyyy") : "—",
      s.semen_companies?.name || "—",
      s.status,
    ]);

    autoTable(doc, {
      startY: y,
      head: [["Date Received", "Company", "Status"]],
      body: shipBody,
      theme: "grid",
      headStyles,
      bodyStyles,
      margin,
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // ========== PICKUPS ==========
  if (pickups.length > 0) {
    sectionTitle("Pickups");
    const pickupBody = pickups.map((p) => {
      const bulls = (p.tank_pack_lines || [])
        .map((l) => `${l.bull_name} (${l.units})`)
        .join(", ");
      const totalUnits = (p.tank_pack_lines || []).reduce((s, l) => s + (l.units || 0), 0);
      return [
        p.packed_at ? format(parseISO(p.packed_at), "MMM d, yyyy") : "—",
        bulls || "—",
        String(totalUnits),
        p.status.replace("_", " "),
      ];
    });

    autoTable(doc, {
      startY: y,
      head: [["Date", "Bulls (units)", "Total", "Status"]],
      body: pickupBody,
      theme: "grid",
      headStyles,
      bodyStyles,
      columnStyles: { 1: { cellWidth: 65 }, 2: { halign: "right" } },
      margin,
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // ========== SAVE ==========
  const safeName = customer.name.replace(/[^a-zA-Z0-9]/g, "_");
  const dateStr = format(new Date(), "yyyy-MM-dd");
  doc.save(`BeefSynch_Customer_Summary_${safeName}_${dateStr}.pdf`);
}
