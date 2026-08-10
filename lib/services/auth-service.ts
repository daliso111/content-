import type {
  AuthChangeEvent,
  Session,
  User,
} from "@supabase/supabase-js";
import { mapAuthError } from "@/lib/auth-errors";
import {
  getSupabaseClient,
  getSupabaseConfigurationError,
} from "@/lib/supabase/client";

export type AuthActionResult =
  | { success: true; session?: Session | null; user?: User | null }
  | { success: false; error: string };

export type SignUpResult =
  | {
      success: true;
      session: Session | null;
      user: User | null;
      confirmationRequired: boolean;
    }
  | { success: false; error: string };

export interface SessionResult {
  session: Session | null;
  error: string | null;
}

export type AuthStateCallback = (
  event: AuthChangeEvent,
  session: Session | null,
) => void;

function configurationFailure(): { success: false; error: string } | null {
  const error = getSupabaseConfigurationError();
  return error ? { success: false, error } : null;
}

export const authService = {
  async signIn(email: string, password: string): Promise<AuthActionResult> {
    const unavailable = configurationFailure();
    if (unavailable) return unavailable;

    const { data, error } = await getSupabaseClient()!.auth.signInWithPassword({
      email,
      password,
    });

    if (error) return { success: false, error: mapAuthError(error) };
    return { success: true, session: data.session, user: data.user };
  },

  async signUp(
    fullName: string,
    businessName: string,
    email: string,
    password: string,
    emailRedirectTo: string,
  ): Promise<SignUpResult> {
    const unavailable = configurationFailure();
    if (unavailable) return unavailable;

    const { data, error } = await getSupabaseClient()!.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          business_name: businessName,
        },
        emailRedirectTo,
      },
    });

    if (error) return { success: false, error: mapAuthError(error) };
    if (data.user?.identities?.length === 0) {
      return {
        success: false,
        error: "An account already exists with this email address.",
      };
    }
    return {
      success: true,
      session: data.session,
      user: data.user,
      confirmationRequired: !data.session,
    };
  },

  async signOut(): Promise<AuthActionResult> {
    const unavailable = configurationFailure();
    if (unavailable) return unavailable;

    const { error } = await getSupabaseClient()!.auth.signOut();
    if (error) return { success: false, error: mapAuthError(error) };
    return { success: true, session: null, user: null };
  },

  async getSession(): Promise<SessionResult> {
    const configurationError = getSupabaseConfigurationError();
    if (configurationError) {
      return { session: null, error: configurationError };
    }

    const { data, error } = await getSupabaseClient()!.auth.getSession();
    return {
      session: error ? null : data.session,
      error: error ? mapAuthError(error, "We could not restore your session.") : null,
    };
  },

  async sendPasswordReset(
    email: string,
    redirectTo: string,
  ): Promise<AuthActionResult> {
    const unavailable = configurationFailure();
    if (unavailable) return unavailable;

    const { error } = await getSupabaseClient()!.auth.resetPasswordForEmail(email, {
      redirectTo,
    });
    if (error) return { success: false, error: mapAuthError(error) };
    return { success: true };
  },

  async updatePassword(password: string): Promise<AuthActionResult> {
    const unavailable = configurationFailure();
    if (unavailable) return unavailable;

    const { data, error } = await getSupabaseClient()!.auth.updateUser({ password });
    if (error) return { success: false, error: mapAuthError(error) };
    return { success: true, user: data.user };
  },

  subscribe(callback: AuthStateCallback): () => void {
    const client = getSupabaseClient();
    if (!client) return () => undefined;

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange(callback);
    return () => subscription.unsubscribe();
  },
};
