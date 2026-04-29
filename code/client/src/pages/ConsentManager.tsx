import { FormEvent, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import CountdownTimer from "../components/ui/CountdownTimer";
import { useAuth } from "../hooks/useAuth";
import { useConsent } from "../hooks/useConsent";

interface ConsentManagerProps {
  patientIdOverride?: string;
}

type ScopeCategory = "Patient Data" | "Consent & Compliance" | "System";

interface ScopeDefinition {
  key: string;
  label: string;
  description: string;
  category: ScopeCategory;
  highRisk?: boolean;
}

export default function ConsentManager({ patientIdOverride }: ConsentManagerProps): JSX.Element {
  const params = useParams();
  const { user } = useAuth();
  const patientId = patientIdOverride ?? params.patientId ?? user?.patientId ?? null;
  const { tokens, pendingOtps, audit, loading, grant, revoke, denyOtp } = useConsent(patientId);

  const [providerName, setProviderName] = useState("");
  const [providerType, setProviderType] = useState("clinician");
  const [expiresAt, setExpiresAt] = useState("");
  const [scopes, setScopes] = useState<string[]>(["patient:read", "patient:fhir"]);
  const [accessView, setAccessView] = useState<"granted" | "revoked">("granted");
  const [removedTokenIds, setRemovedTokenIds] = useState<string[]>([]);
  const [removingTokenId, setRemovingTokenId] = useState<string | null>(null);

  const scopeDefinitions = useMemo<ScopeDefinition[]>(
    () => [
      {
        key: "patient:read",
        label: "View Patient Records",
        description: "Read-only access to patient demographics and history",
        category: "Patient Data",
      },
      {
        key: "patient:fhir",
        label: "FHIR Data Access",
        description: "Access structured clinical data via FHIR API",
        category: "Patient Data",
      },
      {
        key: "patient:run-pipeline",
        label: "Run Pipelines",
        description: "Trigger data processing workflows",
        category: "System",
        highRisk: true,
      },
      {
        key: "patient:query",
        label: "Query Patient Data",
        description: "Run custom queries on patient dataset",
        category: "Patient Data",
      },
      {
        key: "consent:read",
        label: "View Consent Records",
        description: "Access patient consent and authorization data",
        category: "Consent & Compliance",
      },
      {
        key: "audit:read",
        label: "View Audit Logs",
        description: "Read-only access to system activity logs",
        category: "Consent & Compliance",
      },
    ],
    []
  );
  const scopeGroups = useMemo(
    () =>
      scopeDefinitions.reduce(
        (acc, scope) => {
          acc[scope.category].push(scope);
          return acc;
        },
        {
          "Patient Data": [] as ScopeDefinition[],
          "Consent & Compliance": [] as ScopeDefinition[],
          System: [] as ScopeDefinition[],
        }
      ),
    [scopeDefinitions]
  );
  const grantedTokens = useMemo(() => tokens.filter((token) => !token.revokedAt), [tokens]);
  const revokedTokens = useMemo(() => tokens.filter((token) => Boolean(token.revokedAt)), [tokens]);
  const visibleTokens = useMemo(
    () =>
      (accessView === "granted" ? grantedTokens : revokedTokens).filter(
        (token) => !removedTokenIds.includes(token.id)
      ),
    [accessView, grantedTokens, removedTokenIds, revokedTokens]
  );
  const recentAudit = useMemo(() => audit.slice(0, 10), [audit]);
  const highRiskSelected = useMemo(
    () => scopeDefinitions.some((scope) => scope.highRisk && scopes.includes(scope.key)),
    [scopeDefinitions, scopes]
  );
  const readableScopes = useMemo(
    () =>
      ({
        "patient:read": { label: "View Records" },
        "patient:fhir": { label: "FHIR Access" },
        "patient:run-pipeline": { label: "Run Pipeline" },
        "patient:query": { label: "Query Data" },
        "consent:read": { label: "Consent Data" },
        "audit:read": { label: "Audit Logs" },
      }) as Record<string, { label: string }>,
    []
  );
  const downloadAuditCsv = (): void => {
    const csvEscape = (value: unknown): string => {
      const text = String(value ?? "");
      if (text.includes(",") || text.includes("\"") || text.includes("\n")) {
        return `"${text.replace(/"/g, "\"\"")}"`;
      }
      return text;
    };

    const headers = ["id", "accessor", "action", "resourceAccessed", "consentTokenUsed", "accessedAt"];
    const rows = audit.map((entry) =>
      [
        entry.id,
        entry.accessor,
        entry.action,
        entry.resourceAccessed,
        entry.consentTokenUsed,
        entry.accessedAt,
      ].map((field) => csvEscape(field)).join(",")
    );
    const csvContent = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `medmemory-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const onGrant = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!providerName || !providerType || !expiresAt || scopes.length === 0) {
      return;
    }
    await grant({ providerName, providerType, scopes, expiresAt: new Date(expiresAt).toISOString() });
    setProviderName("");
  };

  const getInitials = (name: string): string => {
    const parts = name
      .split(" ")
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length === 0) {
      return "NA";
    }
    if (parts.length === 1) {
      return parts[0]?.slice(0, 2).toUpperCase() ?? "NA";
    }
    return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase();
  };

  const parseTokenScopes = (rawScopes: string): string[] => {
    try {
      const parsed = JSON.parse(rawScopes) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is string => typeof item === "string");
      }
      return [];
    } catch {
      return [];
    }
  };

  const formatExpiryInfo = (
    expiresAtIso: string
  ): { text: string; expiringSoon: boolean; expired: boolean } => {
    const now = new Date();
    const expiry = new Date(expiresAtIso);
    const diffMs = expiry.getTime() - now.getTime();
    const datePart = expiry.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const timePart = expiry.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });

    return {
      text: `Expires ${datePart} at ${timePart}`,
      expiringSoon: diffMs > 0 && diffMs <= 24 * 60 * 60 * 1000,
      expired: diffMs <= 0,
    };
  };
  const removeCardFromUi = (tokenId: string): void => {
    setRemovingTokenId(tokenId);
    window.setTimeout(() => {
      setRemovedTokenIds((prev) => [...prev, tokenId]);
      setRemovingTokenId((current) => (current === tokenId ? null : current));
    }, 650);
  };

  return (
    <div className="space-y-6">
      <Card>
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Who can see my records</h2>
        <div className="mb-5 inline-flex rounded-full border border-slate-200 bg-slate-100 p-1">
          {(
            [
              { id: "granted", label: "Granted Access", count: grantedTokens.length },
              { id: "revoked", label: "Revoked Access", count: revokedTokens.length },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setAccessView(tab.id)}
              className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition ${
                accessView === tab.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-800"
              }`}
            >
              {tab.label}
              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-700">{tab.count}</span>
            </button>
          ))}
        </div>

        {visibleTokens.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-200 text-slate-600">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 10V8a6 6 0 0 1 12 0v2" />
                <rect x="4" y="10" width="16" height="10" rx="2" />
              </svg>
            </div>
            <p className="text-sm font-medium text-slate-700">
              {accessView === "granted" ? "No active access grants" : "No revoked access records"}
            </p>
            <p className="mt-1 text-xs text-slate-500">Once access entries are added, they will appear here.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {visibleTokens.map((token) => {
              const expiry = formatExpiryInfo(token.expiresAt);
              return (
                <div
                  key={token.id}
                  className="rounded-xl border border-slate-200 p-4 transition hover:border-slate-300 hover:shadow-sm"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700">
                      {getInitials(token.providerName)}
                    </div>
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-bold text-slate-900">{token.providerName}</h3>
                        <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold capitalize text-blue-700">
                          {token.providerType}
                        </span>
                        {expiry.expired && (
                          <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">Expired</span>
                        )}
                      </div>
                      <p
                        className={`mt-1 flex items-center gap-1.5 text-xs ${
                          expiry.expired ? "text-red-600" : expiry.expiringSoon ? "text-amber-700" : "text-slate-600"
                        }`}
                      >
                        {expiry.expiringSoon && !expiry.expired && (
                          <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-amber-100 text-[10px] font-bold text-amber-700">
                            !
                          </span>
                        )}
                        {expiry.text}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {parseTokenScopes(token.scopes).map((scope) => {
                      const friendly = readableScopes[scope];
                      return (
                        <span
                          key={`${token.id}-${scope}`}
                          className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700"
                        >
                          {friendly?.label ?? scope}
                        </span>
                      );
                    })}
                  </div>

                  {accessView === "revoked" && (
                    <p className="mt-3 text-xs text-red-600">
                      Revoked at {token.revokedAt ? new Date(token.revokedAt).toLocaleString() : "-"}
                    </p>
                  )}

                  {accessView === "granted" && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        className="rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50"
                        onClick={() => void revoke(token.id)}
                      >
                        Revoke
                      </button>
                      <button
                        type="button"
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                        onClick={() => removeCardFromUi(token.id)}
                      >
                        Remove
                      </button>
                      {removingTokenId === token.id && <span className="text-xs text-slate-500">Removed</span>}
                    </div>
                  )}

                  {accessView === "revoked" && (
                    <div className="mt-3 flex items-center gap-2">
                      <button
                        type="button"
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                        onClick={() => removeCardFromUi(token.id)}
                      >
                        Remove
                      </button>
                      {removingTokenId === token.id && <span className="text-xs text-slate-500">Removed</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card>
        <div className="mb-5 rounded-xl border border-blue-100 bg-blue-50/70 p-4">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-blue-700">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 4V20" />
                <path d="M4 12H20" />
              </svg>
            </span>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Grant new access</h2>
              <p className="text-sm text-slate-600">Configure provider details and permission scopes before granting.</p>
            </div>
          </div>
        </div>

        <form className="space-y-4" onSubmit={(event) => void onGrant(event)}>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Provider name</label>
                <input
                  value={providerName}
                  onChange={(event) => setProviderName(event.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2"
                  placeholder="Dr. Meera Pillai"
                  required
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Access expiry</label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-2.5 text-slate-400">
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="4" width="18" height="18" rx="2" />
                      <path d="M16 2V6" />
                      <path d="M8 2V6" />
                      <path d="M3 10H21" />
                    </svg>
                  </span>
                  <input
                    type="datetime-local"
                    value={expiresAt}
                    onChange={(event) => setExpiresAt(event.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-10 pr-3"
                    required
                  />
                </div>
                <p className="mt-1 text-xs text-slate-500">Access expires after this date.</p>
              </div>
            </div>

            <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Provider role</label>
                <select
                  value={providerType}
                  onChange={(event) => setProviderType(event.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2"
                >
                  <option value="clinician">Clinician</option>
                  <option value="specialist">Specialist</option>
                  <option value="emergency">Emergency</option>
                  <option value="insurer">Insurer</option>
                </select>
              </div>

              <div className="space-y-3">
                {(Object.entries(scopeGroups) as Array<[ScopeCategory, ScopeDefinition[]]>).map(([category, categoryScopes]) => (
                  <div key={category}>
                    <div className="mb-2 flex items-center gap-2">
                      <p className="text-sm font-semibold text-slate-700">{category}</p>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          category === "Patient Data"
                            ? "bg-blue-100 text-blue-700"
                            : category === "Consent & Compliance"
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {categoryScopes.length}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {categoryScopes.map((scope) => {
                        const selected = scopes.includes(scope.key);
                        return (
                          <button
                            key={scope.key}
                            type="button"
                            onClick={() =>
                              setScopes((prev) =>
                                selected ? prev.filter((item) => item !== scope.key) : [...prev, scope.key]
                              )
                            }
                            className={`w-full rounded-xl border p-3 text-left transition ${
                              selected
                                ? "border-blue-300 bg-blue-50"
                                : "border-slate-200 bg-white hover:border-slate-300"
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <span
                                className={`mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full border text-xs ${
                                  selected
                                    ? "border-blue-500 bg-blue-500 text-white"
                                    : "border-slate-300 bg-white text-transparent"
                                }`}
                              >
                                v
                              </span>
                              <div>
                                <p className="text-sm font-semibold text-slate-900">{scope.label}</p>
                                <p className="text-xs text-slate-500">{scope.key}</p>
                                <p className="mt-1 text-xs text-slate-600">{scope.description}</p>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-sm font-medium text-slate-800">
              {scopes.length} of {scopeDefinitions.length} permissions selected
            </p>
          </div>

          {highRiskSelected && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              High-risk permission selected: <strong>Run Pipelines</strong>. Grant only when workflow execution is required.
            </div>
          )}

          <div>
            <Button type="submit" className="inline-flex items-center gap-2">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12H19" />
                <path d="M12 5L19 12L12 19" />
              </svg>
              Grant Access
            </Button>
          </div>
        </form>
      </Card>

      <Card>
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Pending OTP requests</h2>
        {pendingOtps.length === 0 ? (
          <p className="text-sm text-slate-500">No pending OTP requests.</p>
        ) : (
          <div className="space-y-3">
            {pendingOtps.map((otp) => (
              <div key={String(otp.id)} className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <p className="font-semibold text-slate-900">{String(otp.providerName ?? "Provider")} requested access</p>
                <p className="mt-2 text-3xl font-bold tracking-widest text-amber-700">{String(otp.code)}</p>
                <p className="text-xs text-slate-600">Requested: {new Date(String(otp.createdAt)).toLocaleString()}</p>
                <div className="mt-2 flex items-center gap-3">
                  <CountdownTimer
                    seconds={Math.max(
                      0,
                      Math.floor((new Date(String(otp.expiresAt)).getTime() - Date.now()) / 1000)
                    )}
                  />
                  <Button variant="danger" size="sm" onClick={() => void denyOtp(String(otp.id))}>
                    Deny
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-900">Audit log (last 10)</h2>
          <Button type="button" variant="secondary" size="sm" onClick={downloadAuditCsv} disabled={audit.length === 0}>
            Download all audits (CSV)
          </Button>
        </div>
        {loading ? (
          <p className="text-sm text-slate-500">Loading audit entries...</p>
        ) : recentAudit.length === 0 ? (
          <p className="text-sm text-slate-500">No audit activity yet.</p>
        ) : (
          <div className="space-y-2">
            {recentAudit.map((entry) => (
              <div key={entry.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                <p className="font-medium text-slate-900">{entry.accessor}</p>
                <p className="text-slate-600">{entry.action}</p>
                <p className="text-xs text-slate-500">{new Date(entry.accessedAt).toLocaleString()}</p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}




