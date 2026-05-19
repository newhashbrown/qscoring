"use client";

import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { pairToSlug } from "@/lib/compare";

export type UniverseEntry = { symbol: string; name: string; sector?: string };

type Props = {
  universe: ReadonlyArray<UniverseEntry>;
};

const MAX_RESULTS = 7;

// Symbol-prefix beats symbol-substring beats company-name match. Keeps the
// common case (user typed "AAPL") at the top while still surfacing
// "Apple Inc." when the user types a company name.
function filterUniverse(
  query: string,
  universe: ReadonlyArray<UniverseEntry>,
  excludeSymbol?: string
): UniverseEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const symPrefix: UniverseEntry[] = [];
  const symSub: UniverseEntry[] = [];
  const nameMatch: UniverseEntry[] = [];
  for (const e of universe) {
    if (excludeSymbol && e.symbol === excludeSymbol) continue;
    const sym = e.symbol.toLowerCase();
    const name = e.name.toLowerCase();
    if (sym.startsWith(q)) symPrefix.push(e);
    else if (sym.includes(q)) symSub.push(e);
    else if (name.includes(q)) nameMatch.push(e);
  }
  return [...symPrefix, ...symSub, ...nameMatch].slice(0, MAX_RESULTS);
}

type TickerComboProps = {
  label: string;
  id: string;
  value: string;
  onChange: (v: string) => void;
  universe: ReadonlyArray<UniverseEntry>;
  excludeSymbol?: string;
};

function TickerCombo({
  label,
  id,
  value,
  onChange,
  universe,
  excludeSymbol,
}: TickerComboProps) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  const matches = useMemo(
    () => filterUniverse(value, universe, excludeSymbol),
    [value, universe, excludeSymbol]
  );

  // Reset highlight when the visible list changes so it can't point past
  // the new end of the array.
  useEffect(() => {
    setHighlight(0);
  }, [value]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function commit(symbol: string) {
    onChange(symbol);
    setOpen(false);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!open || matches.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => (h + 1) % matches.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => (h - 1 + matches.length) % matches.length);
    } else if (e.key === "Enter") {
      const picked = matches[highlight];
      if (picked) {
        // Stop the form from submitting on Enter when the user is picking
        // from the dropdown — they expect Enter to mean "select", not
        // "submit with this half-typed query".
        e.preventDefault();
        commit(picked.symbol);
      }
    } else if (e.key === "Escape" || e.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <div className="compare-combo" ref={wrapRef}>
      <label className="visually-hidden" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type="text"
        placeholder={label}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => matches.length > 0 && setOpen(true)}
        onKeyDown={onKeyDown}
        autoComplete="off"
        spellCheck={false}
        aria-label={label}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={`${id}-listbox`}
        aria-activedescendant={open ? `${id}-opt-${highlight}` : undefined}
        maxLength={12}
      />
      {open && matches.length > 0 && (
        <ul
          className="search-dropdown"
          id={`${id}-listbox`}
          role="listbox"
          aria-label={`${label} suggestions`}
        >
          {matches.map((m, i) => (
            <li
              key={m.symbol}
              id={`${id}-opt-${i}`}
              role="option"
              aria-selected={i === highlight}
              className={`search-option compare-option ${i === highlight ? "highlighted" : ""}`}
              onMouseEnter={() => setHighlight(i)}
              onMouseDown={(e) => {
                // mousedown beats the input's blur, so the dropdown click
                // doesn't get cancelled by focus loss.
                e.preventDefault();
                commit(m.symbol);
              }}
            >
              <span className="opt-symbol">{m.symbol}</span>
              <span className="opt-name">{m.name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function CompareForm({ universe }: Props) {
  const router = useRouter();
  const [a, setA] = useState("");
  const [b, setB] = useState("");

  const normalizedA = a.trim().toUpperCase();
  const normalizedB = b.trim().toUpperCase();
  const isInUniverseA = universe.some((u) => u.symbol === normalizedA);
  const isInUniverseB = universe.some((u) => u.symbol === normalizedB);
  const isDuplicate = isInUniverseA && isInUniverseB && normalizedA === normalizedB;
  const canCompare = isInUniverseA && isInUniverseB && !isDuplicate;

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canCompare) return;
    router.push(`/compare/${pairToSlug(normalizedA, normalizedB)}`);
  }

  // Surface at most one validation hint at a time — the first concrete
  // problem is the most useful nudge.
  let hint: string | null = null;
  if (a.trim() && !isInUniverseA) {
    hint = `${normalizedA} isn't in our universe — pick a ticker from the suggestions.`;
  } else if (b.trim() && !isInUniverseB) {
    hint = `${normalizedB} isn't in our universe — pick a ticker from the suggestions.`;
  } else if (isDuplicate) {
    hint = "Pick two different tickers to compare.";
  }

  return (
    <form
      className="compare-form"
      onSubmit={onSubmit}
      role="search"
      aria-label="Compare two tickers"
    >
      <div className="compare-form-row">
        <TickerCombo
          label="First ticker"
          id="compare-a"
          value={a}
          onChange={setA}
          universe={universe}
          excludeSymbol={isInUniverseB ? normalizedB : undefined}
        />
        <span className="compare-form-vs" aria-hidden="true">
          vs
        </span>
        <TickerCombo
          label="Second ticker"
          id="compare-b"
          value={b}
          onChange={setB}
          universe={universe}
          excludeSymbol={isInUniverseA ? normalizedA : undefined}
        />
        <button type="submit" disabled={!canCompare} aria-disabled={!canCompare}>
          Compare
        </button>
      </div>
      <p className="compare-form-hint" role="status" aria-live="polite">
        {hint ?? " "}
      </p>
    </form>
  );
}
