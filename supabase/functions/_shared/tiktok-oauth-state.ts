import { ConnectionError } from "./connection-errors.ts";
import {
  isTikTokOAuthIntent,
  type TikTokOAuthIntent,
  tiktokScopesForIntent,
} from "./tiktok-config.ts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface TrustedTikTokOAuthState {
  workspaceId: string;
  initiatedBy: string;
  returnPath: "/dashboard/accounts";
  intent: TikTokOAuthIntent;
  pendingConnectionId: string | null;
  expectedPlatformAccountId: string | null;
  requestedScopes: string[];
  metadata: Record<string, unknown>;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function exactScopes(value: unknown, intent: TikTokOAuthIntent): string[] {
  if (
    !Array.isArray(value) || value.some((scope) => typeof scope !== "string")
  ) {
    throw new ConnectionError("INVALID_OAUTH_STATE", 400);
  }
  const actual = [...new Set(value as string[])].sort();
  const expected = [...tiktokScopesForIntent(intent)].sort();
  if (
    actual.length !== expected.length ||
    actual.some((scope, index) => scope !== expected[index])
  ) {
    throw new ConnectionError("INVALID_OAUTH_STATE", 400);
  }
  return actual;
}

export function parseTrustedTikTokOAuthState(
  value: unknown,
): TrustedTikTokOAuthState {
  const state = object(value);
  if (
    typeof state.workspaceId !== "string" ||
    !UUID_PATTERN.test(state.workspaceId) ||
    typeof state.initiatedBy !== "string" ||
    !UUID_PATTERN.test(state.initiatedBy) ||
    state.returnPath !== "/dashboard/accounts" ||
    !isTikTokOAuthIntent(state.intent)
  ) {
    throw new ConnectionError("INVALID_OAUTH_STATE", 400);
  }
  const requestedScopes = exactScopes(state.requestedScopes, state.intent);
  const pendingConnectionId = state.pendingConnectionId === null
    ? null
    : typeof state.pendingConnectionId === "string" &&
        UUID_PATTERN.test(state.pendingConnectionId)
    ? state.pendingConnectionId
    : null;
  const expectedPlatformAccountId = typeof state.expectedPlatformAccountId ===
        "string" && state.expectedPlatformAccountId.trim()
    ? state.expectedPlatformAccountId.trim()
    : null;

  if (
    (state.intent === "connect" &&
      (pendingConnectionId !== null || expectedPlatformAccountId !== null)) ||
    (state.intent === "enable_publishing" &&
      (!pendingConnectionId || !expectedPlatformAccountId))
  ) {
    throw new ConnectionError("INVALID_OAUTH_STATE", 400);
  }

  return {
    workspaceId: state.workspaceId,
    initiatedBy: state.initiatedBy,
    returnPath: state.returnPath,
    intent: state.intent,
    pendingConnectionId,
    expectedPlatformAccountId,
    requestedScopes,
    metadata: object(state.metadata),
  };
}

export function assertTikTokUpgradeOpenId(
  state: TrustedTikTokOAuthState,
  returnedOpenId: string,
): void {
  if (
    state.intent === "enable_publishing" &&
    returnedOpenId !== state.expectedPlatformAccountId
  ) {
    throw new ConnectionError("TIKTOK_OPEN_ID_MISMATCH", 409);
  }
}
