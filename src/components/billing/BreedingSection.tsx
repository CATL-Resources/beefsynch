import React, { useState, useMemo, useEffect } from "react";
import { Plus, Trash2, Pencil, ChevronRight, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ProductLine, SessionLine, SessionInventoryLine, SemenLine, BillingProduct,
  formatCurrency, isBreedingSession, toggleSetItem,
} from "./billingTypes";

interface BreedingSectionProps {
  sessions: SessionLine[];
  allSessions: SessionLine[];
  productLines: ProductLine[];
  sessionInventory: SessionInventoryLine[];
  semenLines: SemenLine[];
  billingProducts: BillingProduct[];
  readOnly: boolean;
  onSaveSession: (idx: number, updates: Partial<SessionLine>) => void;
  onSaveProduct: (idx: number, updates: Partial<ProductLine>) => void;
  onSwapProduct: (idx: number, newProductId: string) => void;
  onRemoveProduct: (idx: number) => void;
  onAddProductToSession: (sessionId: string) => void;
  onAddBreedingSession: () => void;
  onRemoveSession: (idx: number) => void;
  onSaveWorksheetCell: (rowId: string, field: "start_units" | "end_units" | "blown_units", value: number | null) => void;
  onSetSessionInventory: React.Dispatch<React.SetStateAction<SessionInventoryLine[]>>;
  onTotalUsedChanged: (totalUsed: number, bullUsed: Map<string, number>, bullBlown: Map<string, number>) => void;
}

// Small borderless inline text input that commits on blur. Used in the
// session card header for label/time-of-day so they read like editable text.
function InlineHeaderText({
  value, onCommit, placeholder, className, readOnly, ariaLabel,
}: {
  value: string | null | undefined;
  onCommit: (next: string | null) => void;
  placeholder: string;
  className?: string;
  readOnly?: boolean;
  ariaLabel: string;
}) {
  const [local, setLocal] = useState(value ?? "");
  useEffect(() => { setLocal(value ?? ""); }, [value]);
  return (
    <input
      type="text"
      aria-label={ariaLabel}
      placeholder={placeholder}
      value={local}
      readOnly={readOnly}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        const next = local.trim() || null;
        if (next !== (value ?? null)) onCommit(next);
      }}
      className={
        "bg-transparent border-0 border-b border-transparent hover:border-border focus:border-primary focus:outline-none px-1 py-0.5 text-sm rounded-none " +
        (className ?? "")
      }
    />
  );
}

