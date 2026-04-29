import { ReactNode } from "react";

export default function PageWrapper({
  title,
  children,
  showTitle = true,
}: {
  title: string;
  children: ReactNode;
  showTitle?: boolean;
}): JSX.Element {
  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-4">
        {showTitle ? <h1 className="text-2xl font-bold text-slate-900">{title}</h1> : null}
        {children}
      </div>
    </div>
  );
}
