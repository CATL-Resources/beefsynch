import { format, parseISO } from "date-fns";
import { getBullDisplayLabel } from "@/lib/bullDisplay";

interface OrderPrintSheetProps {
  order: {
    id: string;
    order_date: string | null;
    notes: string | null;
    invoiced_at: string | null;
    invoice_number: string | null;
    invoicing_company_id: string | null;
    customers: { name: string; phone: string | null; email: string | null } | null;
  };
  items: Array<{
    id: string;
    units: number;
    custom_bull_name: string | null;
    bull_catalog_id: string | null;
    bulls_catalog: {
      bull_name: string;
      naab_code: string | null;
    } | null;
  }>;
  /** Map keyed by bull_catalog_id || custom_bull_name → fulfilled units. */
  fulfilledByBull?: Map<string, number>;
  /** Product/supply line items billed on this order. */
  products?: Array<{
    id: string;
    product_name: string;
    quantity: number | null;
    unit_label: string | null;
    unit_price: number | null;
    line_total: number | null;
  }>;
  customerName: string;
}

const money = (n: number | null | undefined) => `$${(Number(n) || 0).toFixed(2)}`;

const SELECT_SIRES_ID = "630b12de-74bc-407a-8ee5-1ea17df18881";

function invoicingCompanyName(id: string | null): string {
  if (!id) return "—";
  if (id === SELECT_SIRES_ID) return "Select Sires";
  return "CATL Resources";
}

/**
 * Print-only billing sheet. Hidden on screen. The container exposes the
 * `print-sheet` class so SemenOrderDetail can layer in `@media print` rules
 * that flip the screen UI off and this sheet on.
 */
export function OrderPrintSheet({ order, items, fulfilledByBull, products = [], customerName }: OrderPrintSheetProps) {
  const isInvoiced = !!order.invoiced_at;
  const company = invoicingCompanyName(order.invoicing_company_id);

  return (
    <div className="print-sheet hidden print:block text-black">
      <div className="flex justify-between items-start gap-6 pb-4 border-b border-black">
        <div>
          <div className="text-xs uppercase tracking-wider text-gray-600">CATL Resources</div>
          <div className="text-2xl font-bold mt-1">Order Sheet</div>
          <div className="mt-3 text-sm">
            <div className="font-semibold">{customerName}</div>
            {order.customers?.phone && <div>{order.customers.phone}</div>}
            {order.customers?.email && <div>{order.customers.email}</div>}
            <div className="mt-2 text-gray-700">Order date: {order.order_date ? format(parseISO(order.order_date), "MMMM d, yyyy") : "—"}</div>
          </div>
        </div>

        <div className="text-right">
          <div
            className={
              "inline-block border-2 px-4 py-2 font-bold text-lg uppercase tracking-wide " +
              (isInvoiced
                ? "border-emerald-700 text-emerald-700"
                : "border-red-600 text-red-600")
            }
          >
            {isInvoiced ? "Invoiced" : "Needs Billed"}
          </div>
          <div className="mt-4 text-sm">
            <div className="text-gray-700">Invoice #</div>
            {order.invoice_number ? (
              <div className="font-semibold text-base">{order.invoice_number}</div>
            ) : (
              <div className="border-b border-black h-6 w-48 ml-auto" />
            )}
          </div>
          {isInvoiced && order.invoiced_at && (
            <div className="mt-2 text-xs text-gray-700">
              Invoiced: {format(parseISO(order.invoiced_at), "MMM d, yyyy")}
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 text-sm">
        <span className="text-gray-700">Bills through:</span>{" "}
        <span className="font-semibold">{company}</span>
      </div>

      <table className="w-full mt-6 text-sm border-collapse">
        <thead>
          <tr className="border-b-2 border-black text-left">
            <th className="py-2 pr-2">Bull</th>
            <th className="py-2 pr-2 text-right w-24">Ordered</th>
            <th className="py-2 pr-2 text-right w-24">Fulfilled</th>
            <th className="py-2 text-right w-24">Remaining</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => {
            const k = it.bull_catalog_id || it.custom_bull_name || "";
            const fulfilled = fulfilledByBull?.get(k) ?? 0;
            const remaining = Math.max(0, (it.units || 0) - fulfilled);
            return (
              <tr key={it.id} className="border-b border-gray-300">
                <td className="py-2 pr-2">{getBullDisplayLabel(it)}</td>
                <td className="py-2 pr-2 text-right">{it.units}</td>
                <td className="py-2 pr-2 text-right">{fulfilled}</td>
                <td className="py-2 text-right">{remaining}</td>
              </tr>
            );
          })}
          <tr className="font-semibold">
            <td className="py-2 pr-2">Total</td>
            <td className="py-2 pr-2 text-right">{items.reduce((s, i) => s + (i.units || 0), 0)}</td>
            <td className="py-2 pr-2 text-right">
              {items.reduce((s, i) => {
                const k = i.bull_catalog_id || i.custom_bull_name || "";
                return s + (fulfilledByBull?.get(k) ?? 0);
              }, 0)}
            </td>
            <td className="py-2 text-right">
              {items.reduce((s, i) => {
                const k = i.bull_catalog_id || i.custom_bull_name || "";
                const fulfilled = fulfilledByBull?.get(k) ?? 0;
                return s + Math.max(0, (i.units || 0) - fulfilled);
              }, 0)}
            </td>
          </tr>
        </tbody>
      </table>

      {products.length > 0 && (
        <>
          <div className="mt-6 text-sm font-semibold uppercase tracking-wide text-gray-700">Products &amp; Services</div>
          <table className="w-full mt-2 text-sm border-collapse">
            <thead>
              <tr className="border-b-2 border-black text-left">
                <th className="py-2 pr-2">Product</th>
                <th className="py-2 pr-2 text-right w-20">Qty</th>
                <th className="py-2 pr-2 w-20">Unit</th>
                <th className="py-2 pr-2 text-right w-24">Price</th>
                <th className="py-2 text-right w-24">Total</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className="border-b border-gray-300">
                  <td className="py-2 pr-2">{p.product_name}</td>
                  <td className="py-2 pr-2 text-right">{p.quantity ?? "—"}</td>
                  <td className="py-2 pr-2">{p.unit_label || "—"}</td>
                  <td className="py-2 pr-2 text-right">{money(p.unit_price)}</td>
                  <td className="py-2 text-right">{money(p.line_total)}</td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className="py-2 pr-2" colSpan={4}>Products &amp; Services total</td>
                <td className="py-2 text-right">
                  {money(products.reduce((s, p) => s + (Number(p.line_total) || 0), 0))}
                </td>
              </tr>
            </tbody>
          </table>
        </>
      )}

      {order.notes && (
        <div className="mt-6 text-sm">
          <div className="font-semibold">Notes</div>
          <div className="text-gray-800 whitespace-pre-wrap">{order.notes}</div>
        </div>
      )}

      <div className="mt-12 pt-4 border-t border-gray-300 text-[10px] text-gray-600 flex justify-between">
        <span>Printed from BeefSynch</span>
        <span>{format(new Date(), "MMM d, yyyy h:mm a")}</span>
      </div>
    </div>
  );
}
