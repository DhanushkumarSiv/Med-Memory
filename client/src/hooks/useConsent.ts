import { useEffect, useState } from "react";
import api from "../services/api";
import { AuditEntry, ConsentToken } from "../types/patient";

export function useConsent(patientId: string | null): {
  tokens: ConsentToken[];
  pendingOtps: Record<string, unknown>[];
  audit: AuditEntry[];
  loading: boolean;
  reload: () => Promise<void>;
  grant: (payload: { providerName: string; providerType: string; scopes: string[]; expiresAt: string }) => Promise<void>;
  revoke: (tokenId: string) => Promise<void>;
  denyOtp: (otpId: string) => Promise<void>;
} {
  const [tokens, setTokens] = useState<ConsentToken[]>([]);
  const [pendingOtps, setPendingOtps] = useState<Record<string, unknown>[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async (): Promise<void> => {
    if (!patientId) {
      return;
    }

    setLoading(true);
    try {
      const [tokensRes, pendingRes, auditRes] = await Promise.all([
        api.get<ConsentToken[]>(`/consent/${patientId}`),
        api.get<Record<string, unknown>[]>(`/consent/${patientId}/pending-otps`),
        api.get<AuditEntry[]>(`/audit/${patientId}`),
      ]);
      setTokens(tokensRes.data);
      setPendingOtps(pendingRes.data);
      setAudit(auditRes.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    if (!patientId) {
      return;
    }

    const timer = window.setInterval(() => {
      void api
        .get<Record<string, unknown>[]>(`/consent/${patientId}/pending-otps`)
        .then((res) => setPendingOtps(res.data))
        .catch(() => undefined);
    }, 10000);

    return () => window.clearInterval(timer);
  }, [patientId]);

  const grant = async (payload: {
    providerName: string;
    providerType: string;
    scopes: string[];
    expiresAt: string;
  }): Promise<void> => {
    if (!patientId) {
      return;
    }

    await api.post(`/consent/${patientId}/grant`, payload);
    await load();
  };

  const revoke = async (tokenId: string): Promise<void> => {
    if (!patientId) {
      return;
    }
    await api.delete(`/consent/${patientId}/revoke/${tokenId}`);
    await load();
  };

  const denyOtp = async (otpId: string): Promise<void> => {
    if (!patientId) {
      return;
    }
    await api.post(`/consent/${patientId}/pending-otps/${otpId}/deny`);
    await load();
  };

  return { tokens, pendingOtps, audit, loading, reload: load, grant, revoke, denyOtp };
}
