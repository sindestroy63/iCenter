import AdminCityInventory from "@/components/AdminCityInventory";
import AdminEmployeesBackend from "@/components/AdminEmployeesBackend";
import AdminProductsBackend from "@/components/AdminProductsBackend";
import AdminRequestsBackend from "@/components/AdminRequestsBackend";
import AdminTaxonomyBackend from "@/components/AdminTaxonomyBackend";
import AdminCitiesBackend from "@/components/AdminCitiesBackend";
import AdminBannersBackend from "@/components/AdminBannersBackend";
import AdminBestOffersBackend from "@/components/AdminBestOffersBackend";
import AdminSettingsBackend from "@/components/AdminSettingsBackend";
import AdminDictionaries from "@/components/AdminDictionaries";
import AdminMediaBackend from "@/components/AdminMediaBackend";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AdminSection({ params }: { params: { slug: string[] } }) {
  const path = `/admin/${params.slug.join("/")}`;
  const requestHeaders = await headers();
  const isLogin = requestHeaders.get("x-icenter-admin-login") === "1";
  if (isLogin) redirect("/admin/login");

  switch (params.slug[0]) {
    case "requests":
      return <AdminRequestsBackend />;
    case "products":
      return <AdminProductsBackend />;
    case "employees":
      return <AdminEmployeesBackend />;
    case "inventory":
      return <AdminCityInventory />;
    case "categories":
      return <AdminTaxonomyBackend type="categories" />;
    case "brands":
      return <AdminTaxonomyBackend type="brands" />;
    case "cities":
      return <AdminCitiesBackend />;
    case "banners":
      return <AdminBannersBackend />;
    case "best-offers":
      return <AdminBestOffersBackend />;
    case "settings":
      return <AdminSettingsBackend />;
    case "media":
      return <AdminMediaBackend />;
    case "colors":
      return <AdminDictionaries initialCode="color" />;
    case "product-types":
      return <AdminDictionaries initialCode="productType" />;
    case "dictionaries":
      redirect("/admin/dictionaries");
    default:
      return <section className="admin-content"><header className="admin-page-heading"><div><h1>Раздел пока недоступен</h1><p>{path}</p></div></header><p>Для этого раздела ещё не подключено серверное хранилище. Изменения не принимаются.</p></section>;
  }
}
