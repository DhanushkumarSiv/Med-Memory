import { useState } from "react";

interface AlertProps {
  message: string;
  severity?: "info" | "success" | "warning" | "critical";
}

const severityClasses = {
  info: "border-blue-200 bg-blue-50 text-blue-700",
  success: "border-green-200 bg-green-50 text-green-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  critical: "border-red-200 bg-red-50 text-red-700",
};

export default function Alert({ message, severity = "info" }: AlertProps): JSX.Element | null {
  const [visible, setVisible] = useState(true);
  if (!visible) {
    return null;
  }

  return (
    <div className={`flex items-center justify-between rounded-lg border px-4 py-3 text-sm ${severityClasses[severity]}`}>
      <span>{message}</span>
      <button type="button" className="font-semibold" onClick={() => setVisible(false)}>
        Dismiss
      </button>
    </div>
  );
}
