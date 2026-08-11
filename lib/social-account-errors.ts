const SOCIAL_ACCOUNT_ERROR_MESSAGES: Record<string, string> = {
  AUTH_REQUIRED: "Your session has expired. Please sign in again.",
  CORS_DENIED: "This site is not allowed to manage social connections.",
  WORKSPACE_ROLE_DENIED: "Only workspace owners and administrators can manage connections.",
  META_AUTHORIZATION_CANCELLED: "Meta authorization was cancelled.",
  INVALID_OAUTH_STATE: "This connection request is invalid. Please start again.",
  OAUTH_STATE_EXPIRED: "This connection request expired. Please start again.",
  OAUTH_STATE_ALREADY_USED: "This connection request has already been used.",
  META_CONFIGURATION_MISSING: "Meta connections are not configured yet.",
  META_NO_MANAGED_PAGES: "Meta did not return any Facebook Pages you can manage.",
  META_NO_ELIGIBLE_INSTAGRAM: "No eligible Instagram Professional account was found.",
  META_TOKEN_EXCHANGE_FAILED: "Meta could not complete authorization. Please try again.",
  META_PERMISSION_DENIED: "Meta did not grant every permission required for this destination. Reconnect and approve the requested access.",
  TOKEN_EXPIRED: "Meta access has expired. Reconnect this account.",
  TOKEN_DECRYPTION_FAILED: "This credential can no longer be read. Reconnect the account.",
  RECONNECTION_REQUIRED: "This account must be reconnected.",
  CONNECTION_SESSION_EXPIRED: "The account selection session expired. Please start again.",
  CONNECTION_SESSION_NOT_FOUND: "The account selection session was not found.",
  INVALID_ACCOUNT_SELECTION: "One or more selected accounts are no longer available.",
  ACCOUNT_ALREADY_CONNECTED: "That account is already connected to this workspace.",
  UNSUPPORTED_ACCOUNT_TYPE: "Only Facebook Pages and Instagram Professional accounts are supported.",
  PERMISSION_DENIED: "You do not have permission to manage this connection.",
  SOCIAL_ACCOUNT_NOT_FOUND: "That social account is unavailable in this workspace.",
  META_PROVIDER_UNAVAILABLE: "Meta is temporarily unavailable. Please try again.",
  YOUTUBE_AUTHORIZATION_CANCELLED: "YouTube authorization was cancelled.",
  YOUTUBE_CONFIGURATION_MISSING: "YouTube connections are not configured yet.",
  YOUTUBE_TOKEN_EXCHANGE_FAILED: "Google could not complete YouTube authorization. Please try again.",
  YOUTUBE_REFRESH_TOKEN_REQUIRED: "Google did not provide offline access. Reconnect YouTube and approve access again.",
  YOUTUBE_REAUTHORIZATION_REQUIRED: "This YouTube channel must be reauthorized.",
  YOUTUBE_NO_CHANNEL: "Google did not return a YouTube channel for this account.",
  YOUTUBE_PROVIDER_UNAVAILABLE: "YouTube is temporarily unavailable. Please try again.",
  TIKTOK_AUTHORIZATION_CANCELLED: "TikTok authorization was cancelled.",
  TIKTOK_CONFIGURATION_MISSING: "TikTok connections are not configured yet.",
  TIKTOK_TOKEN_EXCHANGE_FAILED: "TikTok could not complete authorization. Please try again.",
  TIKTOK_REFRESH_TOKEN_REQUIRED: "TikTok did not provide renewable access. Reconnect the account.",
  TIKTOK_TOKEN_RESPONSE_INVALID: "TikTok returned an invalid authorization response. Please try again.",
  TIKTOK_REQUIRED_SCOPE_MISSING: "TikTok did not grant basic account access. Reconnect and approve the requested permission.",
  TIKTOK_PROFILE_DISCOVERY_FAILED: "TikTok could not return the account profile. Please try again.",
  TIKTOK_OPEN_ID_MISMATCH: "TikTok authorized a different account. The existing connection was left unchanged.",
  TIKTOK_CONNECTION_NO_LONGER_VALID: "This TikTok connection changed or is no longer connected. Refresh the page and try again.",
  TIKTOK_REAUTHORIZATION_REQUIRED: "This TikTok account must be reauthorized.",
  TIKTOK_PROVIDER_UNAVAILABLE: "TikTok is temporarily unavailable. Please try again.",
  TIKTOK_REVOCATION_FAILED: "Towkn disconnected locally, but TikTok authorization may still be active.",
  RATE_LIMITED: "Too many connection attempts. Wait a minute and try again.",
  UNSAFE_RETURN_PATH: "The requested return location is not allowed.",
  INVALID_REQUEST: "The social account request was invalid.",
  NETWORK_FAILURE: "The connection service could not be reached.",
  INTERNAL_ERROR: "The social connection could not be completed.",
};

export class SocialAccountError extends Error {
  constructor(public readonly code: string, public readonly requestId?: string) {
    super(SOCIAL_ACCOUNT_ERROR_MESSAGES[code] ?? SOCIAL_ACCOUNT_ERROR_MESSAGES.INTERNAL_ERROR);
    this.name = "SocialAccountError";
  }
}

export function socialAccountErrorMessage(code: string): string {
  return SOCIAL_ACCOUNT_ERROR_MESSAGES[code.toUpperCase()]
    ?? SOCIAL_ACCOUNT_ERROR_MESSAGES.INTERNAL_ERROR;
}

