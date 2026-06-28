import type { Metadata } from "next";
import Link from "next/link";
import { SignUp } from "@clerk/nextjs";
import { CLERK_ENABLED } from "@/lib/feature-flags";

export const metadata: Metadata = {
  title: "Sign up for QScoring",
  robots: { index: false, follow: false },
};

export default function SignUpPage() {
  // Accounts are disabled until the Clerk prod instance is verified
  // (see lib/feature-flags.ts); <SignUp> needs a mounted ClerkProvider.
  if (!CLERK_ENABLED) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p>
          Accounts aren&apos;t available yet. <Link href="/">Back to QScoring</Link>.
        </p>
      </div>
    );
  }
  return (
    <div className="flex min-h-screen items-center justify-center">
      <SignUp />
    </div>
  );
}
