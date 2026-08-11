import { safeConnectionError } from "./connection-errors.ts";

export type TikTokCallbackStage =
  | "CALLBACK_RECEIVED"
  | "STATE_CONSUME_STARTED"
  | "STATE_CONSUMED"
  | "TOKEN_EXCHANGE_STARTED"
  | "TOKEN_EXCHANGE_SUCCEEDED"
  | "TOKEN_EXCHANGE_FAILED"
  | "PROFILE_DISCOVERY_STARTED"
  | "PROFILE_DISCOVERY_SUCCEEDED"
  | "PROFILE_DISCOVERY_FAILED"
  | "TOKEN_ENCRYPTION_STARTED"
  | "TOKEN_ENCRYPTION_SUCCEEDED"
  | "TOKEN_ENCRYPTION_FAILED"
  | "UPSERT_STARTED"
  | "UPSERT_SUCCEEDED"
  | "UPSERT_FAILED"
  | "CALLBACK_COMPLETED";

export type TikTokCallbackDiagnosticCode =
  | "AUTHORIZATION_CANCELLED"
  | "STATE_INVALID"
  | "STATE_EXPIRED"
  | "STATE_ALREADY_USED"
  | "TOKEN_EXCHANGE_FAILED"
  | "REQUIRED_SCOPE_MISSING"
  | "TOKEN_RESPONSE_INVALID"
  | "REFRESH_TOKEN_MISSING"
  | "PROFILE_DISCOVERY_FAILED"
  | "OPEN_ID_MISMATCH"
  | "CONNECTION_NO_LONGER_VALID"
  | "ENCRYPTION_FAILED"
  | "UPSERT_FAILED"
  | "CONFIGURATION_FAILED"
  | "CALLBACK_FAILED";

export function tiktokCallbackDiagnosticCode(
  stage: TikTokCallbackStage,
  error: unknown,
): TikTokCallbackDiagnosticCode {
  const safe = safeConnectionError(error);
  if (safe.code === "TIKTOK_AUTHORIZATION_CANCELLED") {
    return "AUTHORIZATION_CANCELLED";
  }
  if (safe.code === "OAUTH_STATE_EXPIRED") return "STATE_EXPIRED";
  if (safe.code === "OAUTH_STATE_ALREADY_USED") return "STATE_ALREADY_USED";
  if (safe.code === "INVALID_OAUTH_STATE") return "STATE_INVALID";
  if (safe.code === "TIKTOK_CONFIGURATION_MISSING") {
    return "CONFIGURATION_FAILED";
  }
  if (safe.code === "TIKTOK_REQUIRED_SCOPE_MISSING") {
    return "REQUIRED_SCOPE_MISSING";
  }
  if (safe.code === "TIKTOK_TOKEN_RESPONSE_INVALID") {
    return "TOKEN_RESPONSE_INVALID";
  }
  if (safe.code === "TIKTOK_REFRESH_TOKEN_REQUIRED") {
    return "REFRESH_TOKEN_MISSING";
  }
  if (safe.code === "TIKTOK_OPEN_ID_MISMATCH") return "OPEN_ID_MISMATCH";
  if (safe.code === "TIKTOK_CONNECTION_NO_LONGER_VALID") {
    return "CONNECTION_NO_LONGER_VALID";
  }
  if (stage.startsWith("TOKEN_EXCHANGE_")) return "TOKEN_EXCHANGE_FAILED";
  if (stage.startsWith("PROFILE_DISCOVERY_")) return "PROFILE_DISCOVERY_FAILED";
  if (stage.startsWith("TOKEN_ENCRYPTION_")) return "ENCRYPTION_FAILED";
  if (stage.startsWith("UPSERT_")) return "UPSERT_FAILED";
  return "CALLBACK_FAILED";
}

export function tiktokFailureStage(
  stage: TikTokCallbackStage,
): TikTokCallbackStage {
  if (stage === "TOKEN_EXCHANGE_STARTED") return "TOKEN_EXCHANGE_FAILED";
  if (stage === "PROFILE_DISCOVERY_STARTED") return "PROFILE_DISCOVERY_FAILED";
  if (stage === "TOKEN_ENCRYPTION_STARTED") return "TOKEN_ENCRYPTION_FAILED";
  if (stage === "UPSERT_STARTED") return "UPSERT_FAILED";
  return stage;
}
