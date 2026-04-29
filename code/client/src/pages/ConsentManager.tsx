import { FormEvent, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import CountdownTimer from "../components/ui/CountdownTimer";
import { useAuth } from "../hooks/useAuth";
import { useConsent } from "../hooks/useConsent";

interface ConsentManagerProps {
  patientIdOverride?: string;
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

  const scopeOptions = useMemo(
    () => ["patient:read", "patient:fhir", "patient:run-pipeline", "patient:query", "consent:read", "audit:read"],
    []
  );
  const grantedTokens = useMemo(() => tokens.filter((token) => !token.revokedAt), [tokens]);
  const revokedTokens = useMemo(() => tokens.filter((token) => Boolean(token.revokedAt)), [tokens]);
  const visibleTokens = accessView === "granted" ? grantedTokens : revokedTokens;
  const recentAudit = useMemo(() => audit.slice(0, 10), [audit]);

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

  return (
    <div className="space-y-6">
      <Card>
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Who can see my records</h2>
        <div className="mb-4 flex flex-wrap gap-2">
          <Button
            variant={accessView === "granted" ? "primary" : "secondary"}
            size="sm"
            onClick={() => setAccessView("granted")}
          >
            Granted Access ({grantedTokens.length})
          </Button>
          <Button
            variant={accessView === "revoked" ? "primary" : "secondary"}
            size="sm"
            onClick={() => setAccessView("revoked")}
          >
            Revoked Access ({revokedTokens.length})
          </Button>
        </div>
        {visibleTokens.length === 0 ? (
          <p className="text-sm text-slate-500">
            {accessView === "granted" ? "No granted access tokens." : "No revoked access tokens."}
          </p>
        ) : (
          <div className="space-y-3">
            {visibleTokens.map((token) => (
              <div key={token.id} className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-slate-900">{token.providerName}</p>
                    <p className="text-xs text-slate-500">Expires: {new Date(token.expiresAt).toLocaleString()}</p>
                  </div>
                  <Badge label={token.providerType} tone="info" />
                </div>
                <p className="mt-2 text-xs text-slate-600">Scopes: {JSON.parse(token.scopes).join(", ")}</p>
                {accessView === "revoked" ? (
                  <p className="mt-1 text-xs text-red-600">
                    Revoked at {token.revokedAt ? new Date(token.revokedAt).toLocaleString() : "-"}
                  </p>
                ) : (
                  <Button className="mt-3" variant="danger" size="sm" onClick={() => void revoke(token.id)}>
                    Revoke
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Grant new access</h2>
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => void onGrant(event)}>
          <input
            value={providerName}
            onChange={(event) => setProviderName(event.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2"
            placeholder="Provider name"
            required
          />
          <select
            value={providerType}
            onChange={(event) => setProviderType(event.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2"
          >
            <option value="clinician">Clinician</option>
            <option value="specialist">Specialist</option>
            <option value="emergency">Emergency</option>
            <option value="insurer">Insurer</option>
          </select>
          <input
            type="datetime-local"
            value={expiresAt}
            onChange={(event) => setExpiresAt(event.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2"
            required
          />
          <div className="space-y-2">
            {scopeOptions.map((scope) => (
              <label key={scope} className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={scopes.includes(scope)}
                  onChange={(event) => {
                    setScopes((prev) =>
                      event.target.checked ? [...prev, scope] : prev.filter((item) => item !== scope)
                    );
                  }}
                />
                {scope}
              </label>
            ))}
          </div>
          <div className="sm:col-span-2">
            <Button type="submit">Grant Access</Button>
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
