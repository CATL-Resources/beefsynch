import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ChevronDown, ChevronRight, Droplets, Sun } from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { cn } from "@/lib/utils";
import { getBullDisplayName, getBullDisplayLabel } from "@/lib/bullDisplay";
import { getBadgeClass } from "@/lib/badgeStyles";

interface TankData {
  id: string;
  tank_name: string | null;
  tank_number: string;
  model: string | null;
  eid: string | null;
  serial_number: string | null;
  nitrogen_status: string;
}

interface InventoryItem {
  id: string;
  canister: string;
  sub_canister: string | null;
  bull_code: string | null;
  units: number;
  item_type: string | null;
  bulls_catalog?: {
    bull_name: string;
    company: string;
    registration_number: string;
  } | null;
  custom_bull_name: string | null;
}

interface FillRecord {
  id: string;
  fill_date: string;
  fill_type: string | null;
  notes: string | null;
}

interface TransactionRecord {
  id: string;
  created_at: string;
  transaction_type: string;
  units_change: number;
  bulls_catalog?: {
    bull_name: string;
  } | null;
  custom_bull_name: string | null;
}

interface CustomerTankCardProps {
  tank: TankData;
  inventory: InventoryItem[];
  fills: FillRecord[];
  transactions: TransactionRecord[];
  customerId: string;
  isSectionOpen: (tankId: string, section: string) => boolean;
  toggleSection: (tankId: string, section: string) => void;
  onDryToggle: (tankId: string, currentStatus: string) => void;
  onFill: (tankId: string, tankNumber: string, tankName: string | null) => void;
  onAddSemen: (tankId: string) => void;
}

