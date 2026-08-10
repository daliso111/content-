"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import {
  authService,
  type AuthActionResult,
  type SignUpResult,
} from "@/lib/services/auth-service";
import { getSupabaseConfigurationError } from "@/lib/supabase/client";

export type { AuthActionResult, SignUpResult } from "@/lib/services/auth-service";

export interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  configurationError: string | null;
  signIn: (email: string, password: string) => Promise<AuthActionResult>;
  signUp: (
    fullName: string,
    businessName: string,
    email: string,
    password: string,
  ) => Promise<SignUpResult>;
  signOut: () => Promise<AuthActionResult>;
  sendPasswordReset: (email: string) => Promise<AuthActionResult>;
  updatePassword: (password: string) => Promise<AuthActionResult>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const configurationError = getSupabaseConfigurationError();

  useEffect(() => {
    let mounted = true;

    const unsubscribe = authService.subscribe((_event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setLoading(false);
    });

    void authService.getSession().then((result) => {
      if (!mounted) return;
      setSession(result.session);
      setUser(result.session?.user ?? null);
      setLoading(false);
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const result = await authService.signIn(email, password);
    if (result.success) {
      setSession(result.session ?? null);
      setUser(result.user ?? result.session?.user ?? null);
    }
    return result;
  }, []);

  const signUp = useCallback(
    async (
      fullName: string,
      businessName: string,
      email: string,
      password: string,
    ) => {
      const result = await authService.signUp(
        fullName,
        businessName,
        email,
        password,
        `${window.location.origin}/sign-in`,
      );
      if (result.success && result.session) {
        setSession(result.session);
        setUser(result.user ?? result.session.user);
      }
      return result;
    },
    [],
  );

  const signOut = useCallback(async () => {
    const result = await authService.signOut();
    if (result.success) {
      setSession(null);
      setUser(null);
    }
    return result;
  }, []);

  const sendPasswordReset = useCallback(
    (email: string) =>
      authService.sendPasswordReset(
        email,
        `${window.location.origin}/update-password`,
      ),
    [],
  );

  const updatePassword = useCallback(
    (password: string) => authService.updatePassword(password),
    [],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      session,
      loading,
      configurationError,
      signIn,
      signUp,
      signOut,
      sendPasswordReset,
      updatePassword,
    }),
    [
      user,
      session,
      loading,
      configurationError,
      signIn,
      signUp,
      signOut,
      sendPasswordReset,
      updatePassword,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within <AuthProvider>");
  return context;
}
