/** Count actual streamed bytes before allocating JSON; Content-Length is untrusted. */
export class BodyLimitError extends Error {}

export async function limitedBytes(body: ReadableStream<Uint8Array> | null, maxBytes: number, length?: string | null): Promise<Uint8Array> {
  if (length && (!/^\d+$/.test(length) || Number(length) > maxBytes)) throw new BodyLimitError("Request is too large.");
  if (!body) return new Uint8Array();
  const reader = body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new BodyLimitError("Request is too large.");
      }
      parts.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.byteLength; }
  return result;
}

export async function limitedJson(request: Request, maxBytes = 32_768): Promise<unknown> {
  const bytes = await limitedBytes(request.body, maxBytes, request.headers.get("content-length"));
  const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  assertJsonBudget(value);
  return value;
}

export function assertJsonBudget(value: unknown) {
  const stack: { value: unknown; depth: number }[] = [{ value, depth: 0 }];
  let count = 0;
  while (stack.length) {
    const item = stack.pop()!;
    if (++count > 500_000 || item.depth > 40) throw new BodyLimitError("JSON is too complex.");
    if (item.value && typeof item.value === "object") {
      for (const [key, child] of Object.entries(item.value)) {
        if (["__proto__", "prototype", "constructor"].includes(key)) throw new BodyLimitError("Unsafe JSON field.");
        stack.push({ value: child, depth: item.depth + 1 });
      }
    }
  }
}
