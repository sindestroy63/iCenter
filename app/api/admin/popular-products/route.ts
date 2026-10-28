import { collectionDelete, collectionGet, collectionPatch, collectionPost } from "@/lib/admin-product-collection-route";

export const dynamic = "force-dynamic";

export async function GET(request: Request) { return collectionGet(request, "popular_products"); }
export async function POST(request: Request) { return collectionPost(request, "popular_products"); }
export async function PATCH(request: Request) { return collectionPatch(request, "popular_products"); }
export async function DELETE(request: Request) { return collectionDelete(request, "popular_products"); }