export function callbackErrorMessage(value: string): string {
  const code = value.trim().replace(/[^a-z0-9_]/gi, "").toUpperCase();
  return socialAccountErrorMessage(code);
}

const YOUTUBE_CALLBACK_ERROR_MESSAGES: Record<string, string> = {
  AUTHORIZATION_CANCELLED: SOCIAL_ACCOUNT_ERROR_MESSAGES.YOUTUBE_AUTHORIZATION_CANCELLED,
  STATE_INVALID: SOCIAL_ACCOUNT_ERROR_MESSAGES.INVALID_OAUTH_STATE,
  STATE_EXPIRED: SOCIAL_ACCOUNT_ERROR_MESSAGES.OAUTH_STATE_EXPIRED,
  STATE_ALREADY_USED: SOCIAL_ACCOUNT_ERROR_MESSAGES.OAUTH_STATE_ALREADY_USED,
  TOKEN_EXCHANGE_FAILED: SOCIAL_ACCOUNT_ERROR_MESSAGES.YOUTUBE_TOKEN_EXCHANGE_FAILED,
  CHANNEL_DISCOVERY_FAILED: SOCIAL_ACCOUNT_ERROR_MESSAGES.YOUTUBE_PROVIDER_UNAVAILABLE,
  NO_CHANNEL: SOCIAL_ACCOUNT_ERROR_MESSAGES.YOUTUBE_NO_CHANNEL,
  ENCRYPTION_FAILED: "Towkn could not secure the YouTube credential. Please try again.",
  REFRESH_TOKEN_MISSING: SOCIAL_ACCOUNT_ERROR_MESSAGES.YOUTUBE_REFRESH_TOKEN_REQUIRED,
  UPSERT_FAILED: "Towkn could not save the YouTube connection. Please try again.",
  CONFIGURATION_FAILED: SOCIAL_ACCOUNT_ERROR_MESSAGES.YOUTUBE_CONFIGURATION_MISSING,
  CALLBACK_FAILED: SOCIAL_ACCOUNT_ERROR_MESSAGES.INTERNAL_ERROR,
};

export function youtubeCallbackErrorMessage(value: string): string {
  const code = value.trim().replace(/[^a-z0-9_]/gi, "").toUpperCase();
  return YOUTUBE_CALLBACK_ERROR_MESSAGES[code]
    ?? SOCIAL_ACCOUNT_ERROR_MESSAGES.INTERNAL_ERROR;
}

const TIKTOK_CALLBACK_ERROR_MESSAGES: Record<string, string> = {
  AUTHORIZATION_CANCELLED: SOCIAL_ACCOUNT_ERROR_MESSAGES.TIKTOK_AUTHORIZATION_CANCELLED,
  STATE_INVALID: SOCIAL_ACCOUNT_ERROR_MESSAGES.INVALID_OAUTH_STATE,
  STATE_EXPIRED: SOCIAL_ACCOUNT_ERROR_MESSAGES.OAUTH_STATE_EXPIRED,
  STATE_ALREADY_USED: SOCIAL_ACCOUNT_ERROR_MESSAGES.OAUTH_STATE_ALREADY_USED,
  TOKEN_EXCHANGE_FAILED: SOCIAL_ACCOUNT_ERROR_MESSAGES.TIKTOK_TOKEN_EXCHANGE_FAILED,
  REQUIRED_SCOPE_MISSING: SOCIAL_ACCOUNT_ERROR_MESSAGES.TIKTOK_REQUIRED_SCOPE_MISSING,
  TOKEN_RESPONSE_INVALID: SOCIAL_ACCOUNT_ERROR_MESSAGES.TIKTOK_TOKEN_RESPONSE_INVALID,
  REFRESH_TOKEN_MISSING: SOCIAL_ACCOUNT_ERROR_MESSAGES.TIKTOK_REFRESH_TOKEN_REQUIRED,
  PROFILE_DISCOVERY_FAILED: SOCIAL_ACCOUNT_ERROR_MESSAGES.TIKTOK_PROFILE_DISCOVERY_FAILED,
  OPEN_ID_MISMATCH: SOCIAL_ACCOUNT_ERROR_MESSAGES.TIKTOK_OPEN_ID_MISMATCH,
  CONNECTION_NO_LONGER_VALID: SOCIAL_ACCOUNT_ERROR_MESSAGES.TIKTOK_CONNECTION_NO_LONGER_VALID,
  ENCRYPTION_FAILED: "Towkn could not secure the TikTok credential. Please try again.",
  UPSERT_FAILED: "Towkn could not save the TikTok connection. Please try again.",
  CONFIGURATION_FAILED: SOCIAL_ACCOUNT_ERROR_MESSAGES.TIKTOK_CONFIGURATION_MISSING,
  CALLBACK_FAILED: SOCIAL_ACCOUNT_ERROR_MESSAGES.INTERNAL_ERROR,
};

export function tiktokCallbackErrorMessage(value: string): string {
  const code = value.trim().replace(/[^a-z0-9_]/gi, "").toUpperCase();
  return TIKTOK_CALLBACK_ERROR_MESSAGES[code]
    ?? SOCIAL_ACCOUNT_ERROR_MESSAGES.INTERNAL_ERROR;
}
