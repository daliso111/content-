interface AuthErrorLike {
  message?: string;
  code?: string;
  status?: number;
}

const ERROR_MESSAGES: Array<[string, string]> = [
  ["invalid login credentials", "The email or password you entered is incorrect."],
  ["email not confirmed", "Please confirm your email address before signing in."],
  ["user already registered", "An account already exists with this email address."],
  ["already been registered", "An account already exists with this email address."],
  ["password should be at least", "Your password must contain at least 6 characters."],
  ["signup is disabled", "New account registration is currently unavailable."],
  ["email rate limit exceeded", "Too many requests were made. Please try again later."],
  ["rate limit", "Too many requests were made. Please try again later."],
  ["request rate limit", "Too many requests were made. Please try again later."],
  ["network", "We could not reach the authentication service. Check your connection and try again."],
  ["fetch", "We could not reach the authentication service. Check your connection and try again."],
  ["same password", "Choose a password that is different from your current password."],
  ["session", "Your authentication link is invalid or has expired. Please request a new one."],
  ["otp expired", "Your authentication link is invalid or has expired. Please request a new one."],
];

/** Maps provider errors to safe, actionable messages for authentication screens. */
export function mapAuthError(
  error: unknown,
  fallback = "We could not complete that request. Please try again.",
): string {
  const candidate =
    typeof error === "object" && error !== null ? (error as AuthErrorLike) : null;
  const raw = candidate?.message?.trim().toLowerCase() ?? "";

  for (const [needle, message] of ERROR_MESSAGES) {
    if (raw.includes(needle)) return message;
  }

  if (candidate?.status === 429) {
    return "Too many requests were made. Please try again later.";
  }

  return fallback;
}
