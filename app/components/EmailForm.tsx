"use client";

import { useState, type FormEvent, type CSSProperties } from "react";

type EmailFormProps = {
  buttonLabel?: string;
  style?: CSSProperties;
  showSuccessInline?: boolean;
};

export default function EmailForm({
  buttonLabel = "Get Early Access",
  style,
  showSuccessInline = true,
}: EmailFormProps) {
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const input = form.querySelector<HTMLInputElement>("input[type=email]");
    const email = input?.value ?? "";

    // TODO: Connect to email service (Resend, ConvertKit, Supabase)
    console.log("Email captured:", email);
    setSubmitted(true);
  }

  if (submitted && showSuccessInline) {
    return (
      <p className="success-msg show" style={style}>
        You&apos;re on the list. We&apos;ll be in touch soon.
      </p>
    );
  }

  return (
    <form className="email-form" style={style} onSubmit={handleSubmit}>
      <input type="email" placeholder="you@email.com" required />
      <button type="submit">{buttonLabel}</button>
    </form>
  );
}
