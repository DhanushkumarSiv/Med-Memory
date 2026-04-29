import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import PageWrapper from "../components/layout/PageWrapper";
import { useAuth } from "../hooks/useAuth";
import { useConsent } from "../hooks/useConsent";
import { usePatient } from "../hooks/usePatient";
import ConsentManager from "./ConsentManager";

type LabTrend = "up" | "down" | "stable";
type RecordCategory = "Lab" | "Medication" | "Vitals" | "Imaging";
type RecordFilter = "All" | RecordCategory;

function parseLabValue(details: string): number | null {
  const match = details.match(/-?\d+(\.\d+)?/);
  if (!match) {
    return null;
  }
  return Number(match[0]);
}

export default function PatientApp(): JSX.Element {
  const { user } = useAuth();
  const patientId = user?.patientId ?? null;
  const { patient, summary } = usePatient(patientId);
  const { pendingOtps } = useConsent(patientId);
  const [tab, setTab] = useState<"health" | "records" | "consent">("health");
  const [recordsFilter, setRecordsFilter] = useState<RecordFilter>("All");

  const labsWithTrend = useMemo(
    () =>
      (summary?.labs ?? []).map((lab) => ({
        ...lab,
        trend: (lab.title.toLowerCase().includes("egfr") ? "down" : lab.title.toLowerCase().includes("hba1c") ? "up" : "stable") as LabTrend,
        value: parseLabValue(lab.details),
      })),
    [summary?.labs]
  );

  const overviewStats = useMemo(
    () => [
      { label: "Conditions", value: summary?.conditions.length ?? 0, tone: "warning" as const },
      { label: "Medications", value: summary?.medications.length ?? 0, tone: "info" as const },
      { label: "Lab Results", value: summary?.labs.length ?? 0, tone: "success" as const },
      { label: "Allergies", value: summary?.allergies.length ?? 0, tone: "critical" as const },
    ],
    [summary?.allergies.length, summary?.conditions.length, summary?.labs.length, summary?.medications.length]
  );

  const labChartData = useMemo(
    () =>
      labsWithTrend
        .filter((lab) => typeof lab.value === "number")
        .map((lab) => ({
          name: lab.title.length > 8 ? `${lab.title.slice(0, 8)}...` : lab.title,
          fullName: lab.title,
          value: lab.value as number,
        })),
    [labsWithTrend]
  );

  const timelineRecords = useMemo(() => {
    const records = summary?.timeline ?? [];
    return records.map((item) => {
      const titleLower = item.title.toLowerCase();
      const detailsLower = item.details.toLowerCase();
      const sourceLower = item.source.toLowerCase();
      const typeLower = item.type.toLowerCase();

      const looksVital =
        titleLower.includes("blood pressure") ||
        titleLower.includes("heart rate") ||
        titleLower.includes("pulse") ||
        titleLower.includes("respiratory") ||
        titleLower.includes("temperature");
      const looksImaging =
        titleLower.includes("ct") ||
        titleLower.includes("mri") ||
        titleLower.includes("x-ray") ||
        titleLower.includes("scan") ||
        titleLower.includes("ultrasound") ||
        detailsLower.includes("imaging");

      let category: RecordCategory = "Lab";
      if (typeLower === "medication") {
        category = "Medication";
      } else if (looksImaging) {
        category = "Imaging";
      } else if (looksVital || typeLower === "condition" || typeLower === "allergy" || typeLower === "procedure") {
        category = "Vitals";
      } else if (typeLower === "lab") {
        category = "Lab";
      }

      let labFlag: "High" | "Low" | null = null;
      let vitalsFlag: "Elevated" | null = null;
      const numericMatch = item.details.match(/-?\d+(\.\d+)?/);
      const numericValue = numericMatch ? Number(numericMatch[0]) : null;
      if (category === "Lab" && numericValue !== null) {
        if (titleLower.includes("hba1c") && numericValue > 6.5) {
          labFlag = "High";
        } else if (titleLower.includes("egfr") && numericValue < 60) {
          labFlag = "Low";
        }
      }
      if (category === "Vitals" && titleLower.includes("blood pressure")) {
        const bpMatch = item.details.match(/(\d{2,3})\s*\/\s*(\d{2,3})/);
        if (bpMatch) {
          const systolic = Number(bpMatch[1]);
          const diastolic = Number(bpMatch[2]);
          if (systolic >= 140 || diastolic >= 90) {
            vitalsFlag = "Elevated";
          }
        }
      }

      const medicationFrequency =
        category === "Medication" ? item.details : "";

      return {
        ...item,
        category,
        provider: sourceLower.length > 0 ? item.source : "Unknown source",
        metric: item.details || item.status || "Not available",
        medicationFrequency,
        labFlag,
        vitalsFlag,
      };
    });
  }, [summary?.timeline]);

  const filteredTimelineRecords = useMemo(() => {
    return timelineRecords.filter((item) => {
      const matchesFilter = recordsFilter === "All" ? true : item.category === recordsFilter;
      return matchesFilter;
    });
  }, [recordsFilter, timelineRecords]);

  const groupedRecords = useMemo(() => {
    const byMonth = new Map<string, typeof filteredTimelineRecords>();
    for (const record of filteredTimelineRecords) {
      const dt = new Date(record.date);
      const monthKey = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
      const existing = byMonth.get(monthKey) ?? [];
      existing.push(record);
      byMonth.set(monthKey, existing);
    }

    return [...byMonth.entries()]
      .sort(([a], [b]) => (a < b ? 1 : -1))
      .map(([key, records]) => {
        const [year, month] = key.split("-");
        const label = new Date(Number(year), Number(month) - 1, 1).toLocaleDateString(undefined, {
          month: "long",
          year: "numeric",
        });
        return { key, label, records };
      });
  }, [filteredTimelineRecords]);

  return (
    <PageWrapper title="Patient App">
      <div className="rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-50 to-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold text-slate-900">{patient?.name}</h2>
            <p className="text-sm text-slate-600">{patient?.abhaId}</p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {overviewStats.map((stat) => (
              <div key={stat.label} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-center">
                <p className="text-xl font-bold text-slate-900">{stat.value}</p>
                <div className="mt-1 flex items-center justify-center gap-1">
                  <Badge label={stat.label} tone={stat.tone} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="inline-flex flex-wrap gap-1 rounded-full border border-slate-200 bg-slate-100 p-1">
        {(
          [
            { id: "health", label: "My Health" },
            { id: "records", label: "My Records" },
            { id: "consent", label: "Share & Consent" },
          ] as const
        ).map((tabOption) => (
          <button
            key={tabOption.id}
            type="button"
            onClick={() => setTab(tabOption.id)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              tab === tabOption.id
                ? "border border-blue-200 bg-[#EFF6FF] text-[#1D4ED8] shadow-sm"
                : "border border-transparent bg-transparent text-slate-700 hover:bg-white hover:text-slate-900"
            }`}
          >
            {tabOption.label}
          </button>
        ))}
      </div>

      {tab === "health" && (
        <div className="grid min-h-[70vh] gap-4 lg:grid-cols-12">
          <Card className="lg:col-span-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-xl font-semibold text-slate-900">Conditions</h3>
              <Badge label={`${summary?.conditions.length ?? 0} active`} tone="warning" />
            </div>
            <div className="space-y-2">
              {(summary?.conditions ?? []).length === 0 ? (
                <p className="text-sm text-slate-500">No conditions recorded.</p>
              ) : (
                (summary?.conditions ?? []).map((condition) => (
                  <div key={condition.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p className="font-medium text-slate-900">{condition.title}</p>
                    <p className="text-xs text-slate-500">{condition.source} | {new Date(condition.date).toLocaleDateString()}</p>
                  </div>
                ))
              )}
            </div>
          </Card>

          <Card className="lg:col-span-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-xl font-semibold text-slate-900">Medications</h3>
              <Badge label={`${summary?.medications.length ?? 0} current`} tone="info" />
            </div>
            <div className="space-y-2">
              {(summary?.medications ?? []).length === 0 ? (
                <p className="text-sm text-slate-500">No medications recorded.</p>
              ) : (
                (summary?.medications ?? []).map((medication) => (
                  <div key={medication.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p className="font-medium text-slate-900">{medication.title}</p>
                    <p className="text-xs text-slate-500">{medication.details || "Dose not available"}</p>
                    <p className="text-xs text-slate-500">{medication.source}</p>
                  </div>
                ))
              )}
            </div>
          </Card>

          <Card className="lg:col-span-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-xl font-semibold text-slate-900">Labs</h3>
              <Badge label={`${summary?.labs.length ?? 0} results`} tone="success" />
            </div>
            {labChartData.length > 0 ? (
              <div className="mb-4 h-40 w-full rounded-lg border border-slate-100 bg-slate-50 p-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={labChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(value: number, _name, item) => [value, item.payload.fullName]} />
                    <Bar dataKey="value" fill="#2563eb" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="mb-4 text-sm text-slate-500">Numeric lab values unavailable for chart.</p>
            )}
            <div className="space-y-2">
              {labsWithTrend.map((lab) => (
                <div key={lab.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  <div>
                    <p className="font-medium text-slate-900">{lab.title}</p>
                    <p className="text-xs text-slate-500">{lab.details || "No value"} | {lab.source}</p>
                  </div>
                  <Badge
                    label={lab.trend === "up" ? "↑ Rising" : lab.trend === "down" ? "↓ Falling" : "→ Stable"}
                    tone={lab.trend === "up" ? "warning" : lab.trend === "down" ? "critical" : "info"}
                  />
                </div>
              ))}
            </div>
          </Card>

          <Card className="lg:col-span-12">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-xl font-semibold text-slate-900">Allergies & Safety Alerts</h3>
              <Badge label={`${summary?.allergies.length ?? 0} recorded`} tone="critical" />
            </div>
            {(summary?.allergies ?? []).length === 0 ? (
              <p className="text-sm text-slate-500">No allergy data recorded.</p>
            ) : (
              <div className="flex flex-wrap gap-3">
                {(summary?.allergies ?? []).map((allergy) => (
                  <div key={allergy.id} className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                    <p className="font-semibold text-red-700">{allergy.title}</p>
                    <p className="text-xs text-red-600">{allergy.details || "Reaction history available in chart"}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === "records" && (
        <Card className="bg-slate-50">
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {(["All", "Lab", "Medication", "Vitals", "Imaging"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setRecordsFilter(option)}
                  className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                    recordsFilter === option
                      ? option === "Lab"
                        ? "border-blue-200 bg-[#EFF6FF] text-[#1D4ED8]"
                        : option === "Medication"
                          ? "border-emerald-200 bg-[#F0FDF4] text-[#15803D]"
                          : option === "Vitals"
                            ? "border-orange-200 bg-[#FFF7ED] text-[#C2410C]"
                            : option === "Imaging"
                              ? "border-violet-200 bg-violet-50 text-violet-700"
                              : "border-slate-300 bg-slate-100 text-slate-800"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
            {groupedRecords.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
                <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-slate-100">
                  <svg viewBox="0 0 24 24" className="h-5 w-5 text-slate-600" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="7" />
                    <path d="M21 21L16.6 16.6" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-slate-700">No records found for this category</p>
              </div>
            ) : (
              <div className="space-y-6 transition-opacity duration-300" style={{ ["--timeline-line" as string]: "#CBD5E1" }}>
                {groupedRecords.map((group) => (
                  <div key={group.key}>
                    <p className="sticky top-2 z-10 mb-3 inline-block rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                      {group.label}
                    </p>
                    <div className="relative pl-7">
                      <div className="absolute bottom-0 left-2 top-0 w-[2px] bg-[var(--timeline-line)]" />
                      <div className="space-y-4">
                        {group.records.map((record) => {
                          const dt = new Date(record.date);
                          const datePart = dt.toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          });
                          const timePart = dt.toLocaleTimeString(undefined, {
                            hour: "numeric",
                            minute: "2-digit",
                          });
                          const timestamp = `${datePart} \u00B7 ${timePart}`;
                          const categoryStyle =
                            record.category === "Lab"
                              ? "bg-[#EFF6FF] text-[#1D4ED8]"
                              : record.category === "Medication"
                                ? "bg-[#F0FDF4] text-[#15803D]"
                                : record.category === "Vitals"
                                ? "bg-[#FFF7ED] text-[#C2410C]"
                                  : "bg-violet-100 text-violet-700";
                          const valueStyle =
                            record.category === "Lab"
                              ? "bg-[#EFF6FF] text-[#1D4ED8]"
                              : record.category === "Medication"
                                ? "bg-[#F0FDF4] text-[#15803D]"
                                : record.category === "Vitals"
                                  ? "bg-[#FFF7ED] text-[#C2410C]"
                                  : "bg-violet-100 text-violet-700";
                          const leftAccent =
                            record.category === "Lab"
                              ? "border-l-blue-500"
                              : record.category === "Medication"
                                ? "border-l-emerald-500"
                                : record.category === "Vitals"
                                  ? "border-l-amber-500"
                                  : "border-l-violet-500";
                          const warningLabel =
                            record.labFlag === "High" ? "High" : record.vitalsFlag === "Elevated" ? "Elevated" : null;

                          return (
                            <div key={record.id} className="relative pl-6">
                              <div
                                className={`absolute left-[-2px] top-4 z-10 flex h-6 w-6 items-center justify-center rounded-full text-white ${
                                  record.category === "Lab"
                                    ? "bg-blue-600"
                                    : record.category === "Medication"
                                      ? "bg-emerald-600"
                                      : record.category === "Vitals"
                                        ? "bg-amber-600"
                                        : "bg-violet-600"
                                }`}
                              >
                                {record.category === "Lab" && (
                                  <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M9 3V8L4 19A2 2 0 0 0 5.8 22H18.2A2 2 0 0 0 20 19L15 8V3" />
                                  </svg>
                                )}
                                {record.category === "Medication" && (
                                  <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M7 7L17 17" />
                                    <path d="M6 14A5 5 0 0 1 14 6L18 10A5 5 0 0 1 10 18Z" />
                                  </svg>
                                )}
                                {record.category === "Vitals" && (
                                  <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M3 12H7L10 6L14 18L17 12H21" />
                                  </svg>
                                )}
                                {record.category === "Imaging" && (
                                  <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
                                    <rect x="3" y="5" width="18" height="14" rx="2" />
                                    <path d="M8 9H16" />
                                    <path d="M8 13H13" />
                                  </svg>
                                )}
                              </div>

                              <div className={`rounded-[12px] border border-slate-200 border-l-4 ${leftAccent} bg-white p-4 transition-shadow hover:shadow-[0_1px_4px_rgba(0,0,0,0.07)]`}>
                                <p className="text-xs text-slate-500">{timestamp}</p>
                                <div className="mt-1 flex flex-wrap items-center gap-2">
                                  <p className="text-base font-bold text-slate-900">{record.title}</p>
                                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${categoryStyle}`}>{record.category}</span>
                                  {warningLabel && (
                                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                                      {"\u26A0"} {warningLabel}
                                    </span>
                                  )}
                                </div>
                                <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                                  <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M3 21H21" />
                                    <path d="M5 21V7L12 3L19 7V21" />
                                  </svg>
                                  {record.provider}
                                </p>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${valueStyle}`}>
                                    {record.metric}
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      )}

      {tab === "consent" && (
        <div className="space-y-4">
          <Card>
            <h3 className="mb-2 text-lg font-semibold text-slate-900">Pending OTP requests</h3>
            {pendingOtps.length === 0 ? (
              <p className="text-sm text-slate-500">No pending requests at this moment.</p>
            ) : (
              pendingOtps.map((request) => (
                <div key={String(request.id)} className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                  <p className="text-sm text-slate-700">
                    {String(request.providerName)} is requesting access to your records. The OTP for them to enter is:
                  </p>
                  <p className="mt-2 text-3xl font-bold tracking-widest text-amber-700">{String(request.code)}</p>
                  <p className="text-xs text-slate-500">Expires at {new Date(String(request.expiresAt)).toLocaleTimeString()}</p>
                </div>
              ))
            )}
          </Card>
          <ConsentManager patientIdOverride={patientId ?? undefined} />
        </div>
      )}
    </PageWrapper>
  );
}



