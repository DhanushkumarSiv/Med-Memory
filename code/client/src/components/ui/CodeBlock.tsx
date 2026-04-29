export default function CodeBlock({ value }: { value: unknown }): JSX.Element {
  return (
    <pre className="max-h-80 overflow-auto rounded-lg bg-slate-900 p-4 text-xs text-slate-100">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}
