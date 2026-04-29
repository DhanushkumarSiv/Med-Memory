import { useEffect, useMemo, useState } from "react";

export default function CountdownTimer({ seconds }: { seconds: number }): JSX.Element {
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    setRemaining(seconds);
  }, [seconds]);

  useEffect(() => {
    if (remaining <= 0) {
      return;
    }
    const timer = window.setInterval(() => setRemaining((prev) => Math.max(prev - 1, 0)), 1000);
    return () => window.clearInterval(timer);
  }, [remaining]);

  const display = useMemo(() => {
    const minutes = Math.floor(remaining / 60)
      .toString()
      .padStart(2, "0");
    const secs = (remaining % 60).toString().padStart(2, "0");
    return `${minutes}:${secs}`;
  }, [remaining]);

  return <span className={`font-mono text-sm ${remaining < 60 ? "text-red-600" : "text-slate-700"}`}>{display}</span>;
}