export default function CustomerTankCard({
  tank,
  inventory,
  fills,
  transactions,
  customerId,
  isSectionOpen,
  toggleSection,
  onDryToggle,
  onFill,
  onAddSemen,
}: CustomerTankCardProps) {
  const tankTotal = inventory.reduce((s: number, i) => s + (i.units || 0), 0);
  const lastFill = fills[0];
  const fillOverdue = lastFill
    ? differenceInDays(new Date(), new Date(lastFill.fill_date + "T00:00:00")) > 90
    : false;

  const statusBadge = (status: string) => {
    const cls = getBadgeClass("tankStatus", status.toLowerCase());
    return <Badge variant="outline" className={cls}>{status}</Badge>;
  };

  return (
    <div className="rounded-lg border border-border/50 overflow-hidden">
      {/* Tank header */}
      <div
        className={cn(
          "flex items-center justify-between px-4 py-3",
          tank.nitrogen_status === "dry" ? "bg-yellow-500/10" : "bg-muted/30"
        )}
      >
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold">
              {tank.tank_name ? `${tank.tank_name} — ${tank.tank_number}` : tank.tank_number}
            </span>
            {statusBadge(tank.nitrogen_status || "unknown")}
          </div>
          <div className="flex gap-3 text-xs text-muted-foreground mt-0.5">
            {tank.model && <span>Model: {tank.model}</span>}
            {tank.eid && <span>EID: {tank.eid}</span>}
            {tank.serial_number && <span>S/N: {tank.serial_number}</span>}
          </div>
        </div>
        <div className="flex gap-2">
          {tank.nitrogen_status === "dry" ? (
            <Button size="sm" onClick={() => onDryToggle(tank.id, tank.nitrogen_status)} className="gap-1">
              <Droplets className="h-4 w-4" /> Mark Wet
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onDryToggle(tank.id, tank.nitrogen_status)}
                className="gap-1"
              >
                <Sun className="h-4 w-4" /> Dry Off
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onFill(tank.id, tank.tank_number, tank.tank_name)}
                className="gap-1"
              >
                <Droplets className="h-4 w-4" /> Fill
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.location.href = `/tanks/${tank.id}/reinventory?customer_id=${customerId}`}
              >
                Re-inventory
              </Button>
              <Button variant="outline" size="sm" onClick={() => onAddSemen(tank.id)}>
                Add Semen
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Inventory table */}
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/10">
            <TableHead>Canister</TableHead>
            <TableHead>Sub-can</TableHead>
            <TableHead>Bull</TableHead>
            <TableHead>Bull Code</TableHead>
            <TableHead>Company</TableHead>
            <TableHead className="text-right">Units</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {inventory.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                No inventory
              </TableCell>
            </TableRow>
          ) : (
            <>
              {inventory.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{item.canister}</TableCell>
                  <TableCell>{item.sub_canister || "—"}</TableCell>
                  <TableCell>
                    {getBullDisplayName(item)}
                    {item.item_type === "embryo" && (
                      <Badge
                        variant="outline"
                        className="ml-2 bg-purple-500/15 text-purple-400 border-purple-500/30 text-xs"
                      >
                        Embryo
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>{item.bull_code || "—"}</TableCell>
                  <TableCell>{item.bulls_catalog?.company || "—"}</TableCell>
                  <TableCell className="text-right">{item.units}</TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted/20 font-semibold">
                <TableCell colSpan={5}>Total</TableCell>
                <TableCell className="text-right">{tankTotal}</TableCell>
              </TableRow>
            </>
          )}
        </TableBody>
      </Table>

      {/* Fill History */}
      <div className="border-t border-border">
        <button
          onClick={() => toggleSection(tank.id, "fills")}
          className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-muted/20 transition-colors text-left"
        >
          <div className="flex items-center gap-2 text-sm">
            {isSectionOpen(tank.id, "fills") ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            <span className="font-medium">Fill History ({fills.length})</span>
            {lastFill && (
              <span className="text-xs text-muted-foreground">
                Last fill: {format(new Date(lastFill.fill_date + "T00:00:00"), "MMM d, yyyy")}
              </span>
            )}
          </div>
        </button>
        {isSectionOpen(tank.id, "fills") && (
          <div className="overflow-x-auto">
            {fills.length === 0 ? (
              <p className="px-4 py-3 text-sm text-muted-foreground">No fills recorded</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/5">
                    <TableHead>Fill Date</TableHead>
                    <TableHead>Fill Type</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fills.slice(0, 20).map((fill, idx) => (
                    <TableRow key={fill.id} className={cn(idx === 0 && fillOverdue && "bg-amber-500/10")}>
                      <TableCell className="text-sm">
                        {format(new Date(fill.fill_date + "T00:00:00"), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell className="text-sm">{fill.fill_type || "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{fill.notes || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {fills.length > 20 && (
              <div className="px-4 py-2">
                <Link to={`/tanks/${tank.id}`} className="text-xs text-primary hover:underline">
                  View all on tank page →
                </Link>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Transaction History */}
      <div className="border-t border-border">
        <button
          onClick={() => toggleSection(tank.id, "txns")}
          className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-muted/20 transition-colors text-left"
        >
          <div className="flex items-center gap-2 text-sm">
            {isSectionOpen(tank.id, "txns") ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            <span className="font-medium">Transaction History ({transactions.length})</span>
          </div>
        </button>
        {isSectionOpen(tank.id, "txns") && (
          <div className="overflow-x-auto">
            {transactions.length === 0 ? (
              <p className="px-4 py-3 text-sm text-muted-foreground">No transactions recorded</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/5">
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Bull</TableHead>
                    <TableHead className="text-right">Units</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.slice(0, 20).map((txn) => (
                    <TableRow key={txn.id}>
                      <TableCell className="text-sm">
                        {format(new Date(txn.created_at), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell className="text-sm capitalize">
                        {(txn.transaction_type || "").replace(/_/g, " ")}
                      </TableCell>
                      <TableCell className="text-sm">
                        {getBullDisplayLabel(txn)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right text-sm font-medium",
                          txn.units_change > 0 ? "text-primary" : "text-destructive"
                        )}
                      >
                        {txn.units_change > 0 ? "+" : ""}
                        {txn.units_change}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {transactions.length > 20 && (
              <div className="px-4 py-2">
                <Link to={`/tanks/${tank.id}`} className="text-xs text-primary hover:underline">
                  View all on tank page →
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
