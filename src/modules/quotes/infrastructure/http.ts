
/** Bound provider requests by timeout and distinguish region blocks, rate limits, malformed responses and network failures. */
import { z } from "zod";

const DEFAULT_TIMEOUT_MS = 12_000;
const RETRY_DELAY_MS = 300;

export type FetchJsonOptions = {

  timeoutMs?: number;


  attempts?: number;
};

export async function fetchJson(url: URL, init?: RequestInit, options: FetchJsonOptions = {}) {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, attempts = 1 } = options;

  for (let attempt = 1; ; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...init,
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!response.ok) {
        throw new QuoteHttpError(response.status, `The provider responded with HTTP ${response.status}.`);
      }

      return (await response.json()) as unknown;
    } catch (error) {
      if (attempt >= attempts || !isTransient(error)) {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS * attempt));
    }
  }
}

function isTransient(error: unknown) {
  if (error instanceof QuoteHttpError) {
    return error.statusCode >= 500;
  }


  return error instanceof TypeError || (error instanceof Error && error.name === "TimeoutError");
}

export class QuoteHttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "QuoteHttpError";
  }
}


export class ProviderRefusalError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ProviderRefusalError";
  }
}

export function describeProviderError(error: unknown) {
  if (error instanceof ProviderRefusalError) {
    return { code: error.code, message: error.message };
  }

  if (error instanceof QuoteHttpError) {
    if (error.statusCode === 451) {
      return { code: "REGION_BLOCKED", message: "The provider blocks the server region (HTTP 451)." };
    }

    return {
      code: error.statusCode === 429 ? "RATE_LIMITED" : "HTTP_ERROR",
      message:
        error.statusCode === 429
          ? "The provider rejected the request due to rate limiting (HTTP 429)."
          : error.message,
    };
  }

  if (error instanceof Error && error.name === "TimeoutError") {
    return { code: "TIMEOUT", message: "The provider timed out." };
  }

  if (error instanceof z.ZodError || error instanceof SyntaxError) {
    return { code: "INVALID_RESPONSE", message: "The provider responded in an unexpected format." };
  }

  if (error instanceof TypeError) {
    return { code: "NETWORK_ERROR", message: "Could not connect to the provider." };
  }

  return {
    code: "INVALID_RESPONSE",
    message: error instanceof Error ? error.message : "Invalid provider response.",
  };
}
