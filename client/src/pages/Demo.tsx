import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import CountdownTimer from "../components/ui/CountdownTimer";
import Spinner from "../components/ui/Spinner";
import { useAuth } from "../hooks/useAuth";
import { getDevLastOtp, providerLogin, providerLookupPatient, requestProviderOtp, verifyProviderOtp } from "../services/auth";

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function DemoPage(): JSX.Element {
  const navigate = useNavigate();
  const { setSession } = useAuth();
  const [running, setRunning] = useState(false);
  const [step, setStep] = useState(1);
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (running) {
      void runDemo();
    }
  }, [running]);

  const runDemo = async (): Promise<void> => {
    try {
      setStep(1);
      await wait(2000);

      setStep(2);
      const providerSession = await providerLogin({ loginId: "dr.meera@medmemory.in", password: "Doctor@1234" });
      await wait(2000);

      setStep(3);
      const patientLookup = await providerLookupPatient(providerSession.providerSessionToken, "ABHA-1001-2024");
      await requestProviderOtp(providerSession.providerSessionToken, String(patientLookup.patientId));
      setDevOtp(await getDevLastOtp());
      await wait(3000);

      setStep(4);
      const verify = await verifyProviderOtp(
        providerSession.providerSessionToken,
        String(patientLookup.patientId),
        String(await getDevLastOtp())
      );

      setSession(verify.token, {
        role: "provider",
        providerName: "Dr. Meera Pillai",
        patientId: verify.patientId,
        authorised: true,
        scopes: verify.scopes,
      });

      await wait(2000);
      navigate(
        "/clinician?highlight=egfr&autquery=Is%20this%20patient%20on%20medications%20that%20interact%20with%20CKD%3F"
      );
    } catch (err) {
      setError(((err as { response?: { data?: { message?: string } } }).response?.data?.message as string) ?? "Demo failed");
      setRunning(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <Card className="border-blue-200 bg-blue-50">
          <h1 className="text-xl font-bold text-blue-800">Live Hackathon Demo Mode</h1>
          <p className="text-sm text-blue-700">
            Dr. Meera Pillai is accessing Priya Sharma&apos;s records at a new hospital. Priya must consent via OTP.
          </p>
        </Card>

        <Card>
          <div className="space-y-2 text-sm text-slate-700">
            <p className={step >= 1 ? "font-semibold text-slate-900" : ""}>1. Narrative shown</p>
            <p className={step >= 2 ? "font-semibold text-slate-900" : ""}>2. Auto provider login and patient lookup</p>
            <p className={step >= 3 ? "font-semibold text-slate-900" : ""}>3. OTP sent and shown in DEV banner</p>
            <p className={step >= 4 ? "font-semibold text-slate-900" : ""}>4. OTP entered and verification complete</p>
          </div>

          {devOtp && (
            <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
              <p className="text-xs font-semibold text-amber-800">DEV MODE</p>
              <p className="text-sm text-amber-700">OTP sent to console: {devOtp}</p>
              <p className="text-xs text-amber-700">
                Auto-entering OTP in <CountdownTimer seconds={3} />
              </p>
            </div>
          )}

          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

          <Button className="mt-4" onClick={() => setRunning(true)} disabled={running}>
            {running ? <span className="flex items-center gap-2"><Spinner /> Running demo...</span> : "Start Demo"}
          </Button>
        </Card>
      </div>
    </div>
  );
}
