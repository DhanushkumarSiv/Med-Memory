import { useEffect, useState } from "react";
import api from "../services/api";
import { FhirSummary } from "../types/fhir";
import { PatientProfile } from "../types/patient";

export function usePatient(patientId: string | null): {
  patient: PatientProfile | null;
  summary: FhirSummary | null;
  loading: boolean;
  reload: () => Promise<void>;
} {
  const [patient, setPatient] = useState<PatientProfile | null>(null);
  const [summary, setSummary] = useState<FhirSummary | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async (): Promise<void> => {
    if (!patientId) {
      return;
    }

    setLoading(true);
    try {
      const [patientRes, summaryRes] = await Promise.all([
        api.get<PatientProfile>(`/patients/${patientId}`),
        api.get<FhirSummary>(`/patients/${patientId}/fhir-summary`),
      ]);
      setPatient(patientRes.data);
      setSummary(summaryRes.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [patientId]);

  return { patient, summary, loading, reload: load };
}
