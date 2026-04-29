import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Alert from "../components/ui/Alert";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import CountdownTimer from "../components/ui/CountdownTimer";
import OtpInput from "../components/ui/OtpInput";
import Spinner from "../components/ui/Spinner";
import { useAuth } from "../hooks/useAuth";
import {
  getDevLastOtp,
  patientLogin,
  providerLogin,
  providerLookupPatient,
  requestProviderOtp,
  verifyProviderOtp,
} from "../services/auth";

function resolveApiErrorMessage(err: unknown): string {
  const responseMessage = (err as { response?: { data?: { message?: string } } }).response?.data?.message;
  if (responseMessage) {
    return responseMessage;
  }
  return "Unable to reach MedMemory API. Check if server and Neo4j are running.";
}

export default function Login(): JSX.Element {
  const navigate = useNavigate();
  const { setSession, setProviderSessionToken, providerSessionToken } = useAuth();

  const [role, setRole] = useState<"patient" | "provider" | null>(null);
  const [providerStep, setProviderStep] = useState(1);

  const [patientAbhaId, setPatientAbhaId] = useState("");
  const [patientPassword, setPatientPassword] = useState("");

  const [providerLoginId, setProviderLoginId] = useState("");
  const [providerPassword, setProviderPassword] = useState("");
  const [lookupAbhaId, setLookupAbhaId] = useState("");
  const [patientLookup, setPatientLookup] = useState<Record<string, unknown> | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [otpExpiry, setOtpExpiry] = useState(300);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (role !== "provider" || providerStep !== 3) {
      return;
    }
    if (devOtp) {
      return;
    }

    void getDevLastOtp()
      .then((otp) => setDevOtp(otp))
      .catch(() => undefined);
  }, [providerStep, role, devOtp]);

  const onPatientLogin = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (!patientAbhaId || !patientPassword) {
        setError("ABHA ID and password are required");
        return;
      }
      const response = await patientLogin({ abhaId: patientAbhaId, password: patientPassword });
      setSession(response.token, {
        role: "patient",
        patientId: response.patient?.id,
        abhaId: response.patient?.abhaId,
        authorised: true,
      });
      navigate("/patient");
    } catch (err) {
      setError(resolveApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const onProviderLogin = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (!providerLoginId || !providerPassword) {
        setError("Provider login ID and password are required");
        return;
      }
      const response = await providerLogin({ loginId: providerLoginId, password: providerPassword });
      setProviderSessionToken(response.providerSessionToken);
      setProviderStep(2);
    } catch (err) {
      setError(resolveApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const onLookupPatient = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!providerSessionToken) {
      setError("Provider session is missing. Login again.");
      return;
    }

    setError("");
    setLoading(true);
    try {
      const data = await providerLookupPatient(providerSessionToken, lookupAbhaId);
      setPatientLookup(data);
    } catch (err) {
      setError(resolveApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const onRequestOtp = async (): Promise<void> => {
    if (!providerSessionToken || !patientLookup?.patientId) {
      setError("Lookup patient first");
      return;
    }
    setError("");
    setLoading(true);

    try {
      const response = await requestProviderOtp(providerSessionToken, String(patientLookup.patientId));
      setOtpExpiry(Number(response.expiresIn ?? 300));
      if (response.devOtp) {
        setDevOtp(response.devOtp);
      } else {
        // Dev OTP fetch is best-effort; production may return 404.
        try {
          const otp = await getDevLastOtp();
          setDevOtp(otp);
        } catch {
          setDevOtp(null);
        }
      }
      setProviderStep(3);
    } catch (err) {
      setError(resolveApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const onVerifyOtp = async (): Promise<void> => {
    if (!providerSessionToken || !patientLookup?.patientId || otpCode.length !== 6) {
      setError("Enter a valid 6-digit OTP");
      return;
    }
    setError("");
    setLoading(true);

    try {
      const response = await verifyProviderOtp(providerSessionToken, String(patientLookup.patientId), otpCode);
      setSession(response.token, {
        role: "provider",
        authorised: true,
        patientId: response.patientId,
        providerName: "Dr. Meera Pillai",
        scopes: response.scopes,
      });
      navigate("/clinician");
    } catch (err) {
      setError(resolveApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-slate-900">MedMemory OS</h1>
          <p className="text-slate-600">The AI brain for fragmented health records</p>
        </div>

        {error && <Alert message={error} severity="critical" />}

        {!role && (
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="cursor-pointer" onClick={() => setRole("patient")}>
              <h2 className="text-xl font-semibold text-slate-900">I am a Patient</h2>
              <p className="mt-2 text-sm text-slate-600">Access my own consolidated records.</p>
            </Card>
            <Card className="cursor-pointer" onClick={() => setRole("provider")}>
              <h2 className="text-xl font-semibold text-slate-900">I am a Provider (Doctor / Specialist)</h2>
              <p className="mt-2 text-sm text-slate-600">Access records with patient OTP consent.</p>
            </Card>
          </div>
        )}

        {role === "patient" && (
          <Card>
            <h2 className="mb-4 text-lg font-semibold text-slate-900">Patient login</h2>
            <form className="space-y-3" onSubmit={(event) => void onPatientLogin(event)}>
              <input
                value={patientAbhaId}
                onChange={(event) => setPatientAbhaId(event.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2"
                placeholder="ABHA-XXXX-XXXX"
              />
              <input
                type="password"
                value={patientPassword}
                onChange={(event) => setPatientPassword(event.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2"
                placeholder="Password"
              />
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={loading}>
                  {loading ? <Spinner /> : "Login"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setPatientAbhaId("ABHA-1001-2024");
                    setPatientPassword("Demo@1234");
                  }}
                >
                  Use demo patient (Priya Sharma)
                </Button>
                <Button type="button" variant="ghost" onClick={() => setRole(null)}>
                  Back
                </Button>
              </div>
            </form>
          </Card>
        )}

        {role === "provider" && (
          <Card>
            <div className="mb-4 flex items-center gap-2">
              {[1, 2, 3, 4].map((step) => (
                <Badge key={step} label={`Step ${step}`} tone={step === providerStep ? "info" : "default"} />
              ))}
            </div>

            {providerStep === 1 && (
              <form className="space-y-3" onSubmit={(event) => void onProviderLogin(event)}>
                <h2 className="text-lg font-semibold text-slate-900">Provider credentials</h2>
                <input
                  value={providerLoginId}
                  onChange={(event) => setProviderLoginId(event.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2"
                  placeholder="doctor@hospital.in"
                />
                <input
                  type="password"
                  value={providerPassword}
                  onChange={(event) => setProviderPassword(event.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2"
                  placeholder="Password"
                />
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" disabled={loading}>
                    {loading ? <Spinner /> : "Continue"}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setProviderLoginId("dr.meera@medmemory.in");
                      setProviderPassword("Doctor@1234");
                    }}
                  >
                    Use demo provider (Dr. Meera Pillai)
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setRole(null)}>
                    Back
                  </Button>
                </div>
              </form>
            )}

            {providerStep === 2 && (
              <form className="space-y-3" onSubmit={(event) => void onLookupPatient(event)}>
                <h2 className="text-lg font-semibold text-slate-900">Patient lookup</h2>
                <input
                  value={lookupAbhaId}
                  onChange={(event) => setLookupAbhaId(event.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2"
                  placeholder="Enter patient ABHA ID"
                />
                <Button type="submit" disabled={loading}>
                  {loading ? <Spinner /> : "Lookup"}
                </Button>
                {patientLookup && (
                  <div className="rounded-lg border border-slate-200 p-4">
                    <p className="font-semibold text-slate-900">{String(patientLookup.name)}</p>
                    <p className="text-sm text-slate-600">
                      {String(patientLookup.age)} years | {String(patientLookup.gender)} | {String(patientLookup.maskedPhone)}
                    </p>
                    <Button className="mt-3" onClick={() => void onRequestOtp()}>
                      Request patient consent OTP
                    </Button>
                  </div>
                )}
              </form>
            )}

            {providerStep === 3 && (
              <div className="space-y-3">
                <h2 className="text-lg font-semibold text-slate-900">OTP dispatch confirmation</h2>
                <p className="text-sm text-slate-700">
                  An OTP has been sent to the patient&apos;s registered mobile ending in {String(patientLookup?.maskedPhone)}
                </p>
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
                  <p className="text-sm font-semibold text-amber-800">DEV MODE</p>
                  <p className="text-sm text-amber-700">
                    In production this OTP goes to patient&apos;s phone: <span className="font-bold">{devOtp ?? "Not available"}</span>
                  </p>
                </div>
                <div className="text-sm text-slate-700">
                  OTP expires in: <CountdownTimer seconds={otpExpiry} />
                </div>
                <Button onClick={() => setProviderStep(4)}>Enter OTP</Button>
              </div>
            )}

            {providerStep === 4 && (
              <div className="space-y-3">
                <h2 className="text-lg font-semibold text-slate-900">Enter patient OTP</h2>
                <OtpInput onComplete={(otp) => setOtpCode(otp)} error={Boolean(error)} />
                <Button onClick={() => void onVerifyOtp()} disabled={loading || otpCode.length !== 6}>
                  {loading ? <Spinner /> : "Verify & Access Records"}
                </Button>
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
