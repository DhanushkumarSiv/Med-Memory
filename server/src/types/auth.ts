import { JwtPayload } from "jsonwebtoken";

export interface AuthUser extends JwtPayload {
  role: "patient" | "provider";
  patientId?: string;
  abhaId?: string;
  providerId?: string;
  providerName?: string;
  authorised?: boolean;
  scopes?: string[];
  consentToken?: string;
}
