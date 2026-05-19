import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface ProtocolScheduleProps {
  projectId: string;
}

type EventRow = {
  id: string;
  event_name: string;
  event_date: string | null;
  event_time: string | null;
};

const EXCLUDED = new Set(["Return Heat", "Estimated Calving"]);

export default function ProtocolSchedule({ projectId }: ProtocolScheduleProps) {
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

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Protocol schedule</h2>
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
    </section>
  );
}
