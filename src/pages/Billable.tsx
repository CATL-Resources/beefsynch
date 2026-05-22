import { useEffect, useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { CheckCircle2, ChevronRight, Loader2, Printer } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useOrgRole } from "@/hooks/useOrgRole";
import { toast } from "@/hooks/use-toast";
import { getBullDisplayLabel } from "@/lib/bullDisplay";

import Navbar from "@/components/Navbar";
import AppFooter from "@/components/AppFooter";
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
}

const Billable = () => {
  const navigate = useNavigate();
  const { orgId } = useOrgRole();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<BillableOrder[]>([]);
  const [projects, setProjects] = useState<BillableProject[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = async () => {
    if (!orgId) return;
    setLoading(true);

    const { data: orderRows } = await supabase
      .from("semen_orders")
      .select(`
        id, order_date, invoicing_company_id,
        customers!semen_orders_customer_id_fkey(name),
        semen_order_items(units, bull_catalog_id, custom_bull_name, bulls_catalog(bull_name, naab_code)),
        product_order_items(quantity, product_name, line_total)
      `)
      .eq("organization_id", orgId)
      .eq("order_type", "customer")
      .eq("status", "fulfilled")
      .order("order_date", { ascending: true });

    const mappedOrders: BillableOrder[] = (orderRows ?? []).map((o: any) => {
      const items = o.semen_order_items || [];
      const products = o.product_order_items || [];
      const total = items.reduce((s: number, i: any) => s + (i.units || 0), 0);
      const semenSummary = items
        .map((i: any) => `${i.units} ${getBullDisplayLabel(i)}`)
        .join(" + ");
      const productSummary = products
        .map((p: any) => `${p.quantity} ${p.product_name}`)
        .join(" + ");
      const summary = [semenSummary, productSummary].filter(Boolean).join(" + ");
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
        id, name, breeding_date, customer_id,
        customers!projects_customer_id_fkey(name),
        project_billing(id)
      `)
      .eq("organization_id", orgId)
      .eq("status", "Ready to Bill");

    const mappedProjects: BillableProject[] = (projRows ?? [])
      .map((p: any) => {
        const billing = Array.isArray(p.project_billing) ? p.project_billing[0] : p.project_billing;
        if (!billing?.id) return null;
        return {
          id: p.id,
          name: p.name,
          customer_name: p.customers?.name || "Unknown",
          breeding_date: p.breeding_date,
          billing_id: billing.id,
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
              ordersByCompany.map(([company, list]) => (
                <Card key={company}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center justify-between">
                      <span>{company}</span>
                      <Badge variant="outline">{list.length} order{list.length !== 1 ? "s" : ""}</Badge>
                    </CardTitle>
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
              ))
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
                          <Link
                            to={`/project/${p.id}/billing`}
                            className="font-medium text-sm hover:text-primary truncate block"
                          >
                            {p.name}
                          </Link>
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
                          disabled={savingId === p.billing_id}
                          onClick={() => markProjectInvoiced(p)}
                        >
                          {savingId === p.billing_id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <CheckCircle2 className="h-4 w-4 mr-1" /> Mark Invoiced
                            </>
                          )}
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
      <AppFooter />
    </div>
  );
};

export default Billable;
