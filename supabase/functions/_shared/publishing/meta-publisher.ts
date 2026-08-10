import { PublishingError } from "./errors.ts";

type Fetcher = typeof fetch;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export interface MetaResponse {
  body: Record<string, unknown>;
  requestId?: string;
  retryAfter?: number;
}

export function graphVersion(): string {
  const value = Deno.env.get("META_GRAPH_API_VERSION")?.trim();
  if (!value || !/^v\d+\.\d+$/.test(value)) {
    throw new PublishingError(
      "META_CONFIGURATION_MISSING",
      "Meta publishing is not configured.",
    );
  }
  return value;
}

export async function metaRequest(
  pathOrUrl: string,
  accessToken: string,
  init: RequestInit & { finalSubmission?: boolean } = {},
  fetcher: Fetcher = fetch,
): Promise<MetaResponse> {
  const url = /^https:\/\//.test(pathOrUrl)
    ? pathOrUrl
    : `https://graph.facebook.com/${graphVersion()}/${
      pathOrUrl.replace(/^\//, "")
    }`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetcher(url, {
      ...init,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
        ...init.headers,
      },
      signal: controller.signal,
    });
    const payload: unknown = await response.json().catch(() => ({}));
    const body = record(payload);
    const providerError = record(body.error);
    const requestId = response.headers.get("x-fb-request-id") ??
      stringValue(providerError.fbtrace_id) ?? undefined;
    if (!response.ok || body.error) {
      const providerCode = typeof providerError.code === "number"
        ? String(providerError.code)
        : "META_PROVIDER_REJECTION";
      const retryable = response.status === 429 || response.status >= 500;
      throw new PublishingError(
        response.status === 429 ? "PROVIDER_RATE_LIMIT" : providerCode,
        response.status === 429
          ? "Meta is rate limiting publishing requests."
          : retryable
          ? "Meta is temporarily unavailable."
          : "Meta rejected the publishing request.",
        retryable,
        false,
        response.status,
        requestId,
      );
    }
    const retryHeader = response.headers.get("retry-after");
    return {
      body,
      requestId,
      retryAfter: retryHeader ? Number(retryHeader) : undefined,
    };
  } catch (error) {
    if (error instanceof PublishingError) throw error;
    const ambiguous = init.finalSubmission === true;
    throw new PublishingError(
      ambiguous ? "AMBIGUOUS_PROVIDER_OUTCOME" : "PROVIDER_NETWORK_FAILURE",
      ambiguous
        ? "The final provider request timed out. Verify the destination before retrying."
        : "The provider could not be reached.",
      !ambiguous,
      ambiguous,
    );
  } finally {
    clearTimeout(timeout);
  }
}

export function formBody(
  values: Record<string, string | undefined>,
): URLSearchParams {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) body.set(key, value);
  }
  return body;
}

export function responseId(
  body: Record<string, unknown>,
  field = "id",
): string {
  const value = stringValue(body[field]);
  if (!value) {
    throw new PublishingError(
      "PROVIDER_INVALID_RESPONSE",
      "Meta returned an invalid response.",
      true,
    );
  }
  return value;
}
