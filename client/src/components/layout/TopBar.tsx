import { ReactNode } from "react";

export default function TopBar({ children }: { children: ReactNode }): JSX.Element {
  return <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">{children}</div>;
}
