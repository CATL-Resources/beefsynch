import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { BreedingProject } from "@/types/project";
import { ArrowUpDown, Search, Filter, CalendarCheck, PackageCheck } from "lucide-react";
import ClickableRegNumber from "@/components/ClickableRegNumber";
import { format, parseISO } from "date-fns";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getBadgeClass } from "@/lib/badgeStyles";

interface ProjectsTableProps {
  projects: BreedingProject[];
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
  bullsByProject?: Record<string, { name: string; units: number; registrationNumber?: string; breed?: string }[]>;
  syncedProjectIds?: Set<string>;
  packedProjectIds?: Set<string>;
  canEditAll?: boolean;
  currentUserId?: string | null;
}

type SortKey = keyof BreedingProject;
type SortDir = "asc" | "desc";

// calendar-sync indicator v4
const ProjectsTable = ({ projects, selectedIds, onSelectionChange, bullsByProject = {}, syncedProjectIds = new Set(), packedProjectIds = new Set(), canEditAll = false, currentUserId = null }: ProjectsTableProps) => {
  const navigate = useNavigate();

  const canSelectProject = (_project: BreedingProject) => {
    return true;
  };
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("All");
  const [filterStatus, setFilterStatus] = useState<string>("All");
  const [sortKey, setSortKey] = useState<SortKey>("breedDate");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [expandedBulls, setExpandedBulls] = useState<Set<string>>(new Set());

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const filtered = useMemo(() => {
    let list = projects;
    if (filterType !== "All") {
      list = list.filter((p) => p.animalType === filterType);
    }
    if (filterStatus !== "All") {
      list = list.filter((p) => p.status === filterStatus);
    }
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(s) ||
          p.protocol.toLowerCase().includes(s)
      );
    }
    return [...list].sort((a, b) => {
      // Complete projects always sort to the bottom
      const aComplete = (a.status === "Work Complete" || a.status === "Invoiced") ? 1 : 0;
      const bComplete = (b.status === "Work Complete" || b.status === "Invoiced") ? 1 : 0;
      if (aComplete !== bComplete) return aComplete - bComplete;

      // Within the same group, sort by active column
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (sortKey === "lastContactedDate") {
        const aStr = (aVal as string) || "";
        const bStr = (bVal as string) || "";
        if (!aStr && !bStr) return 0;
        if (!aStr) return sortDir === "asc" ? -1 : 1;
        if (!bStr) return sortDir === "asc" ? 1 : -1;
        return sortDir === "asc" ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
      }
      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortDir === "asc" ? aVal - bVal : bVal - aVal;
      }
      return sortDir === "asc"
        ? String(aVal).localeCompare(String(bVal))
        : String(bVal).localeCompare(String(aVal));
    });
  }, [projects, search, filterType, filterStatus, sortKey, sortDir]);

  const filteredIds = useMemo(() => new Set(filtered.map((p) => p.id)), [filtered]);
  const selectableFiltered = useMemo(() => filtered.filter(canSelectProject), [filtered, canEditAll, currentUserId]);
  const allVisibleSelected = selectableFiltered.length > 0 && selectableFiltered.every((p) => selectedIds.has(p.id));

  const toggleAll = () => {
    if (allVisibleSelected) {
      const next = new Set(selectedIds);
      selectableFiltered.forEach((p) => next.delete(p.id));
      onSelectionChange(next);
    } else {
      const next = new Set(selectedIds);
      selectableFiltered.forEach((p) => next.add(p.id));
      onSelectionChange(next);
    }
  };

  const toggleOne = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectionChange(next);
  };

  const renderBulls = (projectId: string) => {
    const bulls = bullsByProject[projectId] || [];
    if (bulls.length === 0) return <span className="text-muted-foreground">—</span>;
    const isExpanded = expandedBulls.has(projectId);
    const visible = isExpanded ? bulls : bulls.slice(0, 2);
    const remaining = bulls.length - 2;
    return (
      <div className="space-y-0.5">
        {visible.map((b, i) => (
          <div key={i} className="text-xs text-foreground whitespace-nowrap flex items-center gap-1">
            <span>{b.name} ({b.units} units)</span>
            {b.registrationNumber && (
              <ClickableRegNumber registrationNumber={b.registrationNumber} breed={b.breed} />
            )}
          </div>
        ))}
        {!isExpanded && remaining > 0 && (
          <button
            onClick={(e) => { e.stopPropagation(); setExpandedBulls((prev) => new Set(prev).add(projectId)); }}
            className="text-xs text-primary hover:underline"
          >
            +{remaining} more
          </button>
        )}
        {isExpanded && bulls.length > 2 && (
          <button
            onClick={(e) => { e.stopPropagation(); setExpandedBulls((prev) => { const n = new Set(prev); n.delete(projectId); return n; }); }}
            className="text-xs text-primary hover:underline"
          >
            Show less
          </button>
        )}
      </div>
    );
  };

  const columns: { key: SortKey; label: string }[] = [
    { key: "name", label: "Project" },
    { key: "animalType", label: "Animal" },
    { key: "breedDate", label: "Schedule" },
    { key: "status", label: "Status" },
  ];

  return (
    <div className="rounded-lg border border-border bg-card opacity-0 animate-fade-in" style={{ animationDelay: "400ms", background: "var(--gradient-card)" }}>
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between border-b border-border">
        <h2 className="text-lg font-semibold font-display text-foreground">Breeding Projects</h2>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 w-full sm:w-auto">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search projects..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-full rounded-md border border-border bg-secondary pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="flex items-center gap-1 rounded-md border border-border bg-secondary p-0.5">
            <Filter className="ml-2 h-4 w-4 text-muted-foreground" />
            {["All", "Heifer", "Cow"].map((t) => (
              <button
                key={t}
                onClick={() => setFilterType(t)}
                className={`rounded px-3 py-1 text-sm font-medium transition-colors ${
                  filterType === t
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 rounded-md border border-border bg-secondary p-0.5">
            {["All", "Tentative", "Confirmed", "Work Complete", "Invoiced"].map((s) => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={`rounded px-3 py-1 text-sm font-medium transition-colors ${
                  filterStatus === s
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Desktop table ── */}
      <div className="hidden xl:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-4 py-3 w-10">
                <Checkbox
                  checked={allVisibleSelected}
                  onCheckedChange={toggleAll}
                  aria-label="Select all"
                />
              </th>
              {columns.map((col) => (
                <th
                  key={col.key}
                  onClick={() => toggleSort(col.key)}
                  className="cursor-pointer px-4 py-3 text-left font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    <ArrowUpDown className="h-3 w-3" />
                  </span>
                </th>
              ))}
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                Bulls &amp; Units
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((project) => (
              <tr
                key={project.id}
                onClick={() => navigate(`/project/${project.id}`)}
                className="border-b border-border/50 hover:bg-secondary/50 transition-colors cursor-pointer"
              >
                {/* Checkbox */}
                <td className="px-4 py-3 align-top" onClick={(e) => e.stopPropagation()}>
                  {canSelectProject(project) ? (
                    <Checkbox
                      checked={selectedIds.has(project.id)}
                      onCheckedChange={() => toggleOne(project.id)}
                      aria-label={`Select ${project.name}`}
                    />
                  ) : <div className="w-4" />}
                </td>
                {/* Project — name (bold) + protocol (muted) */}
                <td className="px-4 py-3 align-top">
                  <div className="font-medium text-foreground inline-flex items-center gap-1.5">
                    {project.name}
                    {syncedProjectIds.has(project.id) && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <CalendarCheck className="h-3.5 w-3.5 text-primary shrink-0" />
                          </TooltipTrigger>
                          <TooltipContent>Synced to Google Calendar</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                    {packedProjectIds.has(project.id) && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <PackageCheck className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                          </TooltipTrigger>
                          <TooltipContent>Tank already packed</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground truncate" title={project.customerName || ""}>
                    {project.customerName || "—"}
                  </div>
                </td>
                {/* Animal — type badge + head count */}
                <td className="px-4 py-3 align-top">
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${getBadgeClass('projectType', project.animalType)}`}>
                    {project.animalType}
                  </span>
                  <div className="text-xs text-muted-foreground mt-1">
                    {project.headCount} head
                  </div>
                </td>
                {/* Schedule — breed date (bold) + start date (muted) */}
                <td className="px-4 py-3 align-top">
                  <div className="text-foreground whitespace-nowrap">
                    {project.breedDate ? format(parseISO(project.breedDate), "MMM d, yyyy") : "—"}
                  </div>
                  <div className="text-xs text-muted-foreground whitespace-nowrap">
                    Start: {project.startDate ? format(parseISO(project.startDate), "MMM d") : "—"}
                  </div>
                </td>
                {/* Status — badge + last contact (muted) */}
                <td className="px-4 py-3 align-top">
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${getBadgeClass('projectStatus', project.status)}`}>
                    {project.status}
                  </span>
                  <div className="text-xs text-muted-foreground mt-1 whitespace-nowrap">
                    {project.lastContactedDate ? `Contacted ${format(parseISO(project.lastContactedDate), "MMM d")}` : "Not contacted"}
                  </div>
                </td>
                {/* Bulls & Units — unchanged */}
                <td className="px-4 py-3 align-top">{renderBulls(project.id)}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  No projects found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Card view (primary) ── */}
      <div className="xl:hidden divide-y divide-border">
        {filtered.map((project) => {
          const bulls = bullsByProject[project.id] || [];
          return (
            <div
              key={project.id}
              onClick={() => navigate(`/project/${project.id}`)}
              className="p-4 space-y-3 hover:bg-secondary/50 transition-colors cursor-pointer active:bg-secondary/70"
            >
              {/* Row 1: Checkbox + Name + Head Count */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div className="pt-0.5" onClick={(e) => e.stopPropagation()}>
                    {canSelectProject(project) ? (
                      <Checkbox
                        checked={selectedIds.has(project.id)}
                        onCheckedChange={() => toggleOne(project.id)}
                        aria-label={`Select ${project.name}`}
                      />
                    ) : <div className="w-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-foreground truncate inline-flex items-center gap-1.5">
                      {project.name}
                      {syncedProjectIds.has(project.id) && (
                        <CalendarCheck className="h-3.5 w-3.5 text-primary shrink-0" />
                      )}
                      {packedProjectIds.has(project.id) && (
                        <PackageCheck className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${getBadgeClass('projectType', project.animalType)}`}>
                        {project.animalType}
                      </span>
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${getBadgeClass('projectStatus', project.status)}`}>
                        {project.status}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-lg font-bold tabular-nums leading-none">{project.headCount}</div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">head</div>
                </div>
              </div>

              {/* Row 2: Key details */}
              <div className="grid grid-cols-[80px_1fr] gap-x-3 gap-y-1.5 text-sm pl-7">
                <div className="text-xs text-muted-foreground uppercase tracking-wide">Customer</div>
                <div className="truncate">{project.customerName || "—"}</div>
                <div className="text-xs text-muted-foreground uppercase tracking-wide">Protocol</div>
                <div className="truncate">{project.protocol}</div>
                <div className="text-xs text-muted-foreground uppercase tracking-wide">Breed</div>
                <div>{project.breedDate ? format(parseISO(project.breedDate), "MMM d, yyyy") : "—"}</div>
                <div className="text-xs text-muted-foreground uppercase tracking-wide">Start</div>
                <div>{project.startDate ? format(parseISO(project.startDate), "MMM d, yyyy") : "—"}</div>
                <div className="text-xs text-muted-foreground uppercase tracking-wide">Contact</div>
                <div>{project.lastContactedDate ? format(parseISO(project.lastContactedDate), "MMM d") : "—"}</div>
              </div>

              {/* Row 3: Bulls */}
              {bulls.length > 0 && (
                <div className="pl-7">
                  {renderBulls(project.id)}
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="px-4 py-8 text-center text-muted-foreground text-sm">
            No projects found.
          </div>
        )}
      </div>
    </div>
  );
};

export default ProjectsTable;
