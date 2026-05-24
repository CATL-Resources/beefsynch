import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface BillingInvoicesProps {
  billingId: string;
  onPrintBillSummary: () => void;
  onCloseOut: () => void;
  currentStatus: string;
}

type BillingRow = {
  id: string;
  status: string | null;
  notes: string | null;
  select_sires_invoice_number: string | null;
  catl_invoice_number: string | null;
};

const formatCurrency = (n: number) => `$${n.toFixed(2)}`;

// Invoice status is derived, not manually set: a company only needs an
// invoice when it has billable dollars. With charges, the status is Invoiced
// once an invoice number is entered, otherwise Unbilled. With no charges,
// there's nothing to bill.
function derivedInvoiceStatus(total: number, invoiceNumber: string | null) {
  if (total <= 0) return { label: "No charges", className: "bg-muted text-muted-foreground" };
  if (invoiceNumber && invoiceNumber.trim()) return { label: "Invoiced", className: "bg-emerald-500/15 text-emerald-500" };
  return { label: "Unbilled", className: "bg-amber-500/15 text-amber-500" };
}

export default function BillingInvoices({ billingId, onPrintBillSummary, onCloseOut, currentStatus }: BillingInvoicesProps) {
  const queryClient = useQueryClient();

  const { data: billing } = useQuery({
    queryKey: ["billing_invoice_row_v2", billingId],
    enabled: !!billingId,
    queryFn: async () => {
      const { data } = await supabase
        .from("project_billing")
        .select("id, status, notes, select_sires_invoice_number, catl_invoice_number")
        .eq("id", billingId)
        .maybeSingle();
      return data as BillingRow | null;
    },
  });

  const { data: semenLines = [] } = useQuery({
    queryKey: ["billing_invoice_semen_v2", billingId],
    enabled: !!billingId,
    queryFn: async () => {
      const { data } = await supabase
        .from("project_billing_semen")
        .select("line_total, invoicing_company_id, semen_companies:invoicing_company_id(name)")
        .eq("billing_id", billingId);
      return (data ?? []) as { line_total: number | null; semen_companies?: { name: string } | null }[];
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ["billing_invoice_products_v2", billingId],
    enabled: !!billingId,
    queryFn: async () => {
      const { data } = await supabase
        .from("project_billing_products")
        .select("line_total")
        .eq("billing_id", billingId);
      return (data ?? []) as { line_total: number | null }[];
    },
  });

  const selectSemenTotal = semenLines
    .filter((s) => /select/i.test(s.semen_companies?.name || ""))
    .reduce((sum, s) => sum + (s.line_total ?? 0), 0);
  const catlSemenTotal = semenLines
    .filter((s) => /catl/i.test(s.semen_companies?.name || ""))
    .reduce((sum, s) => sum + (s.line_total ?? 0), 0);
  const productsTotal = products.reduce((sum, p) => sum + (p.line_total ?? 0), 0);
  const grandTotal = selectSemenTotal + catlSemenTotal + productsTotal;

  const saveField = async (field: string, value: any) => {
    const { error } = await supabase
      .from("project_billing")
      .update({ [field]: value })
      .eq("id", billingId);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Saved" });
    queryClient.invalidateQueries({ queryKey: ["billing_invoice_row_v2", billingId] });
  };

  return (
    <section className="rounded-xl border border-border bg-card/50 p-4 space-y-4">
      <h2 className="text-base font-bold tracking-tight uppercase text-muted-foreground">Invoicing</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-lg border-l-4 border-blue-500 bg-muted/20 p-4 space-y-3">
          <div className="flex items-baseline justify-between">
            <h3 className="text-sm font-semibold">Select Sires</h3>
            <span className="text-sm font-semibold tabular-nums">{formatCurrency(selectSemenTotal)}</span>
          </div>
          <div className="text-xs text-muted-foreground">Semen: {formatCurrency(selectSemenTotal)}</div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Invoice #</label>
            <Input
              className="h-8 text-sm"
              defaultValue={billing?.select_sires_invoice_number || ""}
              onBlur={(e) => {
                if ((e.target.value || "") === (billing?.select_sires_invoice_number || "")) return;
                saveField("select_sires_invoice_number", e.target.value || null);
              }}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Status</label>
            {(() => {
              const s = derivedInvoiceStatus(selectSemenTotal, billing?.select_sires_invoice_number ?? null);
              return <div className={`inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${s.className}`}>{s.label}</div>;
            })()}
          </div>
        </div>
        <div className="rounded-lg border-l-4 border-amber-500 bg-muted/20 p-4 space-y-3">
          <div className="flex items-baseline justify-between">
            <h3 className="text-sm font-semibold">CATL Resources</h3>
            <span className="text-sm font-semibold tabular-nums">{formatCurrency(productsTotal + catlSemenTotal)}</span>
          </div>
          <div className="text-xs text-muted-foreground">
            Products: {formatCurrency(productsTotal)} · CATL semen: {formatCurrency(catlSemenTotal)}
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Invoice #</label>
            <Input
              className="h-8 text-sm"
              defaultValue={billing?.catl_invoice_number || ""}
              onBlur={(e) => {
                if ((e.target.value || "") === (billing?.catl_invoice_number || "")) return;
                saveField("catl_invoice_number", e.target.value || null);
              }}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Status</label>
            {(() => {
              const s = derivedInvoiceStatus(productsTotal + catlSemenTotal, billing?.catl_invoice_number ?? null);
              return <div className={`inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${s.className}`}>{s.label}</div>;
            })()}
          </div>
        </div>
      </div>
      <div className="rounded-lg bg-muted/30 p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs text-muted-foreground">Grand total</div>
          <div className="text-2xl font-bold tabular-nums">{formatCurrency(grandTotal)}</div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-9" onClick={onPrintBillSummary}>
            <Printer className="h-4 w-4 mr-1.5" /> Print Bill
          </Button>
          {currentStatus !== "Invoiced" ? (
            <Button variant="destructive" size="sm" className="h-9" onClick={onCloseOut}>
              Close Out
            </Button>
          ) : (
            <span className="text-sm text-purple-500 font-semibold">✓ Invoiced</span>
          )}
        </div>
      </div>
    </section>
  );
}
