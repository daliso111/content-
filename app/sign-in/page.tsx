"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { GuestGuard } from "@/components/auth/AuthGuard";
import { AuthNotice } from "@/components/auth/AuthNotice";
import { AuthLayout, GoogleButton } from "@/components/marketing/AuthLayout";
import { Button } from "@/components/ui/Button";
import { FormField, Input, Checkbox } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/contexts/AuthContext";
import { isValidEmail } from "@/lib/utils";

interface SignInErrors {
  email?: string;
  password?: string;
  form?: string;
}

export default function SignInPage() {
  return (
    <GuestGuard>
      <Suspense fallback={null}><SignInForm /></Suspense>
    </GuestGuard>
  );
}

function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const { signIn, configurationError } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<SignInErrors>({});
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (loading) return;

    const next: SignInErrors = {};
    if (!isValidEmail(email)) next.email = "Enter a valid email address.";
    if (password.length < 6) {
      next.password = "Password must be at least 6 characters.";
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setLoading(true);
    const result = await signIn(email.trim(), password);
    if (!result.success) {
      setErrors({ form: result.error });
      setPassword("");
      setLoading(false);
      return;
    }

    toast.success("Signed in", "Welcome back to PostFlow.");
    const nextPath = searchParams.get("next");
    router.replace(nextPath?.startsWith("/accept-invite?") && !nextPath.startsWith("//") ? nextPath : "/dashboard");
  };

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to your PostFlow workspace to keep your content flowing."
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {configurationError && (
          <AuthNotice tone="error">{configurationError}</AuthNotice>
        )}
        {errors.form && <AuthNotice tone="error">{errors.form}</AuthNotice>}

        <FormField label="Email address" htmlFor="email" error={errors.email}>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setErrors((current) => ({ ...current, email: undefined, form: undefined }));
            }}
            invalid={!!errors.email}
            disabled={loading}
          />
        </FormField>
        <FormField label="Password" htmlFor="password" error={errors.password}>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              setErrors((current) => ({ ...current, password: undefined, form: undefined }));
            }}
            invalid={!!errors.password}
            disabled={loading}
          />
        </FormField>
        <div className="flex items-center justify-between gap-3">
          <Checkbox label="Remember me" defaultChecked disabled={loading} />
          <Link
            href="/forgot-password"
            className="text-sm font-medium text-brand-text hover:underline"
          >
            Forgot password?
          </Link>
        </div>
        <p className="text-xs text-ink-subtle">
          PostFlow securely restores your Supabase session on this device.
        </p>
        <Button
          type="submit"
          fullWidth
          loading={loading}
          disabled={!!configurationError}
        >
          Sign In
        </Button>
      </form>

      <Divider />
      <GoogleButton />

      <p className="mt-8 text-center text-sm text-ink-muted">
        Don&apos;t have an account?{" "}
        <Link href="/sign-up" className="font-medium text-brand-text hover:underline">
          Create one free
        </Link>
      </p>
    </AuthLayout>
  );
}

function Divider() {
  return (
    <div className="my-6 flex items-center gap-3">
      <span className="h-px flex-1 bg-border" />
      <span className="text-xs text-ink-subtle">or</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
