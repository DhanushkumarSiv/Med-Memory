import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import Timeline from "../components/ui/Timeline";
import PageWrapper from "../components/layout/PageWrapper";
import { useAuth } from "../hooks/useAuth";
import { useConsent } from "../hooks/useConsent";
import { usePatient } from "../hooks/usePatient";
import ConsentManager from "./ConsentManager";

type LabTrend = "up" | "down" | "stable";

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

      <div className="flex flex-wrap gap-2">
        <Button variant={tab === "health" ? "primary" : "secondary"} onClick={() => setTab("health")}>My Health</Button>
        <Button variant={tab === "records" ? "primary" : "secondary"} onClick={() => setTab("records")}>My Records</Button>
        <Button variant={tab === "consent" ? "primary" : "secondary"} onClick={() => setTab("consent")}>Share & Consent</Button>
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
        <Card>
          <Timeline
            items={(summary?.timeline ?? []).map((item) => ({
              id: item.id,
              date: item.date,
              title: item.title,
              subtitle: `${item.source} | ${item.details}`,
              badge: item.type,
            }))}
          />
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
