"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GuestGuard } from "@/components/auth/AuthGuard";
import { AuthNotice } from "@/components/auth/AuthNotice";
import { AuthLayout, GoogleButton } from "@/components/marketing/AuthLayout";
import { Button } from "@/components/ui/Button";
import { FormField, Input, Checkbox } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/contexts/AuthContext";
import { isValidEmail } from "@/lib/utils";

interface Fields {
  fullName: string;
  businessName: string;
  email: string;
  password: string;
  confirm: string;
  terms: boolean;
}

type FieldErrors = Partial<Record<keyof Fields | "form", string>>;

export default function SignUpPage() {
  return (
    <GuestGuard>
      <SignUpForm />
    </GuestGuard>
  );
}

function SignUpForm() {
  const router = useRouter();
  const toast = useToast();
  const { signUp, configurationError } = useAuth();
  const [fields, setFields] = useState<Fields>({
    fullName: "",
    businessName: "",
    email: "",
    password: "",
    confirm: "",
    terms: false,
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [loading, setLoading] = useState(false);
  const [confirmationEmail, setConfirmationEmail] = useState<string | null>(null);

  const set = <K extends keyof Fields>(key: K, value: Fields[K]) => {
    setFields((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined, form: undefined }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (loading) return;

    const next: FieldErrors = {};
    if (fields.fullName.trim().length < 2) {
      next.fullName = "Please enter your full name.";
    }
    if (fields.businessName.trim().length < 2) {
      next.businessName = "Please enter your business name.";
    }
    if (!isValidEmail(fields.email)) next.email = "Enter a valid email address.";
    if (fields.password.length < 8) next.password = "Use at least 8 characters.";
    if (fields.confirm !== fields.password) next.confirm = "Passwords do not match.";
    if (!fields.terms) next.terms = "Please accept the terms to continue.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setLoading(true);
    const normalizedEmail = fields.email.trim();
    const result = await signUp(
      fields.fullName.trim(),
      fields.businessName.trim(),
      normalizedEmail,
      fields.password,
    );

    if (!result.success) {
      setErrors({ form: result.error });
      setFields((current) => ({ ...current, password: "", confirm: "" }));
      setLoading(false);
      return;
    }

    if (result.confirmationRequired) {
      setConfirmationEmail(normalizedEmail);
      setLoading(false);
      toast.success("Check your inbox", "Confirm your email address to finish signing up.");
      return;
    }

    toast.success("Account created", "Welcome to Towkn!");
    router.replace("/dashboard");
  };

  if (confirmationEmail) {
    return (
      <AuthLayout
        title="Check your inbox"
        subtitle="Your account is ready once you confirm your email address."
      >
        <div className="space-y-5">
          <AuthNotice tone="success">
            We sent a confirmation link to <strong>{confirmationEmail}</strong>.
            Open it to activate your account, then sign in.
          </AuthNotice>
          <Link
            href="/sign-in"
            className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-brand px-5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
          >
            Back to Sign In
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Start your free trial — no credit card required."
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {configurationError && (
          <AuthNotice tone="error">{configurationError}</AuthNotice>
        )}
        {errors.form && <AuthNotice tone="error">{errors.form}</AuthNotice>}

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Full name" htmlFor="fullName" error={errors.fullName}>
            <Input
              id="fullName"
              autoComplete="name"
              placeholder="Amara Okafor"
              value={fields.fullName}
              onChange={(event) => set("fullName", event.target.value)}
              invalid={!!errors.fullName}
              disabled={loading}
            />
          </FormField>
          <FormField
            label="Business name"
            htmlFor="businessName"
            error={errors.businessName}
          >
            <Input
              id="businessName"
              autoComplete="organization"
              placeholder="Northwind Agency"
              value={fields.businessName}
              onChange={(event) => set("businessName", event.target.value)}
              invalid={!!errors.businessName}
              disabled={loading}
            />
          </FormField>
        </div>
        <FormField label="Email address" htmlFor="email" error={errors.email}>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            value={fields.email}
            onChange={(event) => set("email", event.target.value)}
            invalid={!!errors.email}
            disabled={loading}
          />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="Password"
            htmlFor="password"
            error={errors.password}
            hint={!errors.password ? "At least 8 characters" : undefined}
          >
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={fields.password}
              onChange={(event) => set("password", event.target.value)}
              invalid={!!errors.password}
              disabled={loading}
            />
          </FormField>
          <FormField
            label="Confirm password"
            htmlFor="confirm"
            error={errors.confirm}
          >
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={fields.confirm}
              onChange={(event) => set("confirm", event.target.value)}
              invalid={!!errors.confirm}
              disabled={loading}
            />
          </FormField>
        </div>
        <FormField error={errors.terms}>
          <Checkbox
            checked={fields.terms}
            onChange={(event) => set("terms", event.target.checked)}
            disabled={loading}
            label={
              <span>
                I agree to the{" "}
                <Link href="/terms" className="font-medium text-brand-text underline-offset-4 hover:underline">
                  Terms
                </Link>{" "}
                and{" "}
                <Link href="/privacy" className="font-medium text-brand-text underline-offset-4 hover:underline">
                  Privacy Policy
                </Link>
                .
              </span>
            }
          />
        </FormField>
        <Button
          type="submit"
          fullWidth
          loading={loading}
          disabled={!!configurationError}
        >
          Create Account
        </Button>
      </form>

      <div className="my-6 flex items-center gap-3">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs text-ink-subtle">or</span>
        <span className="h-px flex-1 bg-border" />
      </div>
      <GoogleButton />

      <p className="mt-8 text-center text-sm text-ink-muted">
        Already have an account?{" "}
        <Link href="/sign-in" className="font-medium text-brand-text hover:underline">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
