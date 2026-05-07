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
    const query = value.trim();
    if (!query) return;
    // Pass anything through; the score page validates and falls back to symbol
    // search when the input is a company name like "Apple" instead of "AAPL".
    router.push(`/score/${encodeURIComponent(query)}`);
  }

  return (
    <form className={`ticker-search ${size}`} onSubmit={onSubmit}>
      <input
        type="text"
        placeholder={size === "compact" ? "AAPL or Apple" : "Ticker or company name — AAPL, Apple, Tesla…"}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        autoComplete="off"
        spellCheck={false}
        aria-label="Stock ticker or company name"
        maxLength={48}
      />
      <button type="submit" aria-label="Get score">
        {size === "compact" ? "→" : "Get Score"}
      </button>
    </form>
  );
}
