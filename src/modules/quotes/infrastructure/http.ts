
/** Bound provider requests by timeout and distinguish region blocks, rate limits, malformed responses and network failures. */
import { limitedBytes } from "@/lib/request-body";
import { z } from "zod";

const DEFAULT_TIMEOUT_MS = 12_000;
const RETRY_DELAY_MS = 300;

export type FetchJsonOptions = {

  timeoutMs?: number;


  attempts?: number;
};

/** Follow only HTTPS redirects within the already trusted provider origin; never forward credentials to another host. */
export async function fetchProvider(input:URL|string,init:RequestInit={}){
 const original=new URL(input);if(original.protocol!=="https:"||original.username||original.password)throw new Error("Untrusted provider URL");
 let url=original;
 for(let attempt=0;attempt<4;attempt++){
  const response=await fetch(url,{...init,redirect:"manual"});
  if(![301,302,303,307,308].includes(response.status))return response;
  const location=response.headers.get("location");await response.body?.cancel();
  if(!location || (init.method??"GET")!=="GET")throw new Error("Unexpected provider redirect");
  const next=new URL(location,url);if(next.origin!==original.origin||next.protocol!=="https:"||next.username||next.password)throw new Error("Cross-origin provider redirect refused");
  url=next;
 }
 throw new Error("Too many provider redirects");
}

export async function fetchJson(url: URL, init?: RequestInit, options: FetchJsonOptions = {}) {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, attempts = 1 } = options;

  for (let attempt = 1; ; attempt += 1) {
    try {
      const response = await fetchProvider(url, {
        ...init,
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!response.ok) {
        throw new QuoteHttpError(response.status, `The provider responded with HTTP ${response.status}.`);
      }

      return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(await limitedBytes(response.body, 5_000_000, response.headers.get("content-length")))) as unknown;
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
