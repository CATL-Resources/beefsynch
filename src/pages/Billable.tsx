import { useEffect, useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { CheckCircle2, ChevronRight, Loader2, Printer, AlertTriangle } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useOrgRole } from "@/hooks/useOrgRole";
import { toast } from "@/hooks/use-toast";
import { getBullDisplayLabel } from "@/lib/bullDisplay";

import Navbar from "@/components/Navbar";
import AppFooter from "@/components/AppFooter";
import CloseOutReviewDialog from "@/components/billing/CloseOutReviewDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const SELECT_SIRES_ID = "630b12de-74bc-407a-8ee5-1ea17df18881";

function invoicingCompanyLabel(id: string | null): string {
  if (!id) return "Unassigned";
  if (id === SELECT_SIRES_ID) return "Select Sires";
  return "CATL Resources";
}

interface BillableOrder {
  id: string;
  order_date: string | null;
  customer_name: string;
  invoicing_company_id: string | null;
  total_units: number;
  bull_summary: string;
}

interface BillableProject {
  id: string;
  name: string;
  customer_name: string;
  breeding_date: string | null;
  billing_id: string;
  customer_supplied_tank: boolean;
}

const Billable = () => {
  const navigate = useNavigate();
  const { orgId } = useOrgRole();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<BillableOrder[]>([]);
  const [projects, setProjects] = useState<BillableProject[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [closeOutProject, setCloseOutProject] = useState<BillableProject | null>(null);

  const load = async () => {
    if (!orgId) return;
    setLoading(true);

    const { data: orderRows } = await supabase
      .from("semen_orders")
      .select(`
        id, order_date, invoicing_company_id,
        customers!semen_orders_customer_id_fkey(name),
        product_order_items(quantity, product_name, line_total),
        tank_pack_orders(
          tank_packs(
            tank_pack_lines(units, is_billable, bull_name, bull_code, bull_catalog_id, bulls_catalog(bull_name, naab_code))
          )
        )
      `)
      .eq("organization_id", orgId)
      .eq("order_type", "customer")
      .eq("status", "fulfilled")
      .order("order_date", { ascending: true });

    const mappedOrders: BillableOrder[] = (orderRows ?? []).map((o: any) => {
      const products = o.product_order_items || [];
      // tank_pack_lines are the billing source of truth — bill for what was
      // actually packed and sent, not what was originally ordered. is_billable
      // false lines (customer-supplied) are excluded; null counts as billable.
      const packLines: any[] = [];
      for (const tpo of o.tank_pack_orders || []) {
        const pack = tpo.tank_packs;
        if (!pack) continue;
        for (const l of pack.tank_pack_lines || []) {
          if (l.is_billable === false) continue;
          packLines.push(l);
        }
      }
      const total = packLines.reduce((s: number, l: any) => s + (l.units || 0), 0);

      // Group packed units by bull for the breakdown.
      const byBull = new Map<string, { label: string; units: number }>();
      for (const l of packLines) {
        const key = l.bull_catalog_id || l.bull_name || "?";
        const label = getBullDisplayLabel({
          bull_catalog_id: l.bull_catalog_id,
          custom_bull_name: l.bull_name,
          bulls_catalog: l.bulls_catalog,
        });
        const cur = byBull.get(key) ?? { label, units: 0 };
        cur.units += l.units || 0;
        byBull.set(key, cur);
      }
      const semenSummary = Array.from(byBull.values())
        .map((b) => `${b.units} ${b.label}`)
        .join(" + ");
      const productSummary = products
        .map((p: any) => `${p.quantity} ${p.product_name}`)
        .join(" + ");
      const summary = packLines.length === 0
        ? [productSummary].filter(Boolean).join(" + ") || "Not yet packed"
        : [semenSummary, productSummary].filter(Boolean).join(" + ");
      return {
        id: o.id,
        order_date: o.order_date,
        customer_name: o.customers?.name || "Unknown",
        invoicing_company_id: o.invoicing_company_id,
        total_units: total,
        bull_summary: summary,
      };
    });
    setOrders(mappedOrders);

    const { data: projRows } = await supabase
      .from("projects")
      .select(`
        id, name, breeding_date, customer_id, customer_supplied_tank,
        customers!projects_customer_id_fkey(name),
        project_billing(id, catl_invoice_status, select_sires_invoice_status)
      `)
      .eq("organization_id", orgId)
      .eq("status", "Ready to Bill");

    const mappedProjects: BillableProject[] = (projRows ?? [])
      .map((p: any) => {
        const billing = Array.isArray(p.project_billing) ? p.project_billing[0] : p.project_billing;
        if (!billing?.id) return null;
        // A project stays in "awaiting invoice" until its invoice statuses are
        // no longer 'unbilled'. Stamping billing_completed_at does NOT remove
        // it — the invoice status is the real gate.
        const stillUnbilled =
          billing.catl_invoice_status === "unbilled" ||
          billing.select_sires_invoice_status === "unbilled";
        if (!stillUnbilled) return null;
        return {
          id: p.id,
          name: p.name,
          customer_name: p.customers?.name || "Unknown",
          breeding_date: p.breeding_date,
          billing_id: billing.id,
          customer_supplied_tank: !!p.customer_supplied_tank,
        } as BillableProject;
      })
      .filter((p): p is BillableProject => p !== null);
    setProjects(mappedProjects);

    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [orgId]);

  const ordersByCompany = useMemo(() => {
    const groups = new Map<string, BillableOrder[]>();
    for (const o of orders) {
      const key = invoicingCompanyLabel(o.invoicing_company_id);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(o);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [orders]);

  const markProjectInvoiced = async (proj: BillableProject) => {
    setSavingId(proj.billing_id);
    const now = new Date().toISOString();
    const { error: pErr } = await supabase
      .from("projects")
      .update({ status: "Invoiced" })
      .eq("id", proj.id);
    if (pErr) {
      setSavingId(null);
      toast({ title: "Error", description: pErr.message, variant: "destructive" });
      return;
    }
    await supabase
      .from("project_billing")
      .update({ billing_completed_at: now })
      .eq("id", proj.billing_id);
    setSavingId(null);
    setProjects((prev) => prev.filter((p) => p.billing_id !== proj.billing_id));
    toast({ title: "Project marked invoiced" });
  };

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="container mx-auto px-4 py-6 space-y-6 max-w-5xl">
        <div>
          <h1 className="text-2xl font-bold font-display tracking-tight">Billable</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Fulfilled orders and completed projects waiting on an invoice.
          </p>
        </div>

        {loading ? (
          <div className="py-16 flex justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading...
          </div>
        ) : (
          <>
            {/* ── Orders section ── */}
            {ordersByCompany.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  No fulfilled orders awaiting invoice.
                </CardContent>
              </Card>
            ) : (
              ordersByCompany.map(([company, list]) => {
                const isUnassigned = company === "Unassigned";
                return (
                <Card key={company} className={isUnassigned ? "border-amber-500/40" : undefined}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center justify-between">
                      <span className={isUnassigned ? "flex items-center gap-1.5 text-amber-500" : ""}>
                        {isUnassigned && <AlertTriangle className="h-4 w-4" />}
                        {company}
                      </span>
                      <Badge variant="outline">{list.length} order{list.length !== 1 ? "s" : ""}</Badge>
                    </CardTitle>
                    {isUnassigned && (
                      <p className="text-xs text-amber-500">
                        These orders need an invoicing company assigned before they can be billed.
                      </p>
                    )}
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="divide-y divide-border">
                      {list.map((o) => (
                        <div key={o.id} className="flex items-center gap-3 px-4 py-3">
                          <div className="min-w-0 flex-1">
                            <Link
                              to={`/semen-orders/${o.id}`}
                              className="font-medium text-sm hover:text-primary truncate block"
                            >
                              {o.customer_name}
                            </Link>
                            <div className="text-xs text-muted-foreground truncate">
                              {o.order_date ? format(parseISO(o.order_date), "MMM d, yyyy") : "—"} · {o.total_units} units · {o.bull_summary || "no items"}
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => navigate(`/semen-orders/${o.id}`)}
                          >
                            <Printer className="h-4 w-4 mr-1" /> Print
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => navigate(`/semen-orders/${o.id}`)}
                          >
                            Open <ChevronRight className="h-4 w-4 ml-1" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
                );
              })
            )}

            {/* ── Projects section ── */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center justify-between">
                  <span>Projects awaiting invoice</span>
                  <Badge variant="outline">{projects.length} project{projects.length !== 1 ? "s" : ""}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {projects.length === 0 ? (
                  <p className="px-4 py-6 text-sm text-muted-foreground text-center">
                    No projects awaiting invoice.
                  </p>
                ) : (
                  <div className="divide-y divide-border">
                    {projects.map((p) => (
                      <div key={p.billing_id} className="flex items-center gap-3 px-4 py-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <Link
                              to={`/project/${p.id}/billing`}
                              className="font-medium text-sm hover:text-primary truncate"
                            >
                              {p.name}
                            </Link>
                            {p.customer_supplied_tank && (
                              <Badge variant="outline" className="bg-teal-600/20 text-teal-400 border-teal-600/30 text-xs shrink-0">
                                Customer Tank
                              </Badge>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {p.customer_name}
                            {p.breeding_date && ` · Bred ${format(parseISO(p.breeding_date), "MMM d, yyyy")}`}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => navigate(`/project/${p.id}/billing`)}
                        >
                          Open <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => setCloseOutProject(p)}
                        >
                          <CheckCircle2 className="h-4 w-4 mr-1" /> Close Out
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
      {closeOutProject && (
        <CloseOutReviewDialog
          open={!!closeOutProject}
          onOpenChange={(o) => { if (!o) setCloseOutProject(null); }}
          projectName={closeOutProject.name}
          projectId={closeOutProject.id}
          billingId={closeOutProject.billing_id}
          onConfirm={() => { void markProjectInvoiced(closeOutProject); }}
        />
      )}
      <AppFooter />
    </div>
  );
};

export default Billable;
