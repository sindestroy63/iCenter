import { collectionDelete, collectionGet, collectionPatch, collectionPost } from "@/lib/admin-product-collection-route";

export const dynamic = "force-dynamic";

export async function GET(request: Request) { return collectionGet(request, "best_offers"); }
export async function POST(request: Request) { return collectionPost(request, "best_offers"); }
export async function PATCH(request: Request) { return collectionPatch(request, "best_offers"); }
export async function DELETE(request: Request) { return collectionDelete(request, "best_offers"); }
