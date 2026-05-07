"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

type Props = {
  initialValue?: string;
  size?: "compact" | "full";
};

type Match = {
  symbol: string;
  name: string;
  exchange: string;
};

const DEBOUNCE_MS = 200;
const MAX_RESULTS = 7;
const MIN_CHARS = 1;

export default function TickerSearch({ initialValue = "", size = "full" }: Props) {
  const router = useRouter();
  const [value, setValue] = useState(initialValue);
  const [matches, setMatches] = useState<Match[]>([]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);

  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastQueryRef = useRef<string>("");

  // Debounced search-as-you-type.
  useEffect(() => {
    const q = value.trim();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.length < MIN_CHARS) {
      setMatches([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      if (abortRef.current) abortRef.current.abort();
      abortRef.current = new AbortController();
      lastQueryRef.current = q;
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
          signal: abortRef.current.signal,
        });
        if (!res.ok) return;
        const json = (await res.json()) as { matches: Match[] };
        // Drop stale responses if user has typed past this query.
        if (lastQueryRef.current !== q) return;
        const results = (json.matches ?? []).slice(0, MAX_RESULTS);
        setMatches(results);
        setHighlight(0);
        setOpen(results.length > 0);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        setMatches([]);
      }
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value]);

  // Click outside closes the dropdown.
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const navigate = useCallback(
    (target: string) => {
      setOpen(false);
      router.push(`/score/${encodeURIComponent(target)}`);
    },
    [router]
  );

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const picked = matches[highlight];
    if (picked) {
      navigate(picked.symbol);
    } else if (value.trim()) {
      // No suggestions yet (user submitted before debounce fired) — let the
      // score page run its own search fallback.
      navigate(value.trim());
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!open || matches.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => (h + 1) % matches.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => (h - 1 + matches.length) % matches.length);
    } else if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <div className={`ticker-search-wrap ${size}`} ref={wrapRef}>
      <form className={`ticker-search ${size}`} onSubmit={onSubmit} role="search">
        <input
          ref={inputRef}
          type="text"
          placeholder={size === "compact" ? "AAPL or Apple" : "Ticker or company name — AAPL, Apple, Tesla…"}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={() => matches.length > 0 && setOpen(true)}
          onKeyDown={onKeyDown}
          autoComplete="off"
          spellCheck={false}
          aria-label="Stock ticker or company name"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls="ticker-search-listbox"
          aria-activedescendant={open ? `ticker-search-opt-${highlight}` : undefined}
          maxLength={48}
        />
        <button type="submit" aria-label="Get score">
          {size === "compact" ? "→" : "Get Score"}
        </button>
      </form>

      {open && matches.length > 0 && (
        <ul
          className={`search-dropdown ${size}`}
          id="ticker-search-listbox"
          role="listbox"
          aria-label="Search suggestions"
        >
          {matches.map((m, i) => (
            <li
              key={m.symbol}
              id={`ticker-search-opt-${i}`}
              role="option"
              aria-selected={i === highlight}
              className={`search-option ${i === highlight ? "highlighted" : ""}`}
              onMouseEnter={() => setHighlight(i)}
              onMouseDown={(e) => {
                // mousedown so we beat the input blur
                e.preventDefault();
                navigate(m.symbol);
              }}
            >
              <span className="opt-symbol">{m.symbol}</span>
              <span className="opt-name">{m.name}</span>
              <span className="opt-exchange">{m.exchange}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
