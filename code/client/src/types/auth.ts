export interface AuthUser {
  role: "patient" | "provider";
  authorised?: boolean;
  patientId?: string;
  providerId?: string;
  providerName?: string;
  abhaId?: string;
  scopes?: string[];
  consentToken?: string;
}

export interface PatientLoginRequest {
  abhaId: string;
  password: string;
}

export interface ProviderLoginRequest {
  loginId: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  role: "patient" | "provider";
  authorised?: boolean;
  patient?: {
    id: string;
    name: string;
    abhaId: string;
    dob: string;
    gender: string;
    phone: string;
  };
  patientId?: string;
  scopes?: string[];
}

export interface ProviderSessionResponse {
  providerSessionToken: string;
  role: "provider";
  authorised: false;
}
