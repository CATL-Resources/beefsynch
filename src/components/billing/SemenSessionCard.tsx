import { format, parseISO } from "date-fns";
import { Input } from "@/components/ui/input";

export type InventoryRow = {
  id: string;
  bull_name: string;
  bull_code: string | null;
  bull_catalog_id: string | null;
  canister: string;
  start_units: number | null;
  end_units: number | null;
  blown_units: number | null;
};

interface SemenSessionCardProps {
  sessionId: string;
  index: number;
  date: string | null;
  headCount: number | null;
  rows: InventoryRow[];
  onSessionField: (id: string, field: "session_date" | "head_count", value: any) => void;
  onCellChange: (rowId: string, field: "start_units" | "end_units" | "blown_units", value: number | null) => void;
}

export default function SemenSessionCard({
  sessionId, index, date, headCount, rows,
  onSessionField, onCellChange,
}: SemenSessionCardProps) {
  return (
    <div className="rounded-lg border border-border/60 overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-3 py-2 bg-muted/40 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold">S{index + 1}</span>
          <span className="text-sm text-muted-foreground">—</span>
          <Input
            type="date"
            className="h-7 w-[140px] text-sm"
            defaultValue={date ?? ""}
            onBlur={(e) => {
              const v = e.target.value;
              if (!v) return;
              const year = parseInt(v.split("-")[0], 10);
              if (isNaN(year) || year < 2020 || year > 2099) return;
              if (v === date) return;
              onSessionField(sessionId, "session_date", v);
            }}
          />
          {date && (
            <span className="text-xs text-muted-foreground">
              {format(parseISO(date), "EEE")}
            </span>
          )}
        </div>
        <label className="text-xs text-muted-foreground inline-flex items-center gap-2">
          Head
          <Input
            inputMode="numeric"
            className="h-7 w-[64px] text-right text-xs"
            defaultValue={headCount ?? ""}
            placeholder="—"
            onBlur={(e) => {
              const v = e.target.value === "" ? null : Number(e.target.value);
              if (v === headCount) return;
              onSessionField(sessionId, "head_count", v);
            }}
          />
        </label>
      </div>
      <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
        <thead className="bg-muted/20 text-[11px] uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="text-left px-3 py-1.5 font-medium">Bull</th>
            <th className="text-left px-3 py-1.5 font-medium w-[90px]">NAAB</th>
            <th className="text-left px-3 py-1.5 font-medium w-[70px]">Can.</th>
            <th className="text-right px-3 py-1.5 font-medium w-[80px]">Start</th>
            <th className="text-right px-3 py-1.5 font-medium w-[80px]">End</th>
            <th className="text-right px-3 py-1.5 font-medium w-[80px]">Used</th>
            <th className="text-right px-3 py-1.5 font-medium w-[80px]">Blown</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={7} className="px-3 py-3 text-center text-muted-foreground">No bulls in this session.</td></tr>
          ) : rows.map((r) => {
            const used =
              r.start_units != null && r.end_units != null
                ? r.start_units - r.end_units
                : null;
            return (
              <tr key={r.id} className="border-t border-border/40">
                <td className="px-3 py-1.5 truncate">{r.bull_name}</td>
                <td className="px-3 py-1.5 text-xs text-muted-foreground">{r.bull_code || "—"}</td>
                <td className="px-3 py-1.5">{r.canister}</td>
                <td className="px-3 py-1.5 text-right">
                  <Input
                    inputMode="numeric"
                    className="h-6 w-[64px] text-right text-xs ml-auto"
                    defaultValue={r.start_units ?? ""}
                    placeholder="—"
                    onBlur={(e) => {
                      const v = e.target.value === "" ? null : Number(e.target.value);
                      if (v === r.start_units) return;
                      onCellChange(r.id, "start_units", v);
                    }}
                  />
                </td>
                <td className="px-3 py-1.5 text-right">
                  <Input
                    inputMode="numeric"
                    className="h-6 w-[64px] text-right text-xs ml-auto"
                    defaultValue={r.end_units ?? ""}
                    placeholder="—"
                    onBlur={(e) => {
                      const v = e.target.value === "" ? null : Number(e.target.value);
                      if (v === r.end_units) return;
                      onCellChange(r.id, "end_units", v);
                    }}
                  />
                </td>
                <td className="px-3 py-1.5 text-right italic text-muted-foreground tabular-nums">
                  {used != null && used !== 0 ? used : "—"}
                </td>
                <td className="px-3 py-1.5 text-right">
                  <Input
                    inputMode="numeric"
                    className="h-6 w-[64px] text-right text-xs ml-auto"
                    defaultValue={r.blown_units ?? ""}
                    placeholder="—"
                    onBlur={(e) => {
                      const v = e.target.value === "" ? null : Number(e.target.value);
                      if (v === r.blown_units) return;
                      onCellChange(r.id, "blown_units", v);
                    }}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
