import api from "./api";
import {
  AuthResponse,
  PatientLoginRequest,
  ProviderLoginRequest,
  ProviderOtpRequestResponse,
  ProviderSessionResponse,
} from "../types/auth";

export async function patientLogin(payload: PatientLoginRequest): Promise<AuthResponse> {
  const response = await api.post<AuthResponse>("/auth/patient/login", payload);
  return response.data;
}

export async function providerLogin(payload: ProviderLoginRequest): Promise<ProviderSessionResponse> {
  const response = await api.post<ProviderSessionResponse>("/auth/provider/login", payload);
  return response.data;
}

export async function providerLookupPatient(providerSessionToken: string, abhaId: string): Promise<Record<string, unknown>> {
  const response = await api.post(
    "/auth/provider/lookup-patient",
    { abhaId },
    { headers: { Authorization: `Bearer ${providerSessionToken}` } }
  );
  return response.data as Record<string, unknown>;
}

export async function requestProviderOtp(
  providerSessionToken: string,
  patientId: string
): Promise<ProviderOtpRequestResponse> {
  const response = await api.post<ProviderOtpRequestResponse>(
    "/auth/provider/request-otp",
    { patientId },
    { headers: { Authorization: `Bearer ${providerSessionToken}` } }
  );
  return response.data;
}

export async function verifyProviderOtp(
  providerSessionToken: string,
  patientId: string,
  otp: string
): Promise<AuthResponse> {
  const response = await api.post<AuthResponse>(
    "/auth/provider/verify-otp",
    { patientId, otp },
    { headers: { Authorization: `Bearer ${providerSessionToken}` } }
  );
  return response.data;
}

export async function getDevLastOtp(): Promise<string | null> {
  const response = await api.get<{ otp: string | null }>("/auth/dev/last-otp");
  return response.data.otp;
}
