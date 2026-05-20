import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, AlertTriangle, XCircle, Loader2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

interface CloseOutReviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectName: string;
  billingId: string;
  onConfirm: () => void;
}

type Check = { kind: "ok" | "warn" | "fail"; message: string };

type ProductRow = {
  product_name: string;
  product_category: string | null;
  unit_price: number | null;
  units_billed: number | null;
  doses: number | null;
  delivery_method: string | null;
  line_total: number | null;
};

type SemenRow = {
  bull_name: string;
  unit_price: number | null;
  units_billable: number | null;
  invoicing_company_id: string | null;
  line_total: number | null;
};

type SessionRow = { id: string; head_count: number | null };

type SessionInvRow = {
  session_id: string;
  start_units: number | null;
  end_units: number | null;
  blown_units: number | null;
};

const isArmService = (l: ProductRow) => {
  const name = (l.product_name || "").toLowerCase();
  const cat = (l.product_category || "").toLowerCase();
  return cat === "service" || name.includes("arm service") || name.includes("ai service") || name === "service";
};

const isCidr = (l: ProductRow) => {
  const name = (l.product_name || "").toLowerCase();
  const cat = (l.product_category || "").toLowerCase();
  return cat === "cidr" || name.includes("cidr");
};

export default function CloseOutReviewDialog({
  open, onOpenChange, projectName, billingId, onConfirm,
}: CloseOutReviewProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["close_out_review", billingId, open],
    enabled: !!billingId && open,
    queryFn: async () => {
      const [prods, semen, sess, inv] = await Promise.all([
        supabase
          .from("project_billing_products")
          .select("product_name, product_category, unit_price, units_billed, doses, delivery_method, line_total")
          .eq("billing_id", billingId),
        supabase
          .from("project_billing_semen")
          .select("bull_name, unit_price, units_billable, invoicing_company_id, line_total")
          .eq("billing_id", billingId),
        supabase
          .from("project_billing_sessions")
          .select("id, head_count")
          .eq("billing_id", billingId)
          .eq("session_type", "field_session"),
        supabase
          .from("project_billing_session_inventory")
          .select("session_id, start_units, end_units, blown_units")
          .eq("billing_id", billingId),
      ]);
      return {
        productLines: (prods.data ?? []) as ProductRow[],
        semenLines: (semen.data ?? []) as SemenRow[],
        sessions: (sess.data ?? []) as SessionRow[],
        sessionInventory: (inv.data ?? []) as SessionInvRow[],
      };
    },
  });

  const { critical, warnings, oks } = useMemo(() => {
    const crit: Check[] = [];
    const warn: Check[] = [];
    const ok: Check[] = [];
    if (!data) return { critical: crit, warnings: warn, oks: ok };
    const { productLines, semenLines, sessions, sessionInventory } = data;

    const hasEnds = sessionInventory.some((r) => r.end_units != null);
    if (hasEnds) ok.push({ kind: "ok", message: "Session end values filled" });
    else crit.push({ kind: "fail", message: "No session has end_units filled — no work recorded" });

    const armIdx = productLines.findIndex(isArmService);
    if (armIdx < 0) {
      warn.push({ kind: "warn", message: "No Arm Service line found" });
    } else {
      const arm = productLines[armIdx];
      if (!arm.doses || arm.doses <= 0) {
        crit.push({ kind: "fail", message: "Arm Service has no head count" });
      } else if (!arm.unit_price || arm.unit_price <= 0) {
        crit.push({ kind: "fail", message: "Arm Service has no price" });
      } else {
        ok.push({
          kind: "ok",
          message: `Arm Service: ${arm.doses} head × $${arm.unit_price.toFixed(2)} = $${(arm.line_total ?? 0).toFixed(2)}`,
        });
      }
      const totalHead = sessions.reduce((s, x) => s + (x.head_count ?? 0), 0);
      if (totalHead > 0 && arm.doses != null && Math.abs((arm.doses ?? 0) - totalHead) > 0) {
        warn.push({
          kind: "warn",
          message: `Arm Service qty (${arm.doses}) doesn't match total session head (${totalHead})`,
        });
      }
    }

    for (const p of productLines) {
      if (isArmService(p)) continue;
      if ((p.units_billed ?? 0) <= 0) continue;
      if (!p.unit_price || p.unit_price <= 0) {
        crit.push({ kind: "fail", message: `${p.product_name}: missing price` });
      }
    }

    const cidr = productLines.find(isCidr);
    const totalHeadSessions = sessions.reduce((s, x) => s + (x.head_count ?? 0), 0);
    if (cidr && cidr.units_billed != null && totalHeadSessions > 0) {
      const expected = totalHeadSessions / 10;
      if (cidr.units_billed > 0 && (cidr.units_billed < expected * 0.5 || cidr.units_billed > expected * 2)) {
        warn.push({
          kind: "warn",
          message: `${cidr.product_name} qty (${cidr.units_billed}) looks off vs ${totalHeadSessions} head (~${Math.round(expected)} expected)`,
        });
      }
    }

    if (semenLines.length === 0) {
      warn.push({ kind: "warn", message: "No semen billable lines" });
    } else {
      const allHaveCompany = semenLines.every((s) => !!s.invoicing_company_id);
      if (!allHaveCompany) {
        crit.push({ kind: "fail", message: "Some semen lines have no invoicing company" });
      } else {
        ok.push({ kind: "ok", message: "All semen lines have an invoicing company" });
      }
      const missingPrice = semenLines.filter(
        (s) => (s.units_billable ?? 0) > 0 && (!s.unit_price || s.unit_price <= 0),
      );
      if (missingPrice.length > 0) {
        crit.push({
          kind: "fail",
          message: `Semen missing price: ${missingPrice.map((s) => s.bull_name).join(", ")}`,
        });
      }
      const semenTotal = semenLines.reduce((s, l) => s + (l.line_total ?? 0), 0);
      if (semenTotal === 0) {
        warn.push({ kind: "warn", message: "Semen billable total is $0 — prices not filled in?" });
      } else {
        ok.push({
          kind: "ok",
          message: `Semen billable: ${semenLines.length} bull${semenLines.length === 1 ? "" : "s"}, $${semenTotal.toFixed(2)}`,
        });
      }
    }

    const productsTotal = productLines.reduce((s, l) => s + (l.line_total ?? 0), 0);
    if (productsTotal === 0) warn.push({ kind: "warn", message: "Products total is $0" });

    const undelivered = productLines.filter(
      (p) => (p.units_billed ?? 0) > 0 && (!p.delivery_method || p.delivery_method === "not_yet"),
    );
    for (const p of undelivered) {
      warn.push({ kind: "warn", message: `${p.product_name}: delivery still "Not Done"` });
    }

    for (const s of sessions) {
      if ((s.head_count ?? 0) === 0) {
        warn.push({ kind: "warn", message: "A session has head count 0" });
        break;
      }
    }

    const bigBlown = sessionInventory.some((r) => (r.blown_units ?? 0) > 5);
    if (bigBlown) warn.push({ kind: "warn", message: "Blown > 5 on at least one session — verify" });

    return { critical: crit, warnings: warn, oks: ok };
  }, [data]);

  const canProceed = !isLoading && critical.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Close-out review — {projectName}</DialogTitle>
          <DialogDescription>
            Review the checklist before marking this project invoiced.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Checking…
          </div>
        ) : (
          <div className="space-y-2 text-sm">
            {oks.map((c, i) => (
              <div key={`ok-${i}`} className="flex items-start gap-2 text-emerald-500">
                <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                <span className="text-foreground">{c.message}</span>
              </div>
            ))}
            {warnings.map((c, i) => (
              <div key={`warn-${i}`} className="flex items-start gap-2 text-amber-500">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span className="text-foreground">{c.message}</span>
              </div>
            ))}
            {critical.map((c, i) => (
              <div key={`crit-${i}`} className="flex items-start gap-2 text-destructive">
                <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span className="text-foreground">{c.message}</span>
              </div>
            ))}
          </div>
        )}

        {!isLoading && (
          <div className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
            {critical.length > 0
              ? `${critical.length} issue${critical.length === 1 ? "" : "s"} to fix before invoicing.`
              : warnings.length > 0
                ? `${warnings.length} warning${warnings.length === 1 ? "" : "s"} — review and confirm.`
                : "All checks passed."}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={!canProceed}
            className="bg-purple-600 hover:bg-purple-600/90 text-white"
            onClick={() => { onConfirm(); onOpenChange(false); }}
          >
            {canProceed ? "Invoice anyway →" : "Fix issues to continue"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
