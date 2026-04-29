import { KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";

interface OtpInputProps {
  length?: number;
  onComplete: (otp: string) => void;
  error?: boolean;
  disabled?: boolean;
}

export default function OtpInput({
  length = 6,
  onComplete,
  error = false,
  disabled = false,
}: OtpInputProps): JSX.Element {
  const [values, setValues] = useState<string[]>(Array.from({ length }, () => ""));
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    setValues(Array.from({ length }, () => ""));
  }, [length]);

  useEffect(() => {
    const complete = values.every((value) => value !== "");
    if (complete) {
      onComplete(values.join(""));
    }
  }, [values, onComplete]);

  const isSuccess = useMemo(() => values.every((value) => value !== "") && !error, [values, error]);

  const updateAtIndex = (index: number, nextChar: string): void => {
    if (!/^\d?$/.test(nextChar)) {
      return;
    }

    setValues((prev) => {
      const next = [...prev];
      next[index] = nextChar;
      return next;
    });

    if (nextChar && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>, index: number): void => {
    if (event.key === "Backspace" && values[index] === "" && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (text: string): void => {
    const digits = text.replace(/\D/g, "").slice(0, length).split("");
    if (digits.length === 0) {
      return;
    }

    setValues((prev) => prev.map((_v, index) => digits[index] ?? ""));
    const focusIndex = Math.min(digits.length, length - 1);
    inputRefs.current[focusIndex]?.focus();
  };

  return (
    <div className={`flex gap-2 ${error ? "animate-shake" : ""}`}>
      {values.map((value, index) => (
        <input
          key={index}
          ref={(node) => {
            inputRefs.current[index] = node;
          }}
          value={value}
          disabled={disabled}
          maxLength={1}
          className={`h-12 w-12 rounded-lg border text-center text-xl font-semibold outline-none transition ${
            error
              ? "border-red-400"
              : isSuccess
                ? "border-green-500"
                : "border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
          }`}
          onChange={(event) => updateAtIndex(index, event.target.value.slice(-1))}
          onKeyDown={(event) => handleKeyDown(event, index)}
          onPaste={(event) => {
            event.preventDefault();
            handlePaste(event.clipboardData.getData("text"));
          }}
        />
      ))}
    </div>
  );
}
