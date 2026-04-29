interface BadgeProps {
  label: string;
  tone?: "default" | "critical" | "warning" | "success" | "info";
}

const toneClasses = {
  default: "bg-slate-100 text-slate-700",
  critical: "bg-red-50 text-red-700",
  warning: "bg-amber-50 text-amber-700",
  success: "bg-green-50 text-green-700",
  info: "bg-blue-50 text-blue-700",
};

export default function Badge({ label, tone = "default" }: BadgeProps): JSX.Element {
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${toneClasses[tone]}`}>{label}</span>;
}
