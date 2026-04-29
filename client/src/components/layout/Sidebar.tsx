import { ReactNode } from "react";

export default function Sidebar({ children }: { children: ReactNode }): JSX.Element {
  return <aside className="w-full space-y-4 rounded-xl border border-slate-200 bg-white p-4 lg:w-80">{children}</aside>;
}
