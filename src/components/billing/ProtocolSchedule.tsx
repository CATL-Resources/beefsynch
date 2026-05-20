import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface ProtocolScheduleProps {
  projectId: string;
  billingId: string;
}

type EventRow = {
  id: string;
  event_name: string;
  event_date: string | null;
  event_time: string | null;
};

type LaborRow = {
  id: string;
  description: string | null;
  labor_dates: string | null;
  sort_order: number | null;
};

const EXCLUDED = new Set(["Return Heat", "Estimated Calving"]);

export default function ProtocolSchedule({ projectId, billingId }: ProtocolScheduleProps) {
  const queryClient = useQueryClient();

  const { data: events = [], isLoading } = useQuery({
    queryKey: ["protocol_events", projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("protocol_events")
        .select("id, event_name, event_date, event_time")
        .eq("project_id", projectId)
        .order("event_date");
      if (error) throw error;
      return (data ?? []) as EventRow[];
    },
  });

  const { data: labor = [] } = useQuery({
    queryKey: ["billing_labor_v2", billingId],
    enabled: !!billingId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_billing_labor")
        .select("id, description, labor_dates, sort_order")
        .eq("billing_id", billingId)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as LaborRow[];
    },
  });

  const { data: billing } = useQuery({
    queryKey: ["billing_notes_v2", billingId],
    enabled: !!billingId,
    queryFn: async () => {
      const { data } = await supabase
        .from("project_billing")
        .select("notes")
        .eq("id", billingId)
        .maybeSingle();
      return data;
    },
  });

  const visible = events.filter((e) => !EXCLUDED.has((e.event_name || "").trim()));

  const saveDate = async (id: string, prev: string | null, next: string) => {
    if (!next) return;
    const year = parseInt(next.split("-")[0], 10);
    if (isNaN(year) || year < 2020 || year > 2099) return;
    if (next === prev) return;
    const { error } = await supabase
      .from("protocol_events")
      .update({ event_date: next })
      .eq("id", id);
    if (error) {
      toast({ title: "Error saving date", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Date saved" });
    queryClient.invalidateQueries({ queryKey: ["protocol_events", projectId] });
  };

  const refetchLabor = () => queryClient.invalidateQueries({ queryKey: ["billing_labor_v2", billingId] });
  const refetchNotes = () => queryClient.invalidateQueries({ queryKey: ["billing_notes_v2", billingId] });

  const saveLabor = async (id: string, patch: Partial<LaborRow>) => {
    const { error } = await supabase.from("project_billing_labor").update(patch).eq("id", id);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Labor saved" });
    refetchLabor();
  };

  const addLabor = async () => {
    const { error } = await supabase.from("project_billing_labor").insert({
      billing_id: billingId,
      description: "",
      labor_dates: "",
      sort_order: labor.length,
    });
    if (error) {
      toast({ title: "Could not add", description: error.message, variant: "destructive" });
      return;
    }
    refetchLabor();
  };

  const removeLabor = async (id: string) => {
    await supabase.from("project_billing_labor").delete().eq("id", id);
    refetchLabor();
  };

  const saveNotes = async (val: string) => {
    const { error } = await supabase
      .from("project_billing")
      .update({ notes: val || null })
      .eq("id", billingId);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Notes saved" });
    refetchNotes();
  };

  return (
    <section className="rounded-xl border border-border bg-card/50 p-4 space-y-4">
      <h2 className="text-base font-bold tracking-tight uppercase text-muted-foreground">Protocol &amp; Labor</h2>

      <div className="rounded-lg border border-border/60 overflow-hidden">
        <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
          <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2 font-medium w-[160px]">Date</th>
              <th className="text-left px-3 py-2 font-medium">Event</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={2} className="px-3 py-4 text-center text-muted-foreground">Loading…</td></tr>
            ) : visible.length === 0 ? (
              <tr><td colSpan={2} className="px-3 py-4 text-center text-muted-foreground">No protocol events.</td></tr>
            ) : visible.map((e) => (
              <tr key={e.id} className="border-t border-border/40">
                <td className="px-3 py-2">
                  <Input
                    type="date"
                    className="h-7 w-[140px] text-sm"
                    defaultValue={e.event_date ?? ""}
                    onBlur={(ev) => saveDate(e.id, e.event_date, ev.target.value)}
                  />
                </td>
                <td className="px-3 py-2 font-medium">
                  {e.event_name}
                  {e.event_date && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {format(parseISO(e.event_date), "EEE")}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Labor</h3>
        {labor.map((l) => (
          <div key={l.id} className="flex items-start gap-2">
            <Input
              className="h-8 w-[180px] text-sm"
              defaultValue={l.labor_dates ?? ""}
              placeholder="Dates"
              onBlur={(ev) => {
                const v = ev.target.value || null;
                if (v === l.labor_dates) return;
                saveLabor(l.id, { labor_dates: v });
              }}
            />
            <Input
              className="h-8 flex-1 text-sm"
              defaultValue={l.description ?? ""}
              placeholder="What work did we do?"
              onBlur={(ev) => {
                const v = ev.target.value || null;
                if (v === l.description) return;
                saveLabor(l.id, { description: v });
              }}
            />
            <button
              type="button"
              onClick={() => removeLabor(l.id)}
              className="text-muted-foreground hover:text-destructive mt-1.5"
              aria-label="Remove labor"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={addLabor}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add labor note
        </Button>
      </div>

      <div className="space-y-1">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notes</h3>
        <Textarea
          className="min-h-[80px] text-sm"
          defaultValue={billing?.notes ?? ""}
          placeholder="Add notes..."
          onBlur={(e) => {
            if ((e.target.value || "") === (billing?.notes || "")) return;
            saveNotes(e.target.value);
          }}
        />
      </div>
    </section>
  );
}
