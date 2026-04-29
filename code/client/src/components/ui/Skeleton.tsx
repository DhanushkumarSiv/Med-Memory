export default function Skeleton({ className = "" }: { className?: string }): JSX.Element {
  return <div className={`animate-pulse rounded-md bg-slate-200 ${className}`} />;
}
