import { publicCollectionGet } from "@/lib/public-product-collection";

export const dynamic = "force-dynamic";
export async function GET(request: Request) { return publicCollectionGet(request, "popular_products"); }
