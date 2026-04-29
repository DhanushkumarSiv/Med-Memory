export default function Spinner({ className = "" }: { className?: string }): JSX.Element {
  return <div className={`h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600 ${className}`} />;
}
