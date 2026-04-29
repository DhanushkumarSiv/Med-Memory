import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import CodeBlock from "../components/ui/CodeBlock";
import Spinner from "../components/ui/Spinner";
import PageWrapper from "../components/layout/PageWrapper";
import Sidebar from "../components/layout/Sidebar";
import TopBar from "../components/layout/TopBar";
import { useAgentPipeline } from "../hooks/useAgentPipeline";
import { useAuth } from "../hooks/useAuth";
import { usePatient } from "../hooks/usePatient";

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

interface LabFindingItem {
  label: string;
  value: string;
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

export default function ClinicianDashboard(): JSX.Element {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const highlightEgrf = searchParams.get("highlight") === "egfr";
  const autoQuery = searchParams.get("autquery");

  const { user, clearSession } = useAuth();
  const patientId = user?.patientId ?? null;
  const { patient, summary, loading: patientLoading } = usePatient(patientId);
  const { pipeline, loading, loadingStep, ragResponse, runPipeline, runQuery } = useAgentPipeline(patientId);

  const [query, setQuery] = useState("");
  const [timelineFilter, setTimelineFilter] = useState<"all" | "condition" | "lab" | "medication">("all");
  const [showRaw, setShowRaw] = useState(false);

  useEffect(() => {
    if (patientId) {
      void runPipeline();
    }
  }, [patientId]);

  useEffect(() => {
    if (autoQuery) {
      setQuery(autoQuery);
      void runQuery(autoQuery);
    }
  }, [autoQuery]);

  const filteredTimeline = useMemo(() => {
    const items = summary?.timeline ?? [];
    return items.filter((item) => {
      if (timelineFilter === "all") {
        return true;
      }
      if (timelineFilter === "condition") {
        return item.type.toLowerCase().includes("condition");
      }
      if (timelineFilter === "lab") {
        return item.type.toLowerCase().includes("lab");
      }
      return item.type.toLowerCase().includes("medication");
    });
  }, [summary?.timeline, timelineFilter]);

  const risks = useMemo(
    () => [...(pipeline?.risks ?? [])].sort((a, b) => severityWeight(a.severity) - severityWeight(b.severity)).reverse(),
    [pipeline?.risks]
  );
  const keyFindingsText = String(pipeline?.synthesis?.keyFindings ?? "No key findings.");
  const recentLabFindings = useMemo(() => parseRecentLabFindings(keyFindingsText), [keyFindingsText]);

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

  return (
    <PageWrapper title="Clinician Dashboard">
      <div className="grid gap-4 lg:grid-cols-[20rem,1fr]">
        <Sidebar>
          <p className="text-sm text-slate-500">Provider</p>
          <h2 className="text-xl font-bold text-slate-900">{user.providerName ?? "Provider"}</h2>
          <Badge label="Consent session active" tone="success" />

          <div className="rounded-lg border border-slate-200 p-3">
            <p className="text-xs text-slate-500">Patient</p>
            <p className="font-semibold text-slate-900">{patient?.name ?? "Loading"}</p>
            <p className="text-sm text-slate-600">{patient?.abhaId}</p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <h3 className="mb-2 text-sm font-semibold text-slate-900">RAG Query</h3>
            <div className="flex flex-col gap-2">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                placeholder="Ask about patient's history..."
              />
              <Button onClick={() => void runQuery(query)} disabled={!query.trim()} size="sm">
                Ask
              </Button>
            </div>
            {ragResponse && (
              <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3 text-sm">
                <p className="font-medium text-slate-900">{String(ragResponse.answer ?? "")}</p>
                <p className="mt-1 text-xs text-slate-500">Confidence: {String(ragResponse.confidence ?? "unknown")}</p>
              </div>
            )}
          </div>

          <Button
            variant="danger"
            onClick={() => {
              clearSession();
              navigate("/");
            }}
          >
            End session
          </Button>
        </Sidebar>

        <div className="space-y-4">
          <TopBar>
            <div>
              <h2 className="text-xl font-bold text-slate-900">{patient?.name ?? "Patient"}</h2>
              <p className="text-sm text-slate-600">
                {patient?.abhaId} | {patient?.gender} | DOB {patient?.dob}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Last pipeline run: {pipeline?.timestamp ?? "Never"}</span>
              <Button onClick={() => void runPipeline()} disabled={loading}>
                {loading ? <Spinner /> : "Refresh AI Analysis"}
              </Button>
            </div>
          </TopBar>

          {patientLoading || loading ? (
            <Card>
              <div className="flex items-center gap-3 text-sm text-slate-700">
                <Spinner />
                {loadingStep || "Loading patient records..."}
              </div>
            </Card>
          ) : (
            <>
              <Card>
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
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
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
                <p className="mt-3 text-sm text-slate-700">{String(pipeline?.synthesis?.longitudinalNarrative ?? "")}</p>
                <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-slate-700">
                  {((pipeline?.synthesis?.clinicalPearls as string[]) ?? []).map((pearl) => (
                    <li key={pearl}>{pearl}</li>
                  ))}
                </ol>
              </Card>

              <Card>
                <h3 className="mb-3 text-lg font-semibold text-slate-900">Risk Signals</h3>
                {risks.length === 0 ? (
                  <p className="text-sm text-slate-500">No risk signals available.</p>
                ) : (
                  <div className="space-y-3">
                    {risks.map((risk) => {
                      const isEgfr = String(risk.title).toLowerCase().includes("egfr");
                      return (
                        <div
                          key={risk.riskId ?? risk.title}
                          className={`rounded-lg border p-3 ${
                            highlightEgrf && isEgfr ? "border-red-500 ring-4 ring-red-200 animate-pulse" : "border-slate-200"
                          }`}
                        >
                          <div className="mb-2 flex items-center gap-2">
                            <Badge
                              label={String(risk.severity)}
                              tone={risk.severity === "critical" ? "critical" : risk.severity === "high" ? "warning" : "info"}
                            />
                            <Badge label={String(risk.category)} tone="default" />
                          </div>
                          <p className="font-semibold text-slate-900">{String(risk.title)}</p>
                          <p className="text-sm text-slate-700">{String(risk.description)}</p>
                          <p className="mt-1 text-sm text-green-700">Recommendation: {String(risk.recommendation)}</p>
                          <ul className="mt-2 list-disc pl-5 text-xs text-slate-600">
                            {((risk.evidence as string[]) ?? []).map((evidence) => (
                              <li key={evidence}>{evidence}</li>
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>

              <Card className="p-4 sm:p-5">
                <div className="mb-4 flex flex-col gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-blue-50 text-blue-700">
                        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                          <path d="M3 12H7L10 6L14 18L17 12H21" />
                        </svg>
                      </span>
                      <h3 className="text-[1.3rem] font-bold text-slate-900">Record Timeline</h3>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                        {filteredTimeline.length} records
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setTimelineFilter("all")}
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                        timelineFilter === "all"
                          ? "border-[#2563EB] bg-[#2563EB] text-white"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-blue-50"
                      }`}
                    >
                      All
                    </button>
                    <button
                      type="button"
                      onClick={() => setTimelineFilter("condition")}
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                        timelineFilter === "condition"
                          ? "border-[#D97706] bg-[#D97706] text-white"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-amber-50"
                      }`}
                    >
                      Conditions
                    </button>
                    <button
                      type="button"
                      onClick={() => setTimelineFilter("lab")}
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                        timelineFilter === "lab"
                          ? "border-[#4F46E5] bg-[#4F46E5] text-white"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-indigo-50"
                      }`}
                    >
                      Labs
                    </button>
                    <button
                      type="button"
                      onClick={() => setTimelineFilter("medication")}
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                        timelineFilter === "medication"
                          ? "border-[#059669] bg-[#059669] text-white"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-emerald-50"
                      }`}
                    >
                      Medications
                    </button>
                  </div>
                </div>

                {filteredTimeline.length === 0 ? (
                  <p className="text-sm text-slate-500">No timeline entries available.</p>
                ) : (
                  <div className="space-y-5">
                    {(() => {
                      const grouped = filteredTimeline.reduce<Record<string, typeof filteredTimeline>>((acc, item) => {
                        const dt = new Date(item.date);
                        const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
                        if (!acc[key]) {
                          acc[key] = [];
                        }
                        acc[key].push(item);
                        return acc;
                      }, {});

                      return Object.entries(grouped).map(([key, items]) => {
                        const [year, month] = key.split("-");
                        const monthLabel = new Date(Number(year), Number(month) - 1, 1).toLocaleDateString(undefined, {
                          month: "long",
                          year: "numeric",
                        });

                        return (
                          <div key={key} className="space-y-3">
                            <div className="sticky top-2 z-10 flex items-center gap-2 bg-white/95 py-1 backdrop-blur-sm">
                              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{monthLabel}</span>
                              <span className="h-px flex-1 bg-slate-200" />
                            </div>

                            <div className="relative space-y-4 pl-12">
                              <div className="absolute bottom-0 left-[17px] top-0 w-[2px] bg-[#E2E8F0]" />
                              {items.map((item) => {
                                const typeLower = item.type.toLowerCase();
                                const titleLower = item.title.toLowerCase();
                                const detailsLower = item.details.toLowerCase();
                                const looksImaging =
                                  typeLower.includes("imaging") ||
                                  titleLower.includes("mri") ||
                                  titleLower.includes("ct") ||
                                  titleLower.includes("x-ray") ||
                                  titleLower.includes("scan");
                                const looksMedication = typeLower.includes("medication");
                                const looksCondition =
                                  typeLower.includes("condition") ||
                                  titleLower.includes("blood pressure") ||
                                  detailsLower.includes("mmhg");
                                const recordType = looksImaging ? "Imaging" : looksMedication ? "Medication" : looksCondition ? "Condition" : "Lab";

                                const theme =
                                  recordType === "Lab"
                                    ? {
                                        iconBg: "bg-[#EEF2FF]",
                                        iconText: "text-[#4F46E5]",
                                        badgeClass: "bg-[#EEF2FF] text-[#3730A3]",
                                        valueClass: "bg-[#EEF2FF] text-[#4338CA]",
                                        accentClass: "border-l-[#4F46E5]",
                                      }
                                    : recordType === "Medication"
                                      ? {
                                          iconBg: "bg-[#ECFDF5]",
                                          iconText: "text-[#059669]",
                                          badgeClass: "bg-[#ECFDF5] text-[#047857]",
                                          valueClass: "bg-[#ECFDF5] text-[#047857]",
                                          accentClass: "border-l-[#059669]",
                                        }
                                      : recordType === "Condition"
                                        ? {
                                            iconBg: "bg-[#FFF7ED]",
                                            iconText: "text-[#D97706]",
                                            badgeClass: "bg-[#FFF7ED] text-[#B45309]",
                                            valueClass: "bg-[#FFF7ED] text-[#B45309]",
                                            accentClass: "border-l-[#D97706]",
                                          }
                                        : {
                                            iconBg: "bg-[#F5F3FF]",
                                            iconText: "text-[#7C3AED]",
                                            badgeClass: "bg-[#F5F3FF] text-[#6D28D9]",
                                            valueClass: "bg-[#F5F3FF] text-[#6D28D9]",
                                            accentClass: "border-l-[#7C3AED]",
                                          };

                                const numeric = Number((item.details.match(/-?\d+(\.\d+)?/) ?? [])[0] ?? NaN);
                                const bpMatch = item.details.match(/(\d{2,3})\s*\/\s*(\d{2,3})/);
                                const hasHighHbA1c = titleLower.includes("hba1c") && Number.isFinite(numeric) && numeric >= 7;
                                const hasElevatedBp = !!bpMatch && Number(bpMatch[1]) >= 140;
                                const showWarning = hasHighHbA1c || hasElevatedBp;

                                const date = new Date(item.date);
                                const dateLabel = `${date.toLocaleDateString(undefined, {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                })} · ${date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;

                                return (
                                  <div key={item.id} className="relative">
                                    <div className={`absolute left-[-43px] top-3 flex h-9 w-9 items-center justify-center rounded-full ${theme.iconBg} ${theme.iconText}`}>
                                      {recordType === "Lab" && (
                                        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                                          <path d="M9 3V8L4 19A2 2 0 0 0 5.8 22H18.2A2 2 0 0 0 20 19L15 8V3" />
                                          <path d="M8 14H16" />
                                        </svg>
                                      )}
                                      {recordType === "Medication" && (
                                        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                                          <path d="M7 7L17 17" />
                                          <path d="M6 14A5 5 0 0 1 14 6L18 10A5 5 0 0 1 10 18Z" />
                                        </svg>
                                      )}
                                      {recordType === "Condition" && (
                                        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                                          <path d="M3 12H7L10 6L14 18L17 12H21" />
                                        </svg>
                                      )}
                                      {recordType === "Imaging" && (
                                        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                                          <rect x="3" y="5" width="18" height="14" rx="2" />
                                          <path d="M8 10H16" />
                                          <path d="M8 14H13" />
                                        </svg>
                                      )}
                                    </div>

                                    <div className={`rounded-[12px] border border-[#E2E8F0] border-l-4 ${theme.accentClass} bg-white p-4 transition-all duration-200 hover:shadow-[0_4px_16px_rgba(0,0,0,0.07)]`}>
                                      <div className="flex flex-wrap items-center justify-between gap-2">
                                        <p className="text-xs text-[#64748B]">{dateLabel}</p>
                                        <span className={`rounded-full px-2 py-1 text-xs font-semibold ${theme.badgeClass}`}>{recordType}</span>
                                      </div>

                                      <p className="mt-2 text-base font-semibold text-[#0F172A]">{item.title}</p>

                                      <p className="mt-1 flex items-center gap-1 text-[0.85rem] text-[#64748B]">
                                        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
                                          <path d="M3 21H21" />
                                          <path d="M5 21V7L12 3L19 7V21" />
                                          <path d="M9 21V13H15V21" />
                                        </svg>
                                        {item.source}
                                      </p>

                                      <div className="mt-3 flex flex-wrap items-center gap-2">
                                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${theme.valueClass}`}>
                                          {item.details || "Not available"}
                                        </span>
                                        {showWarning && (
                                          <span className="rounded-full bg-[#FEF3C7] px-2.5 py-1 text-xs font-semibold text-[#92400E]">
                                            ⚠ Elevated
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                )}
              </Card>

              {false && (
                <Card>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-slate-900">FHIR Data Drawer</h3>
                    <Button variant="ghost" size="sm" onClick={() => setShowRaw((prev) => !prev)}>
                      {showRaw ? "Hide" : "Show"}
                    </Button>
                  </div>
                  {showRaw && <CodeBlock value={pipeline?.aggregated ?? summary} />}
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </PageWrapper>
  );
}
