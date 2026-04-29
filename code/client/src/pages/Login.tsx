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

function resolveApiErrorMessage(err: unknown): string | null {
  const responseMessage = (err as { response?: { data?: { message?: string } } }).response?.data?.message;
  if (responseMessage) {
    return responseMessage;
  }
  return null;
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
      const message = resolveApiErrorMessage(err);
      setError(message ?? "");
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
      const message = resolveApiErrorMessage(err);
      setError(message ?? "");
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
      const message = resolveApiErrorMessage(err);
      setError(message ?? "");
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
      const message = resolveApiErrorMessage(err);
      setError(message ?? "");
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
      const message = resolveApiErrorMessage(err);
      setError(message ?? "");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,#EFF6FF_0%,#F8FAFC_52%,#F1F5F9_100%)]">
      <div className="pointer-events-none absolute -left-24 -top-20 h-80 w-80 rounded-full bg-blue-200/30 blur-3xl" />
      <div className="pointer-events-none absolute -right-28 top-10 h-96 w-96 rounded-full bg-cyan-200/25 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 left-1/3 h-80 w-80 rounded-full bg-teal-200/20 blur-3xl" />

      <div className="relative mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-4 sm:px-8 sm:py-6">
        <nav className="mb-6 flex items-center justify-between rounded-xl border border-slate-200/70 bg-white/70 px-4 py-3 backdrop-blur sm:px-6">
          <span className="text-sm font-semibold text-[#0F172A] sm:text-base">MedMemory OS</span>
          <button type="button" className="text-xs font-medium text-[#64748B] transition hover:text-[#334155]">
            Help
          </button>
        </nav>

        <main className="flex flex-1 items-center justify-center">
          <div className={`w-full ${role ? "max-w-3xl" : "max-w-5xl"}`}>
            {error && <Alert message={error} severity="critical" />}

            {!role && (
              <div className="space-y-8">
                <div className="text-center">
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-blue-100 bg-white shadow-sm">
                    <svg viewBox="0 0 24 24" className="h-8 w-8 text-[#2563EB]" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M12 20S4 15.2 4 9.4C4 6.5 6.3 4.2 9.2 4.2C10.8 4.2 12 5 12.8 6.2C13.6 5 14.8 4.2 16.4 4.2C19.3 4.2 21.6 6.5 21.6 9.4C21.6 15.2 13.6 20 12 20Z" />
                      <path d="M8 12H10.2L11.4 9.8L13 14.2L14.1 12.8H16.6" />
                    </svg>
                  </div>
                  <h1 className="text-[2rem] font-bold text-[#0F172A] sm:text-[2.5rem]">MedMemory OS</h1>
                  <p className="mt-2 text-sm text-[#64748B] sm:text-base">The AI brain for fragmented health records</p>
                  <p className="mt-2 text-[11px] text-slate-500 sm:text-xs">
                    🔒 ABDM compliant · End-to-end encrypted · Consent-based access
                  </p>
                </div>

                <div className="grid gap-5 sm:gap-6 md:grid-cols-2">
                  <Card
                    className="group relative flex min-h-[220px] cursor-pointer flex-col overflow-hidden rounded-2xl border-[0.5px] border-slate-200 bg-white p-6 transition-all duration-200 ease-in-out hover:-translate-y-1 hover:shadow-[0_8px_30px_rgba(0,0,0,0.10)] hover:border-[#2563EB]/50"
                    onClick={() => setRole("patient")}
                  >
                    <div className="absolute inset-x-0 top-0 h-1 bg-[#2563EB]" />
                    <div className="mt-2 mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-blue-50 text-[#2563EB]">
                      <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <circle cx="12" cy="8" r="3.7" />
                        <path d="M5.5 19.5C5.5 16.1 8.3 13.7 12 13.7C15.7 13.7 18.5 16.1 18.5 19.5" />
                      </svg>
                    </div>
                    <h2 className="text-[1.2rem] font-semibold text-[#0F172A]">I am a Patient</h2>
                    <p className="mt-2 text-sm text-slate-500">Access my own consolidated records.</p>
                    <p className="mt-auto pt-8 text-right text-sm font-semibold text-[#2563EB]">Continue →</p>
                  </Card>

                  <Card
                    className="group relative flex min-h-[220px] cursor-pointer flex-col overflow-hidden rounded-2xl border-[0.5px] border-slate-200 bg-white p-6 transition-all duration-200 ease-in-out hover:-translate-y-1 hover:shadow-[0_8px_30px_rgba(0,0,0,0.10)] hover:border-[#0D9488]/50"
                    onClick={() => setRole("provider")}
                  >
                    <div className="absolute inset-x-0 top-0 h-1 bg-[#0D9488]" />
                    <div className="mt-2 mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-teal-50 text-[#0D9488]">
                      <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <path d="M8.5 4.5H15.5V11.5H8.5Z" />
                        <path d="M12 2.8V6.3" />
                        <path d="M12 9.7V13.2" />
                        <path d="M6.8 8H10.3" />
                        <path d="M13.7 8H17.2" />
                        <path d="M13.5 13.5L20.5 20.5" />
                      </svg>
                    </div>
                    <h2 className="text-[1.2rem] font-semibold text-[#0F172A]">I am a Provider (Doctor / Specialist)</h2>
                    <p className="mt-2 text-sm text-slate-500">Access records with patient OTP consent.</p>
                    <p className="mt-auto pt-8 text-right text-sm font-semibold text-[#0D9488]">Continue →</p>
                  </Card>
                </div>
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
        </main>

        {!role && (
          <footer className="pt-6 text-center text-[11px] text-[#94A3B8]">
            MedMemory OS · Secure Health Intelligence Platform · v1.0
          </footer>
        )}
      </div>
    </div>
  );
}
