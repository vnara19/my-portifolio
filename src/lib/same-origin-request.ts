


export function rejectForeignRequest(request: Request): Response | null {
  const contentType = request.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    return Response.json({ message: "Send the request as JSON." }, { status: 415 });
  }

  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return Response.json({ message: "Origin not allowed." }, { status: 403 });
  }

  const origin = request.headers.get("origin");
  const host = request.headers.get("host");

  if (origin && host) {
    try {
      if (new URL(origin).host !== host) {
        return Response.json({ message: "Origin not allowed." }, { status: 403 });
      }
    } catch {
      return Response.json({ message: "Origin not allowed." }, { status: 403 });
    }
  }

  return null;
}
