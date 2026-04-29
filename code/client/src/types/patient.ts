export interface PatientProfile {
  id: string;
  name: string;
  abhaId: string;
  dob: string;
  gender: string;
  phone?: string;
}

export interface ConsentToken {
  id: string;
  token: string;
  providerName: string;
  providerType: string;
  scopes: string;
  grantedAt: string;
  expiresAt: string;
  revokedAt: string | null;
}

export interface AuditEntry {
  id: string;
  accessor: string;
  action: string;
  resourceAccessed: string;
  consentTokenUsed: string;
  accessedAt: string;
}
