import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./hooks/useAuth";
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
  return (
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
  );
};

export default function App(): JSX.Element {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
