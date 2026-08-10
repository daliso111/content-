/**
 * Service placeholders for future backend integration.
 *
 * Authentication now uses Supabase Auth in the browser. The remaining services
 * still simulate latency and return mock results.
 *
 * When the backend arrives:
 *  - `auth.*`      → Supabase Auth (implemented in Stage 1A)
 *  - `db.*`        → Supabase Postgres (posts, approvals, team, etc.)
 *  - `storage.*`   → Supabase Storage (media uploads)
 *  - `publishing.*`→ scheduled-post worker + social-media platform APIs
 *  - `ai.*`        → AI caption/hashtag generation
 *
 * Replace the bodies below — the call sites already match these signatures.
 */

/** Simulate a network round-trip. */
function delay<T>(value: T, ms = 600): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

export { authService as auth } from "@/lib/services/auth-service";

export const storage = {
  // TODO(backend): upload to Supabase Storage and return a public URL.
  upload: (file: File) =>
    delay({ id: crypto.randomUUID(), url: URL.createObjectURL(file) }),
};

export const publishing = {
  // TODO(backend): enqueue a scheduled job for the worker to publish.
  schedule: (postId: string, when: string) => delay({ postId, when, ok: true }),
  // TODO(backend): publish immediately via platform APIs.
  publishNow: (postId: string) => delay({ postId, ok: true }),
};

export const ai = {
  // TODO(backend): call the AI provider for caption suggestions.
  suggestCaption: (topic: string) =>
    delay(
      `✨ ${topic || "Here's an idea"} — three quick tips your audience will love. Save this for later! #tips #socialmedia`,
    ),
  suggestHashtags: () =>
    delay(["#marketing", "#socialmedia", "#contentcreation", "#smallbusiness"]),
};
