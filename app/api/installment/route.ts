import { handleLeadPost } from "@/lib/lead-request-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) { return handleLeadPost(request, "installment"); }
