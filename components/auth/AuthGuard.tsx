"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Logo } from "@/components/layout/Logo";
import { useAuth } from "@/contexts/AuthContext";

export function AuthenticationLoading({
  message = "Restoring your session...",
}: {
  message?: string;
}) {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-5 bg-canvas px-4 text-center"
      role="status"
      aria-live="polite"
    >
      <Logo />
      <Loader2 className="h-6 w-6 animate-spin text-brand" aria-hidden />
      <p className="text-sm text-ink-muted">{message}</p>
    </div>
  );
}

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) router.replace("/sign-in");
  }, [loading, router, user]);

  if (loading || !user) return <AuthenticationLoading />;
  return <>{children}</>;
}

export function GuestGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && user) router.replace("/dashboard");
  }, [loading, router, user]);

  if (loading || user) {
    return <AuthenticationLoading message="Checking your session..." />;
  }

  return <>{children}</>;
}
