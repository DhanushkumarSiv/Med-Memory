import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Line, LineChart, ResponsiveContainer } from "recharts";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import CodeBlock from "../components/ui/CodeBlock";
import Spinner from "../components/ui/Spinner";
import PageWrapper from "../components/layout/PageWrapper";
import { useAgentPipeline } from "../hooks/useAgentPipeline";
import { useAuth } from "../hooks/useAuth";
import { usePatient } from "../hooks/usePatient";
import { FhirSummaryItem } from "../types/fhir";

type TimelineFilter = "all" | "condition" | "lab" | "medication" | "allergy";
type MetricPoint = { label: string; value: number };

interface TimelineEnrichedItem extends FhirSummaryItem {
  timestamp: number;
  monthKey: string;
}

interface LabFindingItem {
  label: string;
  value: string;
}

function severityWeight(severity: string): number {
  switch (severity) {
    case "critical":
      return 4;
    case "high":
      return 3;
    case "medium":
      return 2;
    default:
      return 1;
  }
}

function getInitials(name: string): string {
  const parts = name.split(" ").map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) {
    return "DR";
  }
  if (parts.length === 1) {
    return parts[0]?.slice(0, 2).toUpperCase() ?? "DR";
  }
  const first = parts[0]?.charAt(0) ?? "";
  const second = parts[1]?.charAt(0) ?? "";
  return `${first}${second}`.toUpperCase();
}

