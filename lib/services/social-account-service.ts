import { FunctionsHttpError } from "@supabase/supabase-js";
import { SocialAccountError } from "@/lib/social-account-errors";
import { getSupabaseClient } from "@/lib/supabase/client";
import type {
  ConnectedAccountResult,
  MetaConnectionOptionsResult,
  SocialAccountActionResult,
  SocialAccountView,
  TikTokCreatorInfoResult,
} from "@/types";

interface FunctionErrorPayload {
  error?: { code?: string; requestId?: string };
}

async function toSocialAccountError(error: unknown): Promise<SocialAccountError> {
  if (error instanceof SocialAccountError) return error;
  if (error instanceof FunctionsHttpError && error.context instanceof Response) {
    try {
      const payload = await error.context.clone().json() as FunctionErrorPayload;
      return new SocialAccountError(
        payload.error?.code ?? "INTERNAL_ERROR",
        payload.error?.requestId,
      );
    } catch {
      return new SocialAccountError("INTERNAL_ERROR");
    }
  }
  return new SocialAccountError("NETWORK_FAILURE");
}

async function invoke<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new SocialAccountError("NETWORK_FAILURE");
  const { data, error } = await supabase.functions.invoke<T>(name, { body });
  if (error) throw await toSocialAccountError(error);
  if (!data) throw new SocialAccountError("INTERNAL_ERROR");
  return data;
}

export async function listSocialAccounts(workspaceId: string): Promise<SocialAccountView[]> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new SocialAccountError("NETWORK_FAILURE");
  const { data, error } = await supabase
    .from("social_accounts")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("platform")
    .order("account_name");
  if (error) throw new SocialAccountError("INTERNAL_ERROR");

  const accounts = data ?? [];
  const connectorIds = [...new Set(accounts.map((account) => account.connected_by))];
  const names = new Map<string, string>();
  if (connectorIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", connectorIds);
    for (const profile of profiles ?? []) {
      if (profile.full_name) names.set(profile.id, profile.full_name);
    }
  }
  return accounts.map((account) => ({
    account,
    connectedByName: names.get(account.connected_by) ?? null,
  }));
}

export async function startMetaConnection(workspaceId: string, returnPath = "/dashboard/accounts") {
  const result = await invoke<{ authorizationUrl: string; expiresAt: string }>(
    "meta-oauth-start",
    { workspaceId, returnPath },
  );
  const url = new URL(result.authorizationUrl);
  if (url.protocol !== "https:" || url.hostname !== "www.facebook.com") {
    throw new SocialAccountError("INTERNAL_ERROR");
  }
  return result;
}

export async function startYouTubeConnection(workspaceId: string, returnPath = "/dashboard/accounts") {
  const result = await invoke<{ authorizationUrl: string; expiresAt: string }>(
    "youtube-oauth-start",
    { workspaceId, returnPath },
  );
  const url = new URL(result.authorizationUrl);
  if (url.protocol !== "https:" || url.hostname !== "accounts.google.com") {
    throw new SocialAccountError("INTERNAL_ERROR");
  }
  return result;
}

async function startTikTokOAuth(
  body: Record<string, unknown>,
) {
  const result = await invoke<{ authorizationUrl: string; expiresAt: string }>(
    "tiktok-oauth-start",
    body,
  );
  const url = new URL(result.authorizationUrl);
  if (
    url.protocol !== "https:" || url.hostname !== "www.tiktok.com" ||
    url.pathname !== "/v2/auth/authorize/"
  ) {
    throw new SocialAccountError("INTERNAL_ERROR");
  }
  return result;
}

export function startTikTokConnection(
  workspaceId: string,
  returnPath = "/dashboard/accounts",
) {
  return startTikTokOAuth({ workspaceId, returnPath });
}

export function startTikTokPublishingUpgrade(
  workspaceId: string,
  socialAccountId: string,
  returnPath = "/dashboard/accounts",
) {
  return startTikTokOAuth({
    workspaceId,
    socialAccountId,
    intent: "enable_publishing",
    returnPath,
  });
}

export function getMetaConnectionOptions(connectionSessionId: string) {
  return invoke<MetaConnectionOptionsResult>("meta-connection-options", { connectionSessionId });
}

export async function completeMetaConnection(
  connectionSessionId: string,
  selectedAccountIds: string[],
): Promise<ConnectedAccountResult[]> {
  const result = await invoke<{ accounts: ConnectedAccountResult[] }>(
    "meta-connection-complete",
    { connectionSessionId, selectedAccountIds },
  );
  return result.accounts;
}

export function refreshSocialAccount(socialAccountId: string) {
  return invoke<SocialAccountActionResult>("social-account-refresh", { socialAccountId });
}

export function disconnectSocialAccount(socialAccountId: string) {
  return invoke<SocialAccountActionResult>("social-account-disconnect", { socialAccountId });
}

export function getTikTokCreatorInfo(workspaceId: string, socialAccountId: string) {
  return invoke<TikTokCreatorInfoResult>("tiktok-creator-info", {
    workspaceId,
    socialAccountId,
  });
}

export const socialAccountService = {
  listSocialAccounts,
  startMetaConnection,
  startYouTubeConnection,
  startTikTokConnection,
  startTikTokPublishingUpgrade,
  getMetaConnectionOptions,
  completeMetaConnection,
  refreshSocialAccount,
  disconnectSocialAccount,
  getTikTokCreatorInfo,
};
