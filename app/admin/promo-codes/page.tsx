import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import AdminPromoCodesBackend from "@/components/AdminPromoCodesBackend";
export const dynamic = "force-dynamic";
export default async function PromoCodesPage() { const session = await getSession(); if (!session) redirect("/admin/login"); if (session.role === "CITY_MANAGER") redirect("/admin"); return <AdminPromoCodesBackend />; }
