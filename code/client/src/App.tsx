import { Navigate, Route, Routes } from "react-router-dom";
import Button from "./components/ui/Button";
import { AuthProvider, useAuth } from "./hooks/useAuth";
import { useServiceHealth } from "./hooks/useServiceHealth";
import ClinicianDashboard from "./pages/ClinicianDashboard";
import ConsentManager from "./pages/ConsentManager";
import DemoPage from "./pages/Demo";
import EmergencyView from "./pages/EmergencyView";
import Login from "./pages/Login";
import PatientApp from "./pages/PatientApp";

function RequireAuth({ children, role }: { children: JSX.Element; role?: "patient" | "provider" }): JSX.Element {
  const { user } = useAuth();
  if (!user) {
    return <Navigate to="/" replace />;
  }

  if (role && user.role !== role) {
    return <Navigate to="/" replace />;
  }

  return children;
}

const AppRoutes = (): JSX.Element => {
  const { state, message, loading, retry } = useServiceHealth();

  return (
    <div>
      {state !== "healthy" && (
        <div
          className={`mx-auto my-3 flex w-[min(1100px,95%)] items-center justify-between rounded-lg border px-4 py-3 text-sm ${
            state === "neo4j-down"
              ? "border-amber-200 bg-amber-50 text-amber-800"
              : state === "api-down"
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-blue-200 bg-blue-50 text-blue-700"
          }`}
        >
          <div>
            <p className="font-medium">
              {state === "checking"
                ? "Checking MedMemory services..."
                : state === "api-down"
                  ? "API service is down."
                  : "Neo4j service is down."}
            </p>
            <p className="text-xs opacity-90">{message} Auto-retrying every 10 seconds.</p>
          </div>
          <Button type="button" variant="secondary" size="sm" disabled={loading} onClick={() => void retry()}>
            {loading ? "Retrying..." : "Retry now"}
          </Button>
        </div>
      )}

      <Routes>
        <Route path="/" element={<Login />} />
        <Route
          path="/clinician"
          element={
            <RequireAuth role="provider">
              <ClinicianDashboard />
            </RequireAuth>
          }
        />
        <Route
          path="/patient"
          element={
            <RequireAuth role="patient">
              <PatientApp />
            </RequireAuth>
          }
        />
        <Route
          path="/consent/:patientId"
          element={
            <RequireAuth>
              <ConsentManager />
            </RequireAuth>
          }
        />
        <Route path="/emergency/:abhaId" element={<EmergencyView />} />
        <Route path="/demo" element={<DemoPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
};

export default function App(): JSX.Element {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