function formatMonthYear(dateIso: string): string {
  return new Date(dateIso).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function normalizeTimelineType(item: FhirSummaryItem): TimelineFilter {
  const type = item.type.toLowerCase();
  if (type.includes("condition")) {
    return "condition";
  }
  if (type.includes("medication")) {
    return "medication";
  }
  if (type.includes("allergy")) {
    return "allergy";
  }
  if (type.includes("lab")) {
    return "lab";
  }
  return "all";
}

function parseNumber(value: string): number | null {
  const match = value.match(/-?\d+(\.\d+)?/);
  if (!match?.[0]) {
    return null;
  }
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function deriveMetricPoints(items: FhirSummaryItem[] | undefined, metric: "bp" | "hba1c" | "egfr"): MetricPoint[] {
  const source = items ?? [];
  const filtered = source
    .filter((item) => item.type.toLowerCase().includes("lab"))
    .filter((item) => {
      const title = item.title.toLowerCase();
      if (metric === "bp") {
        return title.includes("blood pressure");
      }
      if (metric === "hba1c") {
        return title.includes("hba1c");
      }
      return title.includes("egfr");
    })
    .map((item) => {
      const label = new Date(item.date).toLocaleDateString(undefined, { month: "short", year: "2-digit" });
      let value: number | null = null;
      if (metric === "bp") {
        const systolic = item.details.split("/")[0] ?? "";
        value = parseNumber(systolic);
      } else {
        value = parseNumber(item.details);
      }
      return { label, value };
    })
    .filter((point): point is { label: string; value: number } => point.value !== null)
    .slice(-8);

  if (filtered.length > 0) {
    return filtered;
  }
  return [{ label: "No Data", value: 0 }];
}

function confidencePercent(confidence: string): number {
  const normalized = confidence.toLowerCase();
  if (normalized === "high") {
    return 90;
  }
  if (normalized === "medium") {
    return 65;
  }
  if (normalized === "processing") {
    return 35;
  }
  return 30;
}

function timelineIcon(type: TimelineFilter): { icon: string; badgeTone: "default" | "warning" | "info" | "success" | "critical" } {
  if (type === "medication") {
    return { icon: "💊", badgeTone: "info" };
  }
  if (type === "lab") {
    return { icon: "🧪", badgeTone: "success" };
  }
  if (type === "allergy") {
    return { icon: "⚠️", badgeTone: "critical" };
  }
  if (type === "condition") {
    return { icon: "🏥", badgeTone: "warning" };
  }
  return { icon: "📄", badgeTone: "default" };
}

function parseRecentLabFindings(text: string): LabFindingItem[] {
  const trimmed = text.trim();
  if (!trimmed || !/^recent labs:/i.test(trimmed)) {
    return [];
  }

  const body = trimmed.replace(/^recent labs:\s*/i, "");
  return body
    .split(";")
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .map((item) => {
      const separator = item.indexOf(":");
      if (separator < 0) {
        return { label: "Result", value: item };
      }
      return {
        label: item.slice(0, separator).trim(),
        value: item.slice(separator + 1).trim(),
      };
    });
}

function Sparkline({ title, points, color }: { title: string; points: MetricPoint[]; color: string }): JSX.Element {
  const latest = points.length > 0 ? points[points.length - 1] : null;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-500">{title}</p>
        <p className="text-sm font-bold text-slate-900">{latest?.value ?? "--"}</p>
      </div>
      <div className="h-14">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points}>
            <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default function ClinicianDashboard(): JSX.Element {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const autoQuery = searchParams.get("autquery");

  const { user, clearSession } = useAuth();
  const patientId = user?.patientId ?? null;
  const { patient, summary, loading: patientLoading } = usePatient(patientId);
  const { pipeline, loading, loadingStep, ragLoading, ragResponse, runPipeline, runQuery } = useAgentPipeline(patientId);

  const [query, setQuery] = useState("");
  const [timelineFilter, setTimelineFilter] = useState<TimelineFilter>("all");
  const [timelineSearch, setTimelineSearch] = useState("");
  const [showRaw, setShowRaw] = useState(false);
  const [hasQueried, setHasQueried] = useState(false);
  const [queryHistory, setQueryHistory] = useState<string[]>([]);
  const [collapsedMonths, setCollapsedMonths] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (patientId) {
      void runPipeline();
    }
  }, [patientId]);

  const askQuestion = async (prefilled?: string): Promise<void> => {
    const prompt = (prefilled ?? query).trim();
    if (!prompt) {
      return;
    }
    setHasQueried(true);
    setQuery(prompt);
    setQueryHistory((previous) => [prompt, ...previous.filter((item) => item !== prompt)].slice(0, 5));
    await runQuery(prompt);
  };

  useEffect(() => {
    if (autoQuery) {
      void askQuestion(autoQuery);
    }
  }, [autoQuery]);

  const risks = useMemo(
    () => [...(pipeline?.risks ?? [])].sort((a, b) => severityWeight(a.severity) - severityWeight(b.severity)).reverse(),
    [pipeline?.risks]
  );

  const quickStats = useMemo(() => {
    const conditions = summary?.conditions.length ?? 0;
    const medications = summary?.medications.length ?? 0;
    const highRiskSignals = risks.filter((risk) => risk.severity === "high" || risk.severity === "critical").length;
    const latestVisit = summary?.timeline?.[0]?.date ? formatMonthYear(summary.timeline[0].date) : "N/A";
    return { conditions, medications, highRiskSignals, latestVisit };
  }, [summary, risks]);

  const metricPoints = useMemo(
    () => ({
      bp: deriveMetricPoints(summary?.timeline, "bp"),
      hba1c: deriveMetricPoints(summary?.timeline, "hba1c"),
      egfr: deriveMetricPoints(summary?.timeline, "egfr"),
    }),
    [summary?.timeline]
  );

  const keyFindingsText = String(pipeline?.synthesis?.keyFindings ?? "No key findings.");
  const recentLabFindings = useMemo(() => parseRecentLabFindings(keyFindingsText), [keyFindingsText]);

  const timelineItems = useMemo(() => {
    const source = summary?.timeline ?? [];
    return source
      .filter((item) => {
        if (timelineFilter === "all") {
          return true;
        }
        return normalizeTimelineType(item) === timelineFilter;
      })
      .filter((item) => {
        const queryText = timelineSearch.trim().toLowerCase();
        if (!queryText) {
          return true;
        }
        return `${item.title} ${item.details} ${item.source}`.toLowerCase().includes(queryText);
      })
      .map((item) => ({
        ...item,
        timestamp: new Date(item.date).getTime(),
        monthKey: formatMonthYear(item.date),
      }))
      .sort((left, right) => right.timestamp - left.timestamp);
  }, [summary?.timeline, timelineFilter, timelineSearch]);

  const groupedTimeline = useMemo(() => {
    const groups = new Map<string, TimelineEnrichedItem[]>();
    for (const item of timelineItems) {
      const existing = groups.get(item.monthKey) ?? [];
      existing.push(item);
      groups.set(item.monthKey, existing);
    }
    return Array.from(groups.entries()).map(([month, items]) => ({
      month,
      items,
      sortKey: items[0]?.timestamp ?? 0,
    })).sort((left, right) => right.sortKey - left.sortKey);
  }, [timelineItems]);

  useEffect(() => {
    setCollapsedMonths((previous) => {
      const next: Record<string, boolean> = {};
      for (const group of groupedTimeline) {
        next[group.month] = previous[group.month] ?? false;
      }
      return next;
    });
  }, [groupedTimeline]);

  if (!user || user.role !== "provider") {
    return (
      <PageWrapper title="Clinician Dashboard">
        <Card>
          <p className="text-sm text-slate-600">Provider session not found.</p>
          <Button className="mt-3" onClick={() => navigate("/")}>Go to login</Button>
        </Card>
      </PageWrapper>
    );
  }

  const doctorName = user.providerName ?? "Doctor";
  const confidenceLabel = ragLoading ? "processing" : String((ragResponse?.confidence as string | undefined) ?? "low");

  return (
    <PageWrapper title="Clinician Dashboard" showTitle={false}>
      <header className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-5 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-sm font-bold text-white">MM</div>
          <div>
            <p className="text-base font-bold text-slate-900">MedMemory OS</p>
            <p className="text-xs text-slate-500">Clinical Intelligence Dashboard</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-sm font-semibold text-slate-900">{doctorName}</p>
            <p className="text-xs text-slate-500">Authorized Provider Session</p>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-700">
            {getInitials(doctorName)}
          </div>
        </div>
      </header>

      <div className="grid gap-4 xl:grid-cols-[18rem,1fr,24rem]">
        <aside className="space-y-4">
          <Card className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Patient</p>
            <div className="mt-3 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-200 text-sm font-bold text-slate-700">
                {getInitials(patient?.name ?? "PT")}
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">{patient?.name ?? "Loading..."}</p>
                <p className="text-xs text-slate-500">{patient?.abhaId ?? "ABHA pending"}</p>
              </div>
            </div>
            <div className="mt-3">
              <Badge label="Consent session active" tone="success" />
            </div>
          </Card>

          <Card className="p-4">
            <p className="text-xs text-slate-500">Session Actions</p>
            <Button
              variant="ghost"
              className="mt-3 w-full border border-red-200 text-red-700 hover:bg-red-50"
              onClick={() => {
                clearSession();
                navigate("/");
              }}
            >
              End Session
            </Button>
          </Card>
        </aside>

        <main className="space-y-4">
          <Card className="p-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Active Conditions</p>
                <p className="text-2xl font-bold text-slate-900">{quickStats.conditions}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Medications</p>
                <p className="text-2xl font-bold text-slate-900">{quickStats.medications}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs text-slate-500">High Risk Signals</p>
                <p className="text-2xl font-bold text-red-600">{quickStats.highRiskSignals}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Last Visit</p>
                <p className="text-lg font-bold text-slate-900">{quickStats.latestVisit}</p>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm text-slate-500">Clinical Summary</p>
                <h2 className="text-xl font-bold text-slate-900">AI Care Synthesis</h2>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-500">Last pipeline run</p>
                <p className="text-sm font-semibold text-slate-900">{pipeline?.timestamp ?? "Never"}</p>
                <Button className="mt-2" onClick={() => void runPipeline()} disabled={loading}>
                  {loading ? <Spinner /> : "Refresh AI Analysis"}
                </Button>
              </div>
            </div>
            {(patientLoading || loading) ? (
              <div className="flex items-center gap-3 text-sm text-slate-700">
                <Spinner />
                {loadingStep || "Loading patient records..."}
              </div>
            ) : (
              <>
                <div className="mb-2 flex items-center gap-2">
                  <h3 className="text-lg font-semibold text-slate-900">AI Summary</h3>
                  <Badge label="AI Generated" tone="info" />
                </div>
                <p className="text-sm text-slate-700">{String(pipeline?.synthesis?.patientOverview ?? "No synthesis available.")}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {((pipeline?.synthesis?.activeProblems as string[]) ?? []).map((problem) => (
                    <Badge key={problem} label={problem} tone="warning" />
                  ))}
                </div>
                <div className="mt-3 rounded-lg bg-blue-50 p-3">
                  {recentLabFindings.length > 0 ? (
                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                      {recentLabFindings.map((item) => (
                        <div key={item.label} className="rounded-md bg-white/70 p-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">{item.label}</p>
                          <p className="text-sm font-semibold text-slate-900">{item.value}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-blue-800">{keyFindingsText}</p>
                  )}
                </div>
              </>
            )}
          </Card>

          <Card className="p-4">
            <h3 className="mb-3 text-lg font-semibold text-slate-900">Risk Signals</h3>
            {risks.length === 0 ? (
              <p className="text-sm text-slate-500">No risk signals available.</p>
            ) : (
              <div className="space-y-3">
                {risks.map((risk) => {
                  const severity = String(risk.severity).toLowerCase();
                  const riskStyles =
                    severity === "critical" || severity === "high"
                      ? "border-l-4 border-red-500 bg-red-50"
                      : severity === "medium"
                        ? "border-l-4 border-amber-500 bg-amber-50"
                        : "border-l-4 border-green-500 bg-green-50";
                  const badgeTone =
                    severity === "critical" || severity === "high"
                      ? "critical"
                      : severity === "medium"
                        ? "warning"
                        : "success";

                  return (
                    <div key={risk.riskId ?? risk.title} className={`rounded-lg border border-slate-200 p-3 ${riskStyles}`}>
                      <div className="mb-2 flex items-center gap-2">
                        <Badge label={String(risk.severity)} tone={badgeTone} />
                        <Badge label={String(risk.category)} tone="default" />
                      </div>
                      <p className="font-semibold text-slate-900">{String(risk.title)}</p>
                      <p className="text-sm text-slate-700">{String(risk.description)}</p>
                      <p className="mt-1 text-sm text-slate-800"><span className="font-semibold">Recommendation:</span> {String(risk.recommendation)}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <Card className="p-4">
            <h3 className="mb-3 text-lg font-semibold text-slate-900">Vitals Trend</h3>
            <div className="grid gap-3 md:grid-cols-3">
              <Sparkline title="Blood Pressure (Systolic)" points={metricPoints.bp} color="#2563eb" />
              <Sparkline title="HbA1c" points={metricPoints.hba1c} color="#ea580c" />
              <Sparkline title="eGFR" points={metricPoints.egfr} color="#059669" />
            </div>
          </Card>

          <Card className="p-4">
            <h3 className="mb-3 text-lg font-semibold text-slate-900">RAG Query</h3>
            <div className="space-y-2">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2"
                placeholder="Ask about this patient's history..."
              />
              <Button onClick={() => void askQuestion()} disabled={!query.trim() || ragLoading} className="w-full sm:w-auto">
                {ragLoading ? "Searching..." : "Ask"}
              </Button>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {["Current medications", "Allergy conflicts", "Lab trends"].map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => void askQuestion(suggestion)}
                  className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                >
                  {suggestion}
                </button>
              ))}
            </div>

            {queryHistory.length > 0 && (
              <div className="mt-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Recent Queries</p>
                <div className="space-y-1">
                  {queryHistory.slice(0, 5).map((historyItem) => (
                    <button
                      key={historyItem}
                      type="button"
                      onClick={() => void askQuestion(historyItem)}
                      className="block w-full truncate rounded-md bg-slate-50 px-2 py-1 text-left text-xs text-slate-700 hover:bg-slate-100"
                    >
                      {historyItem}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {(hasQueried || ragLoading || ragResponse) && (
              <div className="mt-3 rounded-lg border border-slate-200 p-3 text-sm">
                <p className="font-medium text-slate-900">
                  {ragLoading
                    ? "Searching patient records and generating answer..."
                    : String(ragResponse?.answer ?? "No answer was generated for this query.")}
                </p>
                <div className="mt-2 h-2 w-full rounded-full bg-slate-200">
                  <div
                    className="h-2 rounded-full bg-blue-600 transition-all"
                    style={{ width: `${confidencePercent(confidenceLabel)}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-slate-500">Confidence: {confidenceLabel}</p>
              </div>
            )}
          </Card>

          <Card>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">FHIR Data Drawer</h3>
              <Button variant="ghost" size="sm" onClick={() => setShowRaw((prev) => !prev)}>
                {showRaw ? "Hide" : "Show"}
              </Button>
            </div>
            {showRaw && <CodeBlock value={pipeline?.aggregated ?? summary} />}
          </Card>
        </main>

        <aside className="space-y-4">
          <Card className="p-4">
            <h3 className="mb-3 text-lg font-semibold text-slate-900">Timeline</h3>
            <input
              value={timelineSearch}
              onChange={(event) => setTimelineSearch(event.target.value)}
              placeholder="Search timeline..."
              className="mb-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />

            <div className="mb-3 flex flex-wrap gap-2">
              {(["all", "condition", "lab", "medication", "allergy"] as TimelineFilter[]).map((filter) => (
                <Button
                  key={filter}
                  size="sm"
                  variant={timelineFilter === filter ? "primary" : "secondary"}
                  onClick={() => setTimelineFilter(filter)}
                >
                  {filter}
                </Button>
              ))}
            </div>

            {groupedTimeline.length === 0 ? (
              <p className="text-sm text-slate-500">No timeline entries match this filter.</p>
            ) : (
              <div className="space-y-3">
                {groupedTimeline.map((group) => (
                  <div key={group.month} className="rounded-lg border border-slate-200">
                    <button
                      type="button"
                      className="flex w-full items-center justify-between px-3 py-2 text-left"
                      onClick={() =>
                        setCollapsedMonths((previous) => ({ ...previous, [group.month]: !previous[group.month] }))
                      }
                    >
                      <span className="text-sm font-semibold text-slate-800">{group.month}</span>
                      <span className="text-xs text-slate-500">{collapsedMonths[group.month] ? "Show" : "Hide"}</span>
                    </button>
                    {!collapsedMonths[group.month] && (
                      <div className="space-y-2 border-t border-slate-100 px-3 py-2">
                        {group.items.map((item) => {
                          const normalizedType = normalizeTimelineType(item);
                          const iconData = timelineIcon(normalizedType);
                          return (
                            <div key={item.id} className="rounded-md bg-slate-50 p-2">
                              <div className="flex items-start gap-2">
                                <span className="text-base">{iconData.icon}</span>
                                <div className="min-w-0">
                                  <p className="text-xs text-slate-500">{new Date(item.date).toLocaleString()}</p>
                                  <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                                  <p className="text-sm text-slate-600">{item.source} | {item.details}</p>
                                  <div className="mt-1">
                                    <Badge label={item.type} tone={iconData.badgeTone} />
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </aside>
      </div>
    </PageWrapper>
  );
}
