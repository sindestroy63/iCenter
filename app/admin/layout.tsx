import { AdminShell } from "@/components/AdminShell";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { headers } from "next/headers";

export default async function AdminLayout({children}:{children:React.ReactNode}){
  const requestHeaders = await headers();
  const isLogin = requestHeaders.get("x-icenter-admin-login") === "1";
  if (isLogin) return <>{children}</>;
  const session = await getSession();
  if (!session) redirect("/admin/login");
  const routePath = requestHeaders.get("x-icenter-admin-path") ?? "/admin";
  if (session.role === "CITY_MANAGER" && routePath !== "/admin" && routePath !== "/admin/requests" && routePath !== "/admin/inventory" && routePath !== "/admin/profile") redirect("/admin");
  const isPasswordPage = requestHeaders.get("x-icenter-admin-change-password") === "1";
  if (session.mustChangePassword && !isPasswordPage) redirect("/admin/change-password");
  if (!session.mustChangePassword && isPasswordPage) redirect("/admin");
  return <AdminShell>{children}</AdminShell>;
}
