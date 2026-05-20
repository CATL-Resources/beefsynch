import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface BillingInvoicesProps {
  billingId: string;
  onPrintWorksheet: () => void;
  onCloseOut: () => void;
  currentStatus: string;
}

type BillingRow = {
  id: string;
  status: string | null;
  notes: string | null;
  select_sires_invoice_number: string | null;
  select_sires_invoice_status: string | null;
  catl_invoice_number: string | null;
  catl_invoice_status: string | null;
};

const formatCurrency = (n: number) => `$${n.toFixed(2)}`;

const STATUS_OPTIONS = [
  { value: "unbilled", label: "Unbilled" },
  { value: "sent", label: "Sent" },
  { value: "paid", label: "Paid" },
];

export default function BillingInvoices({ billingId, onPrintWorksheet, onCloseOut, currentStatus }: BillingInvoicesProps) {
  const queryClient = useQueryClient();

  const { data: billing } = useQuery({
    queryKey: ["billing_invoice_row_v2", billingId],
    enabled: !!billingId,
    queryFn: async () => {
      const { data } = await supabase
        .from("project_billing")
        .select("id, status, notes, select_sires_invoice_number, select_sires_invoice_status, catl_invoice_number, catl_invoice_status")
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
            <Select
              value={billing?.select_sires_invoice_status || "unbilled"}
              onValueChange={(v) => saveField("select_sires_invoice_status", v)}
            >
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
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
            <Select
              value={billing?.catl_invoice_status || "unbilled"}
              onValueChange={(v) => saveField("catl_invoice_status", v)}
            >
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
      <div className="rounded-lg bg-muted/30 p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs text-muted-foreground">Grand total</div>
          <div className="text-2xl font-bold tabular-nums">{formatCurrency(grandTotal)}</div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-9" onClick={onPrintWorksheet}>
            <Printer className="h-4 w-4 mr-1.5" /> Worksheet
          </Button>
          {currentStatus !== "invoiced_closed" ? (
            <Button variant="destructive" size="sm" className="h-9" onClick={onCloseOut}>
              Close out
            </Button>
          ) : (
            <span className="text-sm text-emerald-600 font-semibold">✓ Invoiced &amp; closed</span>
          )}
        </div>
      </div>
    </section>
  );
}
