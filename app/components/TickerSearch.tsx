"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

type Props = {
  initialValue?: string;
  size?: "compact" | "full";
};

export default function TickerSearch({ initialValue = "", size = "full" }: Props) {
  const router = useRouter();
  const [value, setValue] = useState(initialValue);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const ticker = value.trim().toUpperCase();
    if (!ticker) return;
    if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(ticker)) return;
    router.push(`/score/${ticker}`);
  }

  return (
    <form className={`ticker-search ${size}`} onSubmit={onSubmit}>
      <input
        type="text"
        placeholder={size === "compact" ? "AAPL" : "Enter a ticker — AAPL, NVDA, TSLA…"}
        value={value}
        onChange={(e) => setValue(e.target.value.toUpperCase())}
        autoComplete="off"
        spellCheck={false}
        autoCapitalize="characters"
        aria-label="Stock ticker"
        maxLength={10}
      />
      <button type="submit" aria-label="Get score">
        {size === "compact" ? "→" : "Get Score"}
      </button>
    </form>
  );
}
