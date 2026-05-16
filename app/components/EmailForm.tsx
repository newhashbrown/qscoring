"use client";

import { useId, useState, type FormEvent, type CSSProperties } from "react";

type EmailFormProps = {
  buttonLabel?: string;
  source?: "waitlist" | "early_access" | "score_page" | "footer";
  style?: CSSProperties;
  showSuccessInline?: boolean;
};

export default function EmailForm({
  buttonLabel = "Get Early Access",
  source = "waitlist",
  style,
  showSuccessInline = true,
}: EmailFormProps) {
  const inputId = useId();
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === "submitting") return;
    const form = e.currentTarget;
    const input = form.querySelector<HTMLInputElement>("input[type=email]");
    const email = (input?.value ?? "").trim();
    if (!email) return;

    setStatus("submitting");
    setErrorMsg("");
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.ok && json.ok) {
        setStatus("success");
      } else {
        setStatus("error");
        setErrorMsg(json.error ?? "Something went wrong. Try again?");
      }
    } catch {
      setStatus("error");
      setErrorMsg("Network error. Try again?");
    }
  }

  if (status === "success" && showSuccessInline) {
    return (
      <p className="success-msg show" style={style}>
        You&apos;re on the list. We&apos;ll be in touch soon.
      </p>
    );
  }

  return (
    <>
      <form className="email-form" style={style} onSubmit={handleSubmit}>
        <label htmlFor={inputId} className="visually-hidden">Email address</label>
        <input
          id={inputId}
          type="email"
          placeholder="you@email.com"
          autoComplete="email"
          required
        />
        <button
          type="submit"
          disabled={status === "submitting"}
          aria-busy={status === "submitting"}
          aria-label={status === "submitting" ? "Submitting…" : undefined}
        >
          {status === "submitting" ? "…" : buttonLabel}
        </button>
      </form>
      {status === "error" && (
        <p className="form-error" role="alert">{errorMsg}</p>
      )}
    </>
  );
}
