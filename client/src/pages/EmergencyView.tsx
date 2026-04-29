import { useState } from "react";
import { useParams } from "react-router-dom";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import api from "../services/api";

export default function EmergencyView(): JSX.Element {
  const { abhaId } = useParams();
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [payload, setPayload] = useState<Record<string, unknown> | null>(null);

  const fetchEmergency = async (): Promise<void> => {
    if (!abhaId || reason.trim().length < 3) {
      setError("Reason is required before data can be displayed.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const response = await api.post(`/emergency/${abhaId}`, {
        reason,
        accessor: "Emergency Operator",
      });
      setPayload(response.data as Record<string, unknown>);
    } catch (err) {
      setError(((err as { response?: { data?: { message?: string } } }).response?.data?.message as string) ?? "Emergency access failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white p-4 sm:p-8">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="rounded-xl border-2 border-red-300 bg-red-50 p-4">
          <p className="text-sm font-semibold text-red-700">BREAK-GLASS ACCESS</p>
          <p className="text-sm text-red-700">This access is being logged. Reason required:</p>
          <div className="mt-2 flex gap-2">
            <input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="flex-1 rounded-lg border border-red-200 px-3 py-2"
              placeholder="Enter emergency reason"
            />
            <Button onClick={() => void fetchEmergency()} disabled={loading}>Access</Button>
          </div>
          {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
        </div>

        {payload && (
          <>
            <Card>
              <h1 className="text-2xl font-bold text-slate-900">{String((payload.patient as Record<string, unknown>).name)}</h1>
              <p className="text-sm text-slate-600">{String((payload.patient as Record<string, unknown>).abhaId)}</p>
            </Card>
            <Card className="border-red-300 bg-red-50">
              <h2 className="mb-2 text-xl font-bold text-red-700">CRITICAL ALLERGIES</h2>
              {((payload.allergies as Array<Record<string, unknown>>) ?? []).map((allergy) => (
                <p key={String(allergy.id)} className="text-sm text-red-700">
                  {String((allergy.code as Record<string, unknown>).text)}
                </p>
              ))}
            </Card>
            <Card>
              <h2 className="mb-2 text-lg font-semibold text-slate-900">Current Medications</h2>
              {((payload.medications as Array<Record<string, unknown>>) ?? []).map((medication) => (
                <p key={String(medication.id)} className="text-sm text-slate-700">
                  {String((medication.medicationCodeableConcept as Record<string, unknown>).text)}
                </p>
              ))}
            </Card>
            <Card>
              <h2 className="mb-2 text-lg font-semibold text-slate-900">Active Conditions</h2>
              {((payload.conditions as Array<Record<string, unknown>>) ?? []).map((condition) => (
                <p key={String(condition.id)} className="text-sm text-slate-700">
                  {String((condition.code as Record<string, unknown>).text)}
                </p>
              ))}
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
