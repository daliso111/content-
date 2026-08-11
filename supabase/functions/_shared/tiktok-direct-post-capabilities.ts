export type TikTokDirectPostMode = "unaudited" | "audited";

export function resolveTikTokDirectPostMode(
  configuredMode: string | undefined = Deno.env.get("TIKTOK_DIRECT_POST_MODE"),
): TikTokDirectPostMode {
  return configuredMode?.trim().toLowerCase() === "audited"
    ? "audited"
    : "unaudited";
}

export function allowedTikTokPrivacyLevels(
  creatorPrivacyLevels: string[],
  mode: TikTokDirectPostMode = resolveTikTokDirectPostMode(),
): string[] {
  const uniqueLevels = [...new Set(creatorPrivacyLevels)];
  return mode === "unaudited"
    ? uniqueLevels.filter((level) => level === "SELF_ONLY")
    : uniqueLevels;
}
