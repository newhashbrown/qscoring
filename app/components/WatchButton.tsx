"use client";

import { useState, type FormEvent } from "react";

type Status = "idle" | "submitting" | "success" | "error";

export default function WatchButton({ ticker }: { ticker: string }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === "submitting") return;
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;
    setStatus("submitting");
    setErrorMessage("");
    try {
      const res = await fetch("/api/watch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed, ticker }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (res.ok && json.ok) {
        setStatus("success");
      } else {
        setStatus("error");
        setErrorMessage(json.error ?? `Could not save (HTTP ${res.status}).`);
      }
    } catch {
      setStatus("error");
      setErrorMessage("Network error — try again in a moment.");
    }
  }

  if (!open) {
    return (
      <div className="watch-row">
        <button
          type="button"
          className="watch-toggle"
          onClick={() => setOpen(true)}
        >
          ⭑ Watch {ticker}
        </button>
        <span className="watch-tagline">
          Get an email when the QScore signal flips. No daily noise.
        </span>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className="watch-row watch-success" role="status">
        ✓ Watching {ticker}. Confirmation sent to {email.trim().toLowerCase()}.
      </div>
    );
  }

  return (
    <form className="watch-row watch-form" onSubmit={handleSubmit}>
      <label className="visually-hidden" htmlFor={`watch-email-${ticker}`}>
        Email
      </label>
      <input
        id={`watch-email-${ticker}`}
        type="email"
        autoComplete="email"
        required
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={status === "submitting"}
        className="watch-input"
      />
      <button
        type="submit"
        className="watch-submit"
        disabled={status === "submitting"}
      >
        {status === "submitting" ? "Saving…" : `Watch ${ticker} →`}
      </button>
      {status === "error" && (
        <p className="watch-error" role="alert">
          {errorMessage || "Could not save. Please try again."}
        </p>
      )}
    </form>
  );
}
