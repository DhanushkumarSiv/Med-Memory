import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import CodeBlock from "../components/ui/CodeBlock";
import Spinner from "../components/ui/Spinner";
import Timeline from "../components/ui/Timeline";
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

              <Card>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-slate-900">Record Timeline</h3>
                  <div className="flex gap-2">
                    <Button variant={timelineFilter === "all" ? "primary" : "secondary"} size="sm" onClick={() => setTimelineFilter("all")}>All</Button>
                    <Button variant={timelineFilter === "condition" ? "primary" : "secondary"} size="sm" onClick={() => setTimelineFilter("condition")}>Conditions</Button>
                    <Button variant={timelineFilter === "lab" ? "primary" : "secondary"} size="sm" onClick={() => setTimelineFilter("lab")}>Labs</Button>
                    <Button variant={timelineFilter === "medication" ? "primary" : "secondary"} size="sm" onClick={() => setTimelineFilter("medication")}>Medications</Button>
                  </div>
                </div>
                <Timeline
                  items={filteredTimeline.map((item) => ({
                    id: item.id,
                    date: item.date,
                    title: item.title,
                    subtitle: `${item.source} | ${item.details}`,
                    badge: item.type,
                  }))}
                />
              </Card>

              <Card>
                <h3 className="mb-3 text-lg font-semibold text-slate-900">RAG Query</h3>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    className="flex-1 rounded-lg border border-slate-200 px-3 py-2"
                    placeholder="Ask about this patient's history..."
                  />
                  <Button onClick={() => void runQuery(query)} disabled={!query.trim()}>
                    Ask
                  </Button>
                </div>
                {ragResponse && (
                  <div className="mt-3 rounded-lg border border-slate-200 p-3 text-sm">
                    <p className="font-medium text-slate-900">{String(ragResponse.answer ?? "")}</p>
                    <p className="mt-1 text-xs text-slate-500">Confidence: {String(ragResponse.confidence ?? "unknown")}</p>
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
            </>
          )}
        </div>
      </div>
    </PageWrapper>
  );
}
