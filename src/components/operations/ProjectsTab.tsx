import { useState, useEffect, useCallback, useMemo } from "react";
import { format, parseISO, differenceInDays } from "date-fns";
import { Beef, Calendar, Plus, FileSpreadsheet, ClipboardList } from "lucide-react";
import { useNavigate } from "react-router-dom";

import StatCard from "@/components/StatCard";
import ProjectsTable from "@/components/ProjectsTable";
import BulkActionToolbar from "@/components/BulkActionToolbar";
import NewProjectDialog from "@/components/NewProjectDialog";
import BullsSummaryDialog from "@/components/BullsSummaryDialog";
import { supabase } from "@/integrations/supabase/client";
import { BreedingProject } from "@/types/project";
import { useOrgRole } from "@/hooks/useOrgRole";
import { Button } from "@/components/ui/button";
import PackingTab from "@/components/inventory/PackingTab";
import { cn } from "@/lib/utils";
import { getBullDisplayName } from "@/lib/bullDisplay";

interface DbProject {
  id: string;
  name: string;
  cattle_type: string;
  protocol: string;
  head_count: number;
  breeding_date: string | null;
  breeding_time: string | null;
  status: string;
  user_id: string | null;
  last_contacted_date: string | null;
}

const ProjectsTab = ({ orgId }: { orgId: string }) => {
  const navigate = useNavigate();
  const { userId, role: myRole } = useOrgRole();
  const [projects, setProjects] = useState<BreedingProject[]>([]);
  const [dbProjects, setDbProjects] = useState<DbProject[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [bullsDialogOpen, setBullsDialogOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [subView, setSubView] = useState<"projects" | "packs">("projects");

  const [bullsByProject, setBullsByProject] = useState<Record<string, { name: string; units: number; registrationNumber?: string; breed?: string }[]>>({});
  const [syncedProjectIds, setSyncedProjectIds] = useState<Set<string>>(new Set());
  const [packedProjectIds, setPackedProjectIds] = useState<Set<string>>(new Set());

  const fetchProjects = useCallback(async () => {
    const { data } = await supabase
      .from("projects")
      .select("*, customers!projects_customer_id_fkey(name)")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false });

    if (data) {
      setDbProjects(data as DbProject[]);
      const mapped: BreedingProject[] = (data || []).map((p) => ({
        id: p.id,
        name: p.name,
        animalType: p.cattle_type === "Cows" ? "Cow" : "Heifer",
        protocol: p.protocol,
        headCount: p.head_count,
        startDate: "",
        breedDate: p.breeding_date ?? "",
        status: p.status as any,
        location: "",
        userId: p.user_id,
        lastContactedDate: p.last_contacted_date ?? null,
        customerId: p.customer_id ?? null,
        customerName: p.customers?.name ?? null,
      }));
      setProjects(mapped);

      const projectIds = data.map((p) => p.id);
      const earliestDateMap: Record<string, string> = {};
      if (projectIds.length > 0) {
        const { data: eventsData } = await supabase
          .from("protocol_events")
          .select("project_id, event_date")
          .in("project_id", projectIds)
          .order("event_date", { ascending: true });

        if (eventsData) {
          for (const ev of eventsData) {
            if (!earliestDateMap[ev.project_id]) {
              earliestDateMap[ev.project_id] = ev.event_date;
            }
          }
        }
      }

      setProjects((prev) =>
        prev.map((p) => ({
          ...p,
          startDate: earliestDateMap[p.id] || p.startDate,
        }))
      );

      if (projectIds.length > 0) {
        const { data: bullsData } = await supabase
          .from("project_bulls")
          .select("project_id, units, custom_bull_name, bull_catalog_id, bulls_catalog(bull_name, registration_number, breed)")
          .in("project_id", projectIds);

        if (bullsData) {
          const map: Record<string, { name: string; units: number; registrationNumber?: string; breed?: string }[]> = {};
          for (const b of bullsData) {
            const pid = b.project_id;
            if (!map[pid]) map[pid] = [];
            const name = getBullDisplayName(b);
            const regNum = b.bulls_catalog?.registration_number || undefined;
            const breed = b.bulls_catalog?.breed || undefined;
            map[pid].push({ name, units: b.units, registrationNumber: regNum, breed });
          }
          setBullsByProject(map);
        }

        const { data: syncData } = await supabase
          .from("google_calendar_events")
          .select("project_id")
          .in("project_id", projectIds);

        if (syncData) {
          setSyncedProjectIds(new Set(syncData.map((r) => r.project_id)));
        }

        // Which projects have an active pack (not cancelled/unpacked/returned)?
        const { data: packData } = await supabase
          .from("tank_pack_projects")
          .select("project_id, tank_packs!inner(status)")
          .in("project_id", projectIds);
        if (packData) {
          const ids = new Set<string>();
          for (const r of packData as any[]) {
            const status = r.tank_packs?.status;
            if (!status) continue;
            if (["cancelled", "unpacked", "tank_returned"].includes(status)) continue;
            ids.add(r.project_id);
          }
          setPackedProjectIds(ids);
        }
      }
    }
  }, [orgId]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const selectedProjects = dbProjects
    .filter((p) => selectedIds.has(p.id))
    .map((p) => ({
      id: p.id,
      name: p.name,
      cattleType: p.cattle_type,
      protocol: p.protocol,
      breedingTime: p.breeding_time,
    }));

  const totalProjects = projects.length;
  const totalHead = projects.reduce((sum, p) => sum + p.headCount, 0);
  const heiferProjects = projects.filter((p) => p.animalType === "Heifer");
  const cowProjects = projects.filter((p) => p.animalType === "Cow");
  const heiferHead = heiferProjects.reduce((s, p) => s + p.headCount, 0);
  const cowHead = cowProjects.reduce((s, p) => s + p.headCount, 0);

  const bullStats = useMemo(() => {
    const names = new Set<string>();
    let totalUnits = 0;
    for (const bulls of Object.values(bullsByProject)) {
      for (const b of bulls) {
        names.add(b.name);
        totalUnits += b.units;
      }
    }
    return { distinct: names.size, catalogCount: names.size, totalUnits };
  }, [bullsByProject]);

  const breedingSeason = useMemo(() => {
    const dates = dbProjects
      .map((p) => p.breeding_date)
      .filter((d): d is string => !!d)
      .sort();
    if (dates.length === 0) return null;
    const first = dates[0];
    const last = dates[dates.length - 1];
    const same = first === last;
    const span = same ? 1 : differenceInDays(parseISO(last), parseISO(first));
    return { first, last, same, span };
  }, [dbProjects]);

  const handleExportCsv = () => {
    const headers = ["Project Name", "Type", "Protocol", "Head Count", "Breeding Date", "Status", "Last Contacted", "Bulls"];
    const csvRows = [headers.join(",")];
    for (const p of projects) {
      const bulls = (bullsByProject[p.id] || []).map((b) => `${b.name} (${b.units})`).join("; ");
      csvRows.push([
        `"${p.name}"`,
        `"${p.animalType}"`,
        `"${p.protocol}"`,
        p.headCount,
        `"${p.breedDate || ""}"`,
        `"${p.status}"`,
        `"${p.lastContactedDate || ""}"`,
        `"${bulls}"`,
      ].join(","));
    }
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `BeefSynch_Projects_${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold font-display">Projects</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" className="gap-2" onClick={() => navigate("/planning")}>
            <ClipboardList className="h-4 w-4" /> Planning
          </Button>
          <Button variant="outline" size="sm" className="gap-2" onClick={handleExportCsv}>
            <FileSpreadsheet className="h-4 w-4" /> Export CSV
          </Button>
          {subView === "projects" && (
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" /> New Project
            </Button>
          )}
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setSubView("projects")}
          className={cn(
            "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
            subView === "projects"
              ? "bg-primary text-primary-foreground"
              : "bg-card/60 text-muted-foreground hover:text-foreground hover:bg-secondary/60 border border-border/40"
          )}
        >
          All Projects
        </button>
        <button
          onClick={() => setSubView("packs")}
          className={cn(
            "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
            subView === "packs"
              ? "bg-primary text-primary-foreground"
              : "bg-card/60 text-muted-foreground hover:text-foreground hover:bg-secondary/60 border border-border/40"
          )}
        >
          Packs
        </button>
      </div>

      {subView === "packs" ? (
        <PackingTab orgId={orgId} />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Projects"
          value={totalProjects}
          delay={0}
          index={0}
          breakdown={<>
            <p className="flex justify-between">Heifers <span style={{ color: "#5de8d0" }}>{heiferProjects.length} projects</span></p>
            <p className="flex justify-between">Cows <span style={{ color: "#5de8d0" }}>{cowProjects.length} projects</span></p>
          </>}
        />
        <StatCard
          title="Total Head"
          value={totalHead}
          delay={100}
          index={1}
          breakdown={<>
            <p className="flex justify-between">Heifers <span style={{ color: "#5de8d0" }}>{heiferHead} head</span></p>
            <p className="flex justify-between">Cows <span style={{ color: "#5de8d0" }}>{cowHead} head</span></p>
          </>}
        />
        <StatCard
          title="Bulls in Use"
          value={bullStats.distinct}
          delay={200}
          index={2}
          icon={Beef}
          onClick={() => setBullsDialogOpen(true)}
          breakdown={<>
            <p className="flex justify-between">Catalog Bulls <span style={{ color: "#5de8d0" }}>{bullStats.catalogCount}</span></p>
            <p className="flex justify-between">Total Units <span style={{ color: "#5de8d0" }}>{bullStats.totalUnits}</span></p>
          </>}
        />
        <StatCard
          title="Breeding Season"
          value={breedingSeason ? `${breedingSeason.span} day${breedingSeason.span !== 1 ? "s" : ""}` : "—"}
          delay={300}
          index={3}
          icon={Calendar}
          breakdown={breedingSeason ? (
            breedingSeason.same ? (
              <p className="flex justify-between">Date <span style={{ color: "#5de8d0" }}>{format(parseISO(breedingSeason.first), "MMM d, yyyy")}</span></p>
            ) : (<>
              <p className="flex justify-between">First <span style={{ color: "#5de8d0" }}>{format(parseISO(breedingSeason.first), "MMM d, yyyy")}</span></p>
              <p className="flex justify-between">Last <span style={{ color: "#5de8d0" }}>{format(parseISO(breedingSeason.last), "MMM d, yyyy")}</span></p>
            </>)
          ) : undefined}
        />
      </div>

      {selectedProjects.length > 0 && (
        <BulkActionToolbar
          selectedProjects={selectedProjects}
          onClear={() => setSelectedIds(new Set())}
          onComplete={() => {
            setSelectedIds(new Set());
            fetchProjects();
          }}
          canDelete={true}
        />
      )}

      <ProjectsTable
        projects={projects}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        bullsByProject={bullsByProject}
        syncedProjectIds={syncedProjectIds}
        packedProjectIds={packedProjectIds}
        canEditAll={myRole === "owner" || myRole === "admin"}
        currentUserId={userId}
      />

      <NewProjectDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onProjectCreated={fetchProjects}
      />
      <BullsSummaryDialog
        open={bullsDialogOpen}
        onOpenChange={setBullsDialogOpen}
        bullsByProject={bullsByProject}
        projects={projects.map((p) => ({ id: p.id, name: p.name }))}
      />
        </>
      )}
    </div>
  );
};

export default ProjectsTab;
