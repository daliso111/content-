"use client";

import { useState } from "react";
import Link from "next/link";
import { GuestGuard } from "@/components/auth/AuthGuard";
import { AuthNotice } from "@/components/auth/AuthNotice";
import { AuthLayout } from "@/components/marketing/AuthLayout";
import { Button } from "@/components/ui/Button";
import { FormField, Input } from "@/components/ui/Field";
import { useAuth } from "@/contexts/AuthContext";
import { isValidEmail } from "@/lib/utils";

export default function ForgotPasswordPage() {
  return (
    <GuestGuard>
      <ForgotPasswordForm />
    </GuestGuard>
  );
}

function ForgotPasswordForm() {
  const { sendPasswordReset, configurationError } = useAuth();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const emailError = error && !isValidEmail(email) ? error : undefined;
  const formError = error && isValidEmail(email) ? error : undefined;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (loading) return;

    if (!isValidEmail(email)) {
      setError("Enter a valid email address.");
      return;
    }

    setLoading(true);
    setError("");
    const result = await sendPasswordReset(email.trim());
    setLoading(false);

    if (!result.success) {
      setError(result.error);
      return;
    }

    setSubmitted(true);
  };

  return (
    <AuthLayout
      title={submitted ? "Check your inbox" : "Reset your password"}
      subtitle={
        submitted
          ? "Use the secure link in your email to choose a new password."
          : "Enter your email and we will send you a secure recovery link."
      }
    >
      {submitted ? (
        <div className="space-y-5">
          <AuthNotice tone="success">
            If an account exists for that email, a password reset link has been sent.
          </AuthNotice>
          <Link
            href="/sign-in"
            className="inline-flex h-11 w-full items-center justify-center rounded-lg border border-border-strong bg-surface px-5 text-sm font-medium text-ink transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
          >
            Back to Sign In
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {configurationError && (
            <AuthNotice tone="error">{configurationError}</AuthNotice>
          )}
          {formError && <AuthNotice tone="error">{formError}</AuthNotice>}
          <FormField
            label="Email address"
            htmlFor="reset-email"
            error={emailError}
          >
            <Input
              id="reset-email"
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setError("");
              }}
              invalid={!!emailError}
              disabled={loading}
            />
          </FormField>
          <Button
            type="submit"
            fullWidth
            loading={loading}
            disabled={!!configurationError}
          >
            Send Reset Link
          </Button>
          <p className="text-center text-sm text-ink-muted">
            Remembered your password?{" "}
            <Link href="/sign-in" className="font-medium text-brand-text hover:underline">
              Back to sign in
            </Link>
          </p>
        </form>
      )}
    </AuthLayout>
  );
}
