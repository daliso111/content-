import type { PublishingStepResult } from "./types.ts";

export class PublishingError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly retryable = false,
    public readonly ambiguous = false,
    public readonly httpStatus?: number,
    public readonly requestId?: string,
  ) {
    super(message);
  }
}

export function redactUrl(value: string): string {
  return value.replace(/https?:\/\/[^\s]+/gi, (candidate) => {
    try {
      const url = new URL(candidate);
      return `${url.origin}${url.pathname}`;
    } catch {
      return "[redacted-url]";
    }
  });
}

export function safeMessage(error: unknown): string {
  if (error instanceof PublishingError) {
    return redactUrl(error.message).slice(0, 500);
  }
  return "A temporary publishing error occurred.";
}

export function errorResult(
  error: unknown,
  attempt: number,
  maxAttempts: number,
): PublishingStepResult {
  const publishingError = error instanceof PublishingError
    ? error
    : new PublishingError(
      "PROVIDER_TEMPORARY_ERROR",
      "A temporary publishing error occurred.",
      true,
    );
  if (publishingError.ambiguous) {
    return {
      status: "reconciliation_required",
      phase: "provider_submission",
      errorCode: "AMBIGUOUS_PROVIDER_OUTCOME",
      safeMessage: safeMessage(publishingError),
      requestId: publishingError.requestId,
      httpStatus: publishingError.httpStatus,
      retryable: false,
    };
  }
  if (publishingError.retryable && attempt < maxAttempts) {
    return {
      status: "retry_wait",
      phase: "provider_request",
      errorCode: publishingError.code,
      safeMessage: safeMessage(publishingError),
      requestId: publishingError.requestId,
      httpStatus: publishingError.httpStatus,
      retryable: true,
    };
  }
  return {
    status: "failed",
    phase: "provider_request",
    errorCode: publishingError.retryable
      ? "RETRY_EXHAUSTED"
      : publishingError.code,
    safeMessage: publishingError.retryable
      ? "Publishing retry limit reached."
      : safeMessage(publishingError),
    requestId: publishingError.requestId,
    httpStatus: publishingError.httpStatus,
    retryable: publishingError.retryable,
  };
}
