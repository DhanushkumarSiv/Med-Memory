interface TimelineItem {
  id: string;
  date: string;
  title: string;
  subtitle: string;
  badge: string;
}

export default function Timeline({ items }: { items: TimelineItem[] }): JSX.Element {
  if (items.length === 0) {
    return <p className="text-sm text-slate-500">No timeline entries available.</p>;
  }

  return (
    <div className="space-y-4 border-l-2 border-slate-200 pl-4">
      {items.map((item) => (
        <div key={item.id} className="relative">
          <div className="absolute -left-[22px] h-3 w-3 rounded-full bg-blue-600" />
          <p className="text-xs text-slate-500">{new Date(item.date).toLocaleString()}</p>
          <p className="text-sm font-semibold text-slate-900">{item.title}</p>
          <p className="text-sm text-slate-600">{item.subtitle}</p>
          <span className="mt-1 inline-block rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{item.badge}</span>
        </div>
      ))}
    </div>
  );
}
