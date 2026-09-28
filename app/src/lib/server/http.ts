/** JSON body as an object; anything else (invalid JSON, null, arrays) becomes `{}`. */
export async function jsonBody(request: Request): Promise<Record<string, unknown>> {
  const b = await request.json().catch(() => null);
  return b && typeof b === "object" && !Array.isArray(b) ? b : {};
}

/** Error response that never echoes RPC credentials embedded in upstream error messages. */
export function errorResponse(e: unknown, status = 500) {
  const msg = (e instanceof Error ? e.message : String(e)).replace(/(api-key=|apikey=|\/v2\/)[\w-]+/gi, "$1***");
  return Response.json({ error: msg }, { status });
}

export function clientIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
}
