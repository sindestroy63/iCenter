import { NextResponse } from "next/server";
import { createRequest, parseRequestInput, RequestError } from "@/lib/request-service";
import { readJsonLimited } from "@/lib/read-json-limited";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: unknown;
  try { body = await readJsonLimited(request, 20_000); }
  catch (error) { return NextResponse.json({ error: error instanceof Error && error.message === "BODY_TOO_LARGE" ? "REQUEST_TOO_LARGE" : "INVALID_JSON" }, { status: error instanceof Error && error.message === "BODY_TOO_LARGE" ? 413 : 400 }); }
  const parsed = parseRequestInput(body);
  if (!parsed.success) return NextResponse.json({ error: "INVALID_REQUEST", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
  const requestIdempotencyKey = request.headers.get("idempotency-key") ?? "";
  if (!/^[\w-]{16,128}$/.test(requestIdempotencyKey)) return NextResponse.json({ error: "INVALID_IDEMPOTENCY_KEY" }, { status: 400 });
  try {
    const result = await createRequest(parsed.data, request.headers.get("idempotency-key") ?? "");
    return NextResponse.json(result, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    if (error instanceof RequestError) return NextResponse.json({ error: error.code }, { status: error.status });
    if (error instanceof Error && error.message.startsWith("REQUEST_PII_KEY")) {
      console.error("request creation disabled: encryption key configuration is missing or invalid");
      return NextResponse.json({ error: "REQUEST_SERVICE_UNAVAILABLE" }, { status: 503 });
    }
    console.error("request creation failed", { name: error instanceof Error ? error.name : "UnknownError" });
    return NextResponse.json({ error: "REQUEST_SERVICE_UNAVAILABLE" }, { status: 503 });
  }
}
