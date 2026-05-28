import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, AlertTriangle, XCircle, Loader2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

const SELECT_SIRES_ID = "630b12de-74bc-407a-8ee5-1ea17df18881";

interface CloseOutReviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectName: string;
  projectId: string;
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
  bull_catalog_id: string | null;
  bull_name: string;
  unit_price: number | null;
  units_billable: number | null;
  invoicing_company_id: string | null;
  line_total: number | null;
};

type PackLineBillableRow = {
  bull_catalog_id: string | null;
  bull_name: string | null;
  is_billable: boolean | null;
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
  open, onOpenChange, projectName, projectId, billingId, onConfirm,
}: CloseOutReviewProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["close_out_review", billingId, open],
    enabled: !!billingId && open,
    queryFn: async () => {
      // Get pack ids for the project so we can pull is_billable per pack line
      // (project_billing_semen does not store is_billable directly).
      const { data: packLinks } = await supabase
        .from("tank_pack_projects")
        .select("tank_pack_id")
        .eq("project_id", projectId);
      const packIds = (packLinks ?? []).map((l: any) => l.tank_pack_id).filter(Boolean);

      const [prods, semen, sess, inv, packs, billing] = await Promise.all([
        supabase
          .from("project_billing_products")
          .select("product_name, product_category, unit_price, units_billed, doses, delivery_method, line_total")
          .eq("billing_id", billingId),
        supabase
          .from("project_billing_semen")
          .select("bull_catalog_id, bull_name, unit_price, units_billable, invoicing_company_id, line_total")
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
        packIds.length > 0
          ? supabase
              .from("tank_pack_lines")
              .select("bull_catalog_id, bull_name, is_billable")
              .in("tank_pack_id", packIds)
          : Promise.resolve({ data: [] as PackLineBillableRow[] }),
        supabase
          .from("project_billing")
          .select("select_sires_invoice_number, catl_invoice_number")
          .eq("id", billingId)
          .maybeSingle(),
      ]);
      return {
        productLines: (prods.data ?? []) as ProductRow[],
        semenLines: (semen.data ?? []) as SemenRow[],
        sessions: (sess.data ?? []) as SessionRow[],
        sessionInventory: (inv.data ?? []) as SessionInvRow[],
        packLines: ((packs as any).data ?? []) as PackLineBillableRow[],
        selectInvoiceNumber: ((billing as any).data?.select_sires_invoice_number ?? "") as string,
        catlInvoiceNumber: ((billing as any).data?.catl_invoice_number ?? "") as string,
      };
    },
  });

  // Optional invoice numbers entered at close-out. A company only needs one
  // when it has billable dollars; we prefill from any number already saved
  // in the Invoicing section.
  const [selectInv, setSelectInv] = useState("");
  const [catlInv, setCatlInv] = useState("");
  const [forceOverride, setForceOverride] = useState(false);
  useEffect(() => {
    if (!open) setForceOverride(false);
  }, [open]);
  useEffect(() => {
    if (data) {
      setSelectInv(data.selectInvoiceNumber ?? "");
      setCatlInv(data.catlInvoiceNumber ?? "");
    }
  }, [data]);

  // Per-company billable totals decide which invoice-number inputs to show.
  const selectTotal = (data?.semenLines ?? [])
    .filter((s) => s.invoicing_company_id === SELECT_SIRES_ID)
    .reduce((sum, s) => sum + (s.line_total ?? 0), 0);
  const catlSemen = (data?.semenLines ?? [])
    .filter((s) => s.invoicing_company_id !== SELECT_SIRES_ID)
    .reduce((sum, s) => sum + (s.line_total ?? 0), 0);
  const productsTotal = (data?.productLines ?? []).reduce((sum, p) => sum + (p.line_total ?? 0), 0);
  const catlTotal = catlSemen + productsTotal;

  const handleCloseOut = async () => {
    // Record the override in notes BEFORE other writes so the audit trail
    // captures who/what was bypassed even if the close path errors later.
    if (isOverridingCritical) {
      const issueList = critical.map((c) => `• ${c.message}`).join("\n");
      const overrideNote = `[Force-closed ${new Date().toISOString().slice(0, 10)}]\nBypassed checks:\n${issueList}`;
      const { data: existing } = await supabase
        .from("project_billing")
        .select("notes")
        .eq("id", billingId)
        .single();
      const newNotes = existing?.notes
        ? `${existing.notes}\n\n${overrideNote}`
        : overrideNote;
      await supabase
        .from("project_billing")
        .update({ notes: newNotes })
        .eq("id", billingId);
    }

    // Persist any invoice numbers entered here before finalizing.
    const patch: Record<string, string | null> = {};
    if (selectTotal > 0) patch.select_sires_invoice_number = selectInv.trim() || null;
    if (catlTotal > 0) patch.catl_invoice_number = catlInv.trim() || null;
    if (Object.keys(patch).length > 0) {
      await supabase.from("project_billing").update(patch).eq("id", billingId);
    }
    onConfirm();
    onOpenChange(false);
  };

  const { critical, warnings, oks } = useMemo(() => {
    const crit: Check[] = [];
    const warn: Check[] = [];
    const ok: Check[] = [];
    if (!data) return { critical: crit, warnings: warn, oks: ok };
    const { productLines, semenLines, sessions, sessionInventory, packLines } = data;

    // A bull is customer-supplied when every pack_line for it on this
    // project is is_billable=false. Those rows don't need an invoicing
    // company or a price — skip them in the checks below.
    const nonBillableBulls = (() => {
      const billable = new Set<string>();
      const all = new Set<string>();
      for (const pl of packLines) {
        const k = pl.bull_catalog_id || pl.bull_name || "";
        if (!k) continue;
        all.add(k);
        if (pl.is_billable !== false) billable.add(k);
      }
      const out = new Set<string>();
      for (const k of all) if (!billable.has(k)) out.add(k);
      return out;
    })();
    const isBillableSemenLine = (s: SemenRow) =>
      !nonBillableBulls.has(s.bull_catalog_id || s.bull_name);

    const hasEnds = sessionInventory.some((r) => r.end_units != null);
    if (hasEnds) ok.push({ kind: "ok", message: "Session end values filled" });
    else crit.push({ kind: "fail", message: "No session has end_units filled — no work recorded" });

    const armIdx = productLines.findIndex(isArmService);
    if (armIdx < 0) {
      warn.push({ kind: "warn", message: "No Arm Service line found" });
    } else {
      const arm = productLines[armIdx];
      // Arm Service head count lives in `doses` for auto-calculated rows and
      // in `units_billed` when the user has overridden the count (typical for
      // CATL-administered service). Prefer whichever is present and positive.
      const effectiveHead =
        (arm.doses && arm.doses > 0)
          ? arm.doses
          : (arm.units_billed && arm.units_billed > 0)
            ? arm.units_billed
            : 0;

      if (effectiveHead <= 0) {
        crit.push({ kind: "fail", message: "Arm Service has no head count" });
      } else if (!arm.unit_price || arm.unit_price <= 0) {
        crit.push({ kind: "fail", message: "Arm Service has no price" });
      } else {
        ok.push({
          kind: "ok",
          message: `Arm Service: ${effectiveHead} head × $${arm.unit_price.toFixed(2)} = $${(arm.line_total ?? 0).toFixed(2)}`,
        });
      }

      const totalHead = sessions.reduce((s, x) => s + (x.head_count ?? 0), 0);
      if (totalHead > 0 && effectiveHead > 0 && Math.abs(effectiveHead - totalHead) > 0) {
        warn.push({
          kind: "warn",
          message: `Arm Service qty (${effectiveHead}) doesn't match total session head (${totalHead})`,
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

    const billableSemen = semenLines.filter(isBillableSemenLine);
    if (semenLines.length === 0) {
      warn.push({ kind: "warn", message: "No semen billable lines" });
    } else if (billableSemen.length === 0) {
      ok.push({ kind: "ok", message: "All semen is customer-supplied — nothing to bill" });
    } else {
      const linesWithNoCompany = billableSemen.filter((s) => !s.invoicing_company_id);
      if (linesWithNoCompany.length > 0) {
        crit.push({
          kind: "fail",
          message: `Semen missing invoicing company: ${linesWithNoCompany.map((s) => s.bull_name).join(", ")}`,
        });
      } else {
        ok.push({ kind: "ok", message: "All billable semen lines have an invoicing company" });
      }
      const missingPrice = billableSemen.filter(
        (s) => (s.units_billable ?? 0) > 0 && (!s.unit_price || s.unit_price <= 0),
      );
      if (missingPrice.length > 0) {
        crit.push({
          kind: "fail",
          message: `Semen missing price: ${missingPrice.map((s) => s.bull_name).join(", ")}`,
        });
      }
      const semenTotal = billableSemen.reduce((s, l) => s + (l.line_total ?? 0), 0);
      if (semenTotal === 0) {
        warn.push({ kind: "warn", message: "Semen billable total is $0 — prices not filled in?" });
      } else {
        ok.push({
          kind: "ok",
          message: `Semen billable: ${billableSemen.length} bull${billableSemen.length === 1 ? "" : "s"}, $${semenTotal.toFixed(2)}`,
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

  const canProceed = !isLoading && (critical.length === 0 || forceOverride);
  const isOverridingCritical = critical.length > 0 && forceOverride;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Close Out Project — {projectName}</DialogTitle>
          <DialogDescription>
            Review the checklist, then enter an invoice number if available (or
            leave blank to close without one).
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
              ? `${critical.length} issue${critical.length === 1 ? "" : "s"} to fix before closing out.`
              : warnings.length > 0
                ? `${warnings.length} warning${warnings.length === 1 ? "" : "s"} — review and confirm.`
                : "All checks passed."}
          </div>
        )}

        {!isLoading && critical.length > 0 && (
          <label className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs cursor-pointer select-none">
            <input
              type="checkbox"
              checked={forceOverride}
              onChange={(e) => setForceOverride(e.target.checked)}
              className="mt-0.5 shrink-0"
            />
            <span className="text-foreground">
              <span className="font-medium">Override checks and close anyway.</span>
              <span className="block text-muted-foreground mt-0.5">
                I've reviewed the issues above and want to close this project out regardless.
              </span>
            </span>
          </label>
        )}

        {!isLoading && canProceed && (selectTotal > 0 || catlTotal > 0) && (
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">Invoice number (optional)</div>
            {selectTotal > 0 && (
              <label className="flex items-center justify-between gap-2 text-sm">
                <span className="text-muted-foreground">Select Sires</span>
                <Input
                  className="h-8 w-48 text-sm"
                  value={selectInv}
                  onChange={(e) => setSelectInv(e.target.value)}
                  placeholder="Invoice #"
                />
              </label>
            )}
            {catlTotal > 0 && (
              <label className="flex items-center justify-between gap-2 text-sm">
                <span className="text-muted-foreground">CATL Resources</span>
                <Input
                  className="h-8 w-48 text-sm"
                  value={catlInv}
                  onChange={(e) => setCatlInv(e.target.value)}
                  placeholder="Invoice #"
                />
              </label>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={!canProceed}
            className={
              isOverridingCritical
                ? "bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                : "bg-purple-600 hover:bg-purple-600/90 text-white"
            }
            onClick={handleCloseOut}
          >
            {!canProceed
              ? "Fix issues to continue"
              : isOverridingCritical
                ? "Force Close Out"
                : "Close Out"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