export default function BreedingSection({
  sessions, allSessions, productLines, sessionInventory, semenLines, billingProducts, readOnly,
  onSaveSession, onSaveProduct, onSwapProduct, onRemoveProduct,
  onAddProductToSession, onAddBreedingSession, onRemoveSession,
  onSaveWorksheetCell, onSetSessionInventory, onTotalUsedChanged,
}: BreedingSectionProps) {
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set());
  const [editingSessions, setEditingSessions] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => setExpandedSessions(p => toggleSetItem(p, id));
  const toggleEdit = (id: string) => setEditingSessions(p => toggleSetItem(p, id));

  const sorted = useMemo(() =>
    [...sessions].sort((a, b) => a.session_date.localeCompare(b.session_date) || (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [sessions]);

  const bullCombos = useMemo(() => {
    const map = new Map<string, { bull_name: string; bull_code: string | null; bull_catalog_id: string | null; canister: string }>();
    for (const inv of sessionInventory) {
      const key = `${inv.bull_catalog_id || inv.bull_name}|${inv.canister}`;
      if (!map.has(key)) map.set(key, { bull_name: inv.bull_name, bull_code: inv.bull_code, bull_catalog_id: inv.bull_catalog_id, canister: inv.canister });
    }
    return Array.from(map.values()).sort((a, b) => a.bull_name.localeCompare(b.bull_name) || a.canister.localeCompare(b.canister, undefined, { numeric: true }));
  }, [sessionInventory]);

  const invLookup = useMemo(() => {
    const m = new Map<string, Map<string, SessionInventoryLine>>();
    for (const inv of sessionInventory) {
      const ck = `${inv.bull_catalog_id || inv.bull_name}|${inv.canister}`;
      if (!m.has(ck)) m.set(ck, new Map());
      m.get(ck)!.set(inv.session_id, inv);
    }
    return m;
  }, [sessionInventory]);

  const getEffectiveStart = (comboKey: string, sessionIdx: number): number | null => {
    const sessMap = invLookup.get(comboKey);
    if (!sessMap) return null;
    const sess = sorted[sessionIdx];
    const row = sessMap.get(sess?.id || "");
    if (row?.start_units != null) return row.start_units;
    if (sessionIdx > 0) {
      const prevSess = sorted[sessionIdx - 1];
      const prevRow = sessMap.get(prevSess?.id || "");
      return prevRow?.end_units ?? null;
    }
    return null;
  };

  const { bullTotals, grandTotalUsed } = useMemo(() => {
    const bt = new Map<string, { packed: number; used: number; blown: number }>();
    for (const sl of semenLines) {
      bt.set(sl.bull_catalog_id || sl.bull_name, { packed: sl.units_packed ?? 0, used: 0, blown: 0 });
    }
    for (let si = 0; si < sorted.length; si++) {
      for (const combo of bullCombos) {
        const ck = `${combo.bull_catalog_id || combo.bull_name}|${combo.canister}`;
        const start = getEffectiveStart(ck, si);
        const sessMap = invLookup.get(ck);
        const row = sessMap?.get(sorted[si]?.id || "");
        const end = row?.end_units;
        if (start != null && end != null && start > end) {
          const bk = combo.bull_catalog_id || combo.bull_name;
          const existing = bt.get(bk) || { packed: 0, used: 0, blown: 0 };
          existing.used += (start - end);
          bt.set(bk, existing);
        }
        // Accumulate blown from session inventory
        if (row?.blown_units) {
          const bk = combo.bull_catalog_id || combo.bull_name;
          const existing = bt.get(bk) || { packed: 0, used: 0, blown: 0 };
          existing.blown += row.blown_units;
          bt.set(bk, existing);
        }
      }
    }
    let grand = 0;
    bt.forEach(v => grand += v.used);
    return { bullTotals: bt, grandTotalUsed: grand };
  }, [sorted, bullCombos, invLookup, semenLines]);

  useEffect(() => {
    const bullUsed = new Map<string, number>();
    const bullBlown = new Map<string, number>();
    bullTotals.forEach((v, k) => { bullUsed.set(k, v.used); bullBlown.set(k, v.blown); });
    onTotalUsedChanged(grandTotalUsed, bullUsed, bullBlown);
  }, [bullTotals, grandTotalUsed, onTotalUsedChanged]);

  const productsBySession = useMemo(() => {
    const m = new Map<string, ProductLine[]>();
    for (const p of productLines) { if (p.session_id) { if (!m.has(p.session_id)) m.set(p.session_id, []); m.get(p.session_id)!.push(p); } }
    return m;
  }, [productLines]);

  if (sorted.length === 0 && semenLines.length === 0) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          No breeding sessions yet.
          {!readOnly && (
            <div className="mt-3">
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={onAddBreedingSession}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Breeding Session
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {/* ── Semen Summary with Blown ── */}
      <Card>
        <CardContent className="py-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Semen summary</p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bull</TableHead>
                <TableHead className="w-[70px] text-right">Packed</TableHead>
                <TableHead className="w-[70px] text-right">Used</TableHead>
                <TableHead className="w-[80px] text-right">Blown</TableHead>
                <TableHead className="w-[80px] text-right">Remaining</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {semenLines.map((sl, slIdx) => {
                const key = sl.bull_catalog_id || sl.bull_name;
                const bt = bullTotals.get(key);
                const packed = bt?.packed ?? (sl.units_packed ?? 0);
                const used = bt?.used ?? 0;
                const blown = bt?.blown ?? 0;
                return (
                  <TableRow key={sl.id}>
                    <TableCell className="text-sm">
                      <span className="font-medium">{sl.bull_name}</span>
                      {sl.bull_code && <span className="text-xs text-muted-foreground ml-1.5">{sl.bull_code}</span>}
                    </TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">{packed}</TableCell>
                    <TableCell className="text-right text-sm font-medium">{used || "—"}</TableCell>
                    <TableCell className="text-right text-sm">{blown || "—"}</TableCell>
                    <TableCell className="text-right text-sm font-medium">{packed - used}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {grandTotalUsed > 0 && (
            <div className="flex justify-between items-center pt-3 border-t mt-2 text-sm">
              <span className="text-muted-foreground">Total head bred</span>
              <span className="font-semibold">{grandTotalUsed}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Breeding Sessions ── */}
      {sorted.map((s, si) => {
        const sessionIdx = allSessions.findIndex(x => x.id === s.id);
        const sessionId = s.id || "";
        const isExpanded = expandedSessions.has(sessionId);
        const isEditing = editingSessions.has(sessionId);
        const prods = productsBySession.get(sessionId) || [];

        const semenRows = bullCombos.map(combo => {
          const ck = `${combo.bull_catalog_id || combo.bull_name}|${combo.canister}`;
          const sessMap = invLookup.get(ck);
          const row = sessMap?.get(sessionId);
          const effectiveStart = getEffectiveStart(ck, si);
          const used = (effectiveStart != null && row?.end_units != null) ? effectiveStart - row.end_units : null;
          return { ...combo, comboKey: ck, row, effectiveStart, used };
        });

        const sessionUsed = semenRows.reduce((sum, r) => sum + (r.used != null && r.used > 0 ? r.used : 0), 0);

        return (
          <Card key={sessionId} className="overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors">
              <button
                type="button"
                onClick={() => toggleExpand(sessionId)}
                aria-label={isExpanded ? "Collapse session" : "Expand session"}
                className="shrink-0 text-muted-foreground hover:text-foreground"
              >
                {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>
              <div className="flex-1 min-w-0 flex items-center gap-1 flex-wrap">
                <input
                  type="date"
                  aria-label="Session date"
                  value={s.session_date || ""}
                  readOnly={readOnly}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v) onSaveSession(sessionIdx, { session_date: v });
                  }}
                  className="bg-transparent border-0 border-b border-transparent hover:border-border focus:border-primary focus:outline-none px-1 py-0.5 text-sm font-medium rounded-none w-[140px]"
                />
                <span className="text-sm text-muted-foreground">·</span>
                <InlineHeaderText
                  value={s.session_label}
                  placeholder="Breeding"
                  ariaLabel="Session label"
                  readOnly={readOnly}
                  className="w-[110px]"
                  onCommit={(v) => onSaveSession(sessionIdx, { session_label: v })}
                />
                <InlineHeaderText
                  value={s.time_of_day}
                  placeholder="Time"
                  ariaLabel="Time of day"
                  readOnly={readOnly}
                  className="w-[80px] text-muted-foreground"
                  onCommit={(v) => onSaveSession(sessionIdx, { time_of_day: v } as Partial<SessionLine>)}
                />
                <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-primary/40 text-primary">
                  Breeding {si + 1}
                </Badge>
              </div>
              <div className="text-sm font-semibold tabular-nums shrink-0">
                {sessionUsed > 0 ? `${sessionUsed} hd` : "—"}
              </div>
            </div>

            {isExpanded && (
              <CardContent className="border-t pt-4 space-y-4">
                {!readOnly && (
                  <div className="flex justify-end">
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => toggleEdit(sessionId)}>
                      {isEditing ? "Done" : <><Pencil className="h-3 w-3 mr-1" /> Edit</>}
                    </Button>
                  </div>
                )}

                {/* Notes only — no head count or crew for breeding */}
                <div className="text-xs">
                  <label className="text-muted-foreground">Notes</label>
                  {isEditing ? (
                    <Input className="h-8 text-xs mt-1" value={s.notes || ""} placeholder="—"
                      onChange={(e) => onSaveSession(sessionIdx, { notes: e.target.value })} />
                  ) : <p className="mt-1 font-medium">{s.notes || "—"}</p>}
                </div>

                {/* Products (GnRH etc) */}
                {(prods.length > 0 || isEditing) && (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[180px]">Product</TableHead>
                          <TableHead className="w-[80px] text-right">Head</TableHead>
                          <TableHead className="w-[90px] text-right">Price</TableHead>
                          <TableHead className="w-[100px] text-right">Total</TableHead>
                          {isEditing && <TableHead className="w-[40px]" />}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {prods.map(line => {
                          const idx = productLines.findIndex(p => p.id === line.id);
                          const catProds = billingProducts.filter(p => p.product_category === line.product_category);
                          return (
                            <TableRow key={line.id}>
                              <TableCell className="text-sm">
                                {isEditing && catProds.length > 1 ? (
                                  <Select value={line.billing_product_id || ""} onValueChange={(v) => onSwapProduct(idx, v)}>
                                    <SelectTrigger className="h-8 text-xs"><SelectValue>{line.product_name}</SelectValue></SelectTrigger>
                                    <SelectContent>{catProds.map(p => <SelectItem key={p.id} value={p.id}>{p.product_name}</SelectItem>)}</SelectContent>
                                  </Select>
                                ) : <span>{line.product_name}</span>}
                              </TableCell>
                              <TableCell className="text-right">
                                {isEditing ? (
                                  <Input type="number" className="h-8 w-[70px] text-right text-xs ml-auto" value={line.doses || ""} placeholder="—"
                                    onChange={(e) => onSaveProduct(idx, { doses: Number(e.target.value) || 0 })} />
                                ) : <span className="text-sm">{line.doses || "—"}</span>}
                              </TableCell>
                              <TableCell className="text-right text-sm">{line.unit_price ? formatCurrency(line.unit_price) : "—"}</TableCell>
                              <TableCell className="text-right text-sm font-medium">{line.line_total ? formatCurrency(line.line_total) : "—"}</TableCell>
                              {isEditing && (
                                <TableCell className="p-1"><Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                                  onClick={() => onRemoveProduct(idx)}><Trash2 className="h-3 w-3" /></Button></TableCell>
                              )}
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                    {isEditing && (
                      <Button variant="outline" size="sm" className="h-7 text-xs mt-2" onClick={() => onAddProductToSession(sessionId)}>
                        <Plus className="h-3 w-3 mr-1" /> Add Product
                      </Button>
                    )}
                  </div>
                )}

                {/* Semen grid — wider fields */}
                {semenRows.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Semen counts</p>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Bull</TableHead>
                            <TableHead className="w-[50px] text-center">Can.</TableHead>
                            <TableHead className="w-[100px] text-right">Start</TableHead>
                            <TableHead className="w-[100px] text-right">End</TableHead>
                            <TableHead className="w-[70px] text-right">Used</TableHead>
                            <TableHead className="w-[80px] text-right">Blown</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {semenRows.map(sr => (
                            <TableRow key={sr.comboKey}>
                              <TableCell className="text-sm">
                                {sr.bull_name}
                                {sr.bull_code && <span className="ml-1 text-muted-foreground text-xs">· {sr.bull_code}</span>}
                              </TableCell>
                              <TableCell className="text-center text-xs font-mono">{sr.canister}</TableCell>
                              <TableCell className="text-right p-1">
                                {isEditing && si === 0 ? (
                                  <Input type="number" className="h-9 w-[90px] text-right text-sm ml-auto"
                                    value={sr.effectiveStart ?? ""} placeholder="—"
                                    onBlur={(e) => {
                                      if (!sr.row?.id) return;
                                      const v = e.target.value === "" ? null : Number(e.target.value);
                                      onSaveWorksheetCell(sr.row.id, "start_units", v);
                                    }}
                                    onChange={(e) => {
                                      if (!sr.row?.id) return;
                                      const v = e.target.value === "" ? null : Number(e.target.value);
                                      onSetSessionInventory(prev => prev.map(r => r.id === sr.row!.id ? { ...r, start_units: v } : r));
                                    }} />
                                ) : (
                                  <span className="text-sm">{sr.effectiveStart ?? "—"}</span>
                                )}
                              </TableCell>
                              <TableCell className="text-right p-1">
                                {isEditing ? (
                                  <Input type="number" className="h-9 w-[90px] text-right text-sm ml-auto"
                                    value={sr.row?.end_units ?? ""} placeholder="—"
                                    onBlur={(e) => {
                                      if (!sr.row?.id) return;
                                      const v = e.target.value === "" ? null : Number(e.target.value);
                                      onSaveWorksheetCell(sr.row.id, "end_units", v);
                                    }}
                                    onChange={(e) => {
                                      if (!sr.row?.id) return;
                                      const v = e.target.value === "" ? null : Number(e.target.value);
                                      onSetSessionInventory(prev => prev.map(r => r.id === sr.row!.id ? { ...r, end_units: v } : r));
                                    }} />
                                ) : (
                                  <span className="text-sm">{sr.row?.end_units ?? "—"}</span>
                                )}
                              </TableCell>
                              <TableCell className="text-right text-sm font-medium">
                                {sr.used != null && sr.used > 0 ? sr.used : "—"}
                              </TableCell>
                              <TableCell className="text-right p-1">
                                {isEditing ? (
                                  <Input type="number" className="h-9 w-[90px] text-right text-sm ml-auto"
                                    value={sr.row?.blown_units ?? ""} placeholder="—"
                                    onBlur={(e) => {
                                      if (!sr.row?.id) return;
                                      const v = e.target.value === "" ? null : Number(e.target.value);
                                      onSaveWorksheetCell(sr.row.id, "blown_units", v);
                                    }}
                                    onChange={(e) => {
                                      if (!sr.row?.id) return;
                                      const v = e.target.value === "" ? null : Number(e.target.value);
                                      onSetSessionInventory(prev => prev.map(r => r.id === sr.row!.id ? { ...r, blown_units: v } : r));
                                    }} />
                                ) : (
                                  <span className="text-sm">{sr.row?.blown_units || "—"}</span>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}

                {!readOnly && (
                  <div className="flex justify-end pt-2">
                    <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive"
                      onClick={() => onRemoveSession(sessionIdx)}>
                      <Trash2 className="h-3 w-3 mr-1" /> Remove session
                    </Button>
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        );
      })}

      {!readOnly && (
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={onAddBreedingSession}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add Breeding Session
        </Button>
      )}
    </div>
  );
}
