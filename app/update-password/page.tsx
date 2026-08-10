"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AuthNotice } from "@/components/auth/AuthNotice";
import { AuthenticationLoading } from "@/components/auth/AuthGuard";
import { AuthLayout } from "@/components/marketing/AuthLayout";
import { Button } from "@/components/ui/Button";
import { FormField, Input } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/contexts/AuthContext";
import { authService } from "@/lib/services/auth-service";

type RecoveryState = "checking" | "ready" | "invalid" | "success";

export default function UpdatePasswordPage() {
  const toast = useToast();
  const { loading: authLoading, configurationError, updatePassword } = useAuth();
  const [recoveryState, setRecoveryState] = useState<RecoveryState>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<{ password?: string; confirm?: string; form?: string }>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;
    let recoveryEventReceived = false;

    const unsubscribe = authService.subscribe((event, session) => {
      if (!mounted || event !== "PASSWORD_RECOVERY") return;
      recoveryEventReceived = true;
      setRecoveryState(session ? "ready" : "invalid");
    });

    const hash = window.location.hash;
    const params = new URLSearchParams(window.location.search);
    const hasRecoveryHint =
      hash.includes("type=recovery") ||
      params.get("type") === "recovery" ||
      params.has("code");

    void authService.getSession().then((result) => {
      if (!mounted || recoveryEventReceived) return;
      setRecoveryState(hasRecoveryHint && result.session ? "ready" : "invalid");
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving || recoveryState !== "ready") return;

    const next: typeof errors = {};
    if (password.length < 8) next.password = "Use at least 8 characters.";
    if (confirm !== password) next.confirm = "Passwords do not match.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSaving(true);
    const result = await updatePassword(password);
    if (!result.success) {
      setErrors({ form: result.error });
      setPassword("");
      setConfirm("");
      setSaving(false);
      return;
    }

    setSaving(false);
    setRecoveryState("success");
    toast.success("Password updated", "Your new password is ready to use.");
  };

  if (recoveryState === "checking" || authLoading) {
    return <AuthenticationLoading message="Validating your recovery link..." />;
  }

  return (
    <AuthLayout
      title={recoveryState === "success" ? "Password updated" : "Choose a new password"}
      subtitle={
        recoveryState === "success"
          ? "Your account is secured with your new password."
          : "Use a strong, unique password you do not use elsewhere."
      }
    >
      {configurationError ? (
        <AuthNotice tone="error">{configurationError}</AuthNotice>
      ) : recoveryState === "invalid" ? (
        <div className="space-y-5">
          <AuthNotice tone="error">
            This password recovery link is invalid or has expired. Request a new link to continue.
          </AuthNotice>
          <Link
            href="/forgot-password"
            className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-brand px-5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
          >
            Request New Link
          </Link>
        </div>
      ) : recoveryState === "success" ? (
        <div className="space-y-5">
          <AuthNotice tone="success">
            Your password was updated successfully. You can continue to your dashboard.
          </AuthNotice>
          <Link
            href="/dashboard"
            className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-brand px-5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
          >
            Continue to Dashboard
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {errors.form && <AuthNotice tone="error">{errors.form}</AuthNotice>}
          <FormField
            label="New password"
            htmlFor="new-password"
            error={errors.password}
            hint={!errors.password ? "Use at least 8 characters; a long passphrase is strongest." : undefined}
          >
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setErrors((current) => ({ ...current, password: undefined, form: undefined }));
              }}
              invalid={!!errors.password}
              disabled={saving}
            />
          </FormField>
          <FormField
            label="Confirm new password"
            htmlFor="confirm-password"
            error={errors.confirm}
          >
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={confirm}
              onChange={(event) => {
                setConfirm(event.target.value);
                setErrors((current) => ({ ...current, confirm: undefined, form: undefined }));
              }}
              invalid={!!errors.confirm}
              disabled={saving}
            />
          </FormField>
          <Button type="submit" fullWidth loading={saving}>
            Update Password
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
