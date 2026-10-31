import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";
import { removeCreatedLeadPhotos, saveLeadPhotos } from "@/lib/lead-upload";
import { sameOrigin } from "@/lib/same-origin";
import { createTradeInLead, type LeadRequestType, type TradeInInput } from "@/lib/trade-in-service";

const leadSchema = z.object({
  requestType: z.enum(["trade_in", "installment"]), name: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(10).max(40).regex(/^[+()\d\s-]+$/), city: z.enum(["samara", "moscow", "saint-petersburg", "orenburg"]),
  brand: z.string().trim().max(120).default(""), deviceType: z.string().trim().max(120).default(""), device: z.string().trim().max(180).default(""),
  configuration: z.string().trim().max(120).default(""), color: z.string().trim().max(120).default(""), batteryHealth: z.number().int().min(0).max(100).nullable().default(null),
  equipment: z.array(z.string().trim().min(1).max(80)).max(10).default([]), condition: z.string().trim().max(80).default(""),
  comment: z.string().trim().max(1500).default(""), desiredDevice: z.string().trim().max(240).default(""),
  productId: z.string().max(120).optional(), productSlug: z.string().max(160).regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/).optional(),
  personalDataConsent: z.literal(true), privacyConsent: z.literal(true),
}).superRefine((value, context) => {
  if (!/^7\d{10}$/.test(value.phone.replace(/\D/g, ""))) context.addIssue({ code: "custom", path: ["phone"], message: "invalid" });
});

const rateWindow = new Map<string, { start: number; count: number }>();
const rateWindowMs = 15 * 60 * 1000;
function isRateLimited(request: Request) {
  const ip = request.headers.get("x-real-ip")?.slice(0, 80) ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim().slice(0, 80) ?? "unknown";
  const now = Date.now(), current = rateWindow.get(ip);
  if (!current || now - current.start >= rateWindowMs) {
    rateWindow.set(ip, { start: now, count: 1 });
    if (rateWindow.size > 10000) for (const [key, value] of Array.from(rateWindow.entries())) if (now - value.start >= rateWindowMs) rateWindow.delete(key);
    return false;
  }
  current.count += 1; return current.count > 5;
}
function field(form: FormData, key: string) { const value = form.get(key); return typeof value === "string" ? value : ""; }

async function parseLeadRequest(request: Request, requestType: LeadRequestType) {
  if ((request.headers.get("content-type") ?? "").startsWith("multipart/form-data")) {
    if (Number(request.headers.get("content-length") ?? 0) > 52 * 1024 * 1024) throw new Error("REQUEST_TOO_LARGE");
    const form = await request.formData();
    const battery = field(form, "batteryHealth");
    return { raw: { requestType, name: field(form,"name"), phone: field(form,"phone"), city: field(form,"city"), brand: field(form,"brand"), deviceType: field(form,"deviceType"), device: field(form,"device"), configuration: field(form,"configuration"), color: field(form,"color"), batteryHealth: battery ? Number(battery) : null, equipment: form.getAll("equipment").filter((item): item is string => typeof item === "string"), condition: field(form,"condition"), comment: field(form,"comment"), desiredDevice: field(form,"desiredDevice"), productId: field(form,"productId") || undefined, productSlug: field(form,"productSlug") || undefined, personalDataConsent: field(form,"personalDataConsent") === "true", privacyConsent: field(form,"privacyConsent") === "true" }, photos: form.getAll("photos").filter((item): item is File => item instanceof File) };
  }
  const text = await request.text();
  if (text.length > 12000) throw new Error("REQUEST_TOO_LARGE");
  const legacy = JSON.parse(text) as Record<string, unknown>;
  return { raw: { ...legacy, requestType, brand: legacy.brand ?? "", deviceType: legacy.deviceType ?? "", configuration: legacy.configuration ?? "", color: legacy.color ?? "", batteryHealth: legacy.batteryHealth ?? null, equipment: legacy.equipment ?? [], desiredDevice: legacy.desiredDevice ?? "" }, photos: [] as File[] };
}

export async function handleLeadPost(request: Request, requestType: LeadRequestType) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "ORIGIN_REJECTED" }, { status: 403 });
  if (isRateLimited(request)) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429, headers: { "retry-after": "900" } });
  const key = request.headers.get("idempotency-key") ?? "";
  if (!/^[\w-]{16,128}$/.test(key)) return NextResponse.json({ error: "INVALID_IDEMPOTENCY_KEY" }, { status: 400 });
  try {
    const submitted = await parseLeadRequest(request, requestType);
    const parsed = leadSchema.safeParse(submitted.raw);
    if (!parsed.success) return NextResponse.json({ error: "INVALID_REQUEST", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
    const savedPhotos = await saveLeadPhotos(submitted.photos, key);
    let result;
    try { result = await createTradeInLead({ ...parsed.data, photoUrls: savedPhotos.urls }, key); }
    catch (error) { await removeCreatedLeadPhotos(savedPhotos.createdFiles); throw error; }
    return NextResponse.json(result, { status: result.replayed ? 200 : 201, headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (["INVALID_UPLOAD", "REQUEST_TOO_LARGE", "CITY_UNAVAILABLE", "PRODUCT_UNAVAILABLE", "IDEMPOTENCY_CONFLICT"].includes(message)) return NextResponse.json({ error: message }, { status: message === "IDEMPOTENCY_CONFLICT" ? 409 : message === "REQUEST_TOO_LARGE" ? 413 : 400 });
    if (error instanceof SyntaxError) return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
    console.error("lead request save failed", { name: error instanceof Error ? error.name : "UnknownError" });
    return NextResponse.json({ error: "TRADE_IN_UNAVAILABLE" }, { status: 503 });
  }
}
